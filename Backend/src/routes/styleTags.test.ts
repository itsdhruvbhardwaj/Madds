import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { CatalogStyle } from '../models/CatalogStyle.js';
import { StyleCollection } from '../models/StyleCollection.js';
import { CloudinaryCleanup } from '../models/CloudinaryCleanup.js';
import { CatalogAuditLog } from '../models/CatalogAuditLog.js';
vi.mock('../middleware/auth.js', () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.user = { email: req.headers.authorization === 'Bearer admin' ? 'admin@example.com' : 'outsider@example.com', emailVerified: true, name: 'Editor' }; next();
} }));
vi.mock('../services/styles/catalog.js', async original => ({ ...await original<any>(), catalogDatabaseReady: () => true }));
import { adminCatalogRouter } from './adminCatalog.js';
const app = express(); app.use(express.json()); app.use('/admin', adminCatalogRouter);
const input = { id: 'portrait', name: 'Portrait', description: 'Test', prompt: 'Restyle portrait', imageCount: 1, tokensRequired: 10,
  thumbnail: 'https://res.cloudinary.com/test/image/upload/picmee/styles/portrait.jpg', thumbnailPublicId: 'picmee/styles/portrait', collections: ['Portraits'] };
describe('Style tag writes', () => {
  beforeEach(() => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
    vi.spyOn(CatalogStyle, 'exists').mockResolvedValue(null);
    vi.spyOn(CatalogStyle, 'create').mockResolvedValue({} as any);
    vi.spyOn(StyleCollection, 'updateOne').mockResolvedValue({} as any);
    vi.spyOn(CloudinaryCleanup, 'deleteMany').mockResolvedValue({} as any);
    vi.spyOn(CatalogAuditLog, 'create').mockResolvedValue({} as any);
    vi.spyOn(CatalogStyle, 'findOne').mockReturnValue({ select: () => ({ lean: async () => ({ ...input, tags: ['silk'], updatedAt: '2026-11-16T00:00:00Z' }) }) } as any);
    vi.spyOn(CatalogStyle, 'findOneAndUpdate').mockReturnValue({ lean: async () => ({}) } as any);
    vi.spyOn(mongoose, 'startSession').mockResolvedValue({ withTransaction: async (fn: any) => fn(), endSession: vi.fn() } as any);
    vi.spyOn(CatalogStyle, 'find').mockReturnValue({ select: () => ({ session: () => ({ lean: async () => [{ id: 'portrait', name: 'Portrait', tags: ['silk'] }] }) }) } as any);
    vi.spyOn(CatalogStyle, 'bulkWrite').mockResolvedValue({} as any);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  it('saves canonical tags and keeps new untagged styles compatible', async () => {
    const result = await request(app).post('/admin/catalog/styles').set('Authorization', 'Bearer admin').send({ ...input, tags: ['Sari', 'saree', 'RED'] });
    expect(result.status).toBe(201); expect(result.body.style.tags).toEqual(['saree', 'red']);
    await request(app).post('/admin/catalog/styles').set('Authorization', 'Bearer admin').send(input);
    expect(CatalogStyle.create).toHaveBeenLastCalledWith(expect.objectContaining({ tags: [] }));
  });
  it('preserves tags on legacy edits, supports explicit clearing and rejects stale writes', async () => {
    expect((await request(app).put('/admin/catalog/styles/portrait').set('Authorization', 'Bearer admin').send(input)).status).toBe(200);
    expect(vi.mocked(CatalogStyle.findOneAndUpdate).mock.calls[0][1]).not.toHaveProperty('tags');
    await request(app).put('/admin/catalog/styles/portrait').set('Authorization', 'Bearer admin').send({ ...input, tags: [] });
    expect(vi.mocked(CatalogStyle.findOneAndUpdate).mock.calls[1][1]).toHaveProperty('tags', []);
    expect((await request(app).put('/admin/catalog/styles/portrait').set('Authorization', 'Bearer admin').send({ ...input, tags: ['red'], expectedUpdatedAt: '2026-11-15T00:00:00Z' })).status).toBe(409);
    expect(CatalogStyle.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });
  it('rejects invalid tags before making database changes', async () => {
    expect((await request(app).put('/admin/catalog/styles/portrait').set('Authorization', 'Bearer admin').send({ ...input, tags: null })).status).toBe(400);
    expect(CatalogStyle.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('merges bulk tags transactionally and records ordered audit writes without changing verification', async () => {
    const response = await request(app).patch('/admin/catalog/styles/tags').set('Authorization', 'Bearer admin').send({ ids: ['portrait', 'portrait'], tags: ['Sari', 'red'] });
    expect(response.body).toMatchObject({ changed: 1, selected: 1 });
    const [operations, options] = vi.mocked(CatalogStyle.bulkWrite).mock.calls[0] as any;
    expect(operations[0].updateOne.update.$set.tags).toEqual(['silk', 'saree', 'red']);
    expect(operations[0].updateOne.update.$set).not.toHaveProperty('verified');
    expect(options).toMatchObject({ session: expect.anything(), ordered: true });
    expect(CatalogAuditLog.create).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ ordered: true, session: options.session }));
  });
  it('rejects overflow or missing selections before any bulk write', async () => {
    vi.mocked(CatalogStyle.find).mockReturnValueOnce({ select: () => ({ session: () => ({ lean: async () => [] }) }) } as any);
    expect((await request(app).patch('/admin/catalog/styles/tags').set('Authorization', 'Bearer admin').send({ ids: ['missing'], tags: ['red'] })).status).toBe(409);
    expect((await request(app).patch('/admin/catalog/styles/tags').set('Authorization', 'Bearer admin').send({ ids: ['portrait'], tags: Array.from({ length: 10 }, (_, i) => `tag ${i}`) })).status).toBe(400);
    expect(CatalogStyle.bulkWrite).not.toHaveBeenCalled(); expect(CatalogAuditLog.create).not.toHaveBeenCalled();
  });
  it('restricts bulk tagging to administrators and makes repeated additions a no-op', async () => {
    expect((await request(app).patch('/admin/catalog/styles/tags').send({ ids: ['portrait'], tags: ['red'] })).status).toBe(401);
    expect((await request(app).patch('/admin/catalog/styles/tags').set('Authorization', 'Bearer outsider').send({ ids: ['portrait'], tags: ['red'] })).status).toBe(403);
    expect((await request(app).patch('/admin/catalog/styles/tags').set('Authorization', 'Bearer admin').send({ ids: ['portrait'], tags: ['silk'] })).body.changed).toBe(0);
    expect(CatalogStyle.bulkWrite).not.toHaveBeenCalled();
  });
});
