import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), generate: vi.fn(), configs: [] as any[], actor: 0 }));
vi.mock('../middleware/auth.js', () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.user = { id: `owner-${mocks.actor}`, email: req.headers.authorization === 'Bearer member' ? 'member@example.com' : 'owner@example.com',
    emailVerified: req.headers.authorization !== 'Bearer unverified', name: 'Actual Owner' }; next();
} }));
vi.mock('../models/ImageGenerationSettings.js', () => ({ ImageGenerationSettings: {
  findById: () => ({ lean: mocks.read }), findOneAndUpdate: (...args: any[]) => ({ lean: () => mocks.write(...args) }),
} }));
vi.mock('file-type', () => ({ fileTypeFromBuffer: async () => ({ mime: 'image/jpeg' }) }));
vi.mock('../services/openrouter/generation.js', () => ({ OpenRouterImageGenerator: class {
  constructor(config: any) { mocks.configs.push(config); } generate = mocks.generate;
} }));
import { adminSettingsRouter } from './adminSettings.js';
import { createImageTestToken } from '../services/imageGenerationSettings.js';
const app = express(); app.use(express.json()); app.use('/admin', adminSettingsRouter);
const values = () => ({ activeModel: 'sunburst26' as const, profiles: { sunburst25: { quality: 'medium' as const }, sunburst26: { quality: 'high' as const, complexity: 'low' as const } } });
const patch = (body: any, token = 'owner') => request(app).patch('/admin/image-generation').set('Authorization', `Bearer ${token}`).send(body);
const preview = (v = values(), revision = 0) => request(app).post('/admin/image-generation/test').set('Authorization', 'Bearer owner')
  .field('prompt', 'Restyle this reference portrait.').field('settings', JSON.stringify({ ...v, expectedRevision: revision }))
  .attach('image', Buffer.from('jpeg fixture'), { filename: 'reference.jpg', contentType: 'image/jpeg' });
beforeEach(() => {
  vi.clearAllMocks(); mocks.configs.length = 0; mocks.actor++;
  vi.stubEnv('ADMIN_EMAILS', 'owner@example.com'); vi.stubEnv('JWT_ACCESS_SECRET', 'test-secret'); vi.stubEnv('OPENROUTER_API_KEY', 'private-key');
  mocks.read.mockResolvedValue(null); mocks.generate.mockResolvedValue({ base64: 'aW1hZ2U=', mimeType: 'image/png' });
  mocks.write.mockImplementation(async (filter, update) => ({ ...update.$set, revision: filter.revision + 1, history: update.$push.history.$each }));
});
afterEach(() => vi.unstubAllEnvs());
describe('Workspace image generation controls', () => {
  it('requires a verified owner from Render for read, write and preview', async () => {
    expect((await request(app).get('/admin/image-generation')).status).toBe(401);
    for (const role of ['member','unverified']) {
      expect((await patch(values(), role)).status).toBe(403);
      expect((await request(app).post('/admin/image-generation/test').set('Authorization', `Bearer ${role}`)).status).toBe(403);
    }
    expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled();
  });
  it('returns safe settings without credentials and with no browser caching', async () => {
    const res = await request(app).get('/admin/image-generation').set('Authorization', 'Bearer owner');
    expect(res.status).toBe(200); expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({ revision: 0, source: 'environment', canTest: true });
    expect(JSON.stringify(res.body)).not.toContain('private-key');
  });
  it('tests the draft without activating it and requires that approval to apply', async () => {
    expect((await patch({ ...values(), expectedRevision: 0 })).status).toBe(400);
    const test = await preview(); expect(test.status).toBe(200); expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.configs[0]).toMatchObject({ model: 'openai/gpt-image-2.6-sunburst', quality: 'high', complexity: 'low' });
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ aspectRatio: '3:4', images: [expect.objectContaining({ mimetype: 'image/jpeg' })] }));
    const applied = await patch({ ...values(), expectedRevision: 0, testToken: test.body.testToken });
    expect(applied.status).toBe(200); expect(applied.body).toMatchObject({ revision: 1, source: 'workspace' });
    expect(mocks.write.mock.calls[0][0]).toEqual({ _id: 'image-generation', revision: 0 });
    expect(mocks.write.mock.calls[0][1].$set.updatedByName).toBe('Actual Owner');
    expect(mocks.write.mock.calls[0][1].$push.history.$each[0]).toMatchObject({ revision: 1, byEmail: 'owner@example.com' });
  });
  it('rejects changed settings, unsupported parameters and stale revisions without a paid call', async () => {
    const token = createImageTestToken(`owner-${mocks.actor}`, values(), 0);
    expect((await patch({ ...values(), activeModel: 'sunburst25', expectedRevision: 0, testToken: token })).status).toBe(400);
    expect((await patch({ ...values(), expectedRevision: 0, testToken: token, provider: 'openai' })).status).toBe(400);
    mocks.read.mockResolvedValue({ ...values(), revision: 2 }); expect((await preview()).status).toBe(409);
    expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled();
  });
  it('rejects a concurrent update and first-save race', async () => {
    const body = { ...values(), expectedRevision: 0, testToken: createImageTestToken(`owner-${mocks.actor}`, values(), 0) };
    mocks.write.mockResolvedValueOnce(null); expect((await patch(body)).status).toBe(409);
    mocks.write.mockRejectedValueOnce({ code: 11000 }); expect((await patch(body)).status).toBe(409);
  });
  it('does not issue approval or activate settings after provider failure', async () => {
    mocks.generate.mockRejectedValue(Error('private provider failure'));
    const result = await preview(); expect(result.status).toBe(502); expect(result.body).not.toHaveProperty('testToken');
    expect(JSON.stringify(result.body)).not.toContain('private provider failure'); expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('returns service unavailable when settings storage fails', async () => {
    mocks.read.mockRejectedValue(Error('database down'));
    expect((await request(app).get('/admin/image-generation').set('Authorization', 'Bearer owner')).status).toBe(503);
    expect((await preview()).status).toBe(503); expect(mocks.generate).not.toHaveBeenCalled();
  });
});
