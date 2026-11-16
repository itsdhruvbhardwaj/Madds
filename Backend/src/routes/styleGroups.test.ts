import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { StyleGroup } from '../models/StyleGroup.js';
import { CatalogStyle } from '../models/CatalogStyle.js';
import { CatalogAuditLog } from '../models/CatalogAuditLog.js';
vi.mock('../middleware/auth.js', () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.user = { email: req.headers.authorization === 'Bearer outsider' ? 'other@example.com' : 'admin@example.com', emailVerified: req.headers.authorization !== 'Bearer unverified', name: 'Editor' }; next();
} }));
vi.mock('../services/styles/catalog.js', async original => ({ ...await original<any>(), catalogDatabaseReady: () => true }));
import { adminCatalogRouter } from './adminCatalog.js';
const app = express(); app.use(express.json()); app.use('/admin', adminCatalogRouter);
const input = { name: 'Pastel Saree', coverStyleId: 'pink', members: [{ styleId: 'pink', label: 'Rose' }, { styleId: 'lavender', label: 'Lavender' }], published: true };
const query = (result: unknown) => ({ session: () => ({ lean: async () => result }) });
describe('Studio group writes', () => {
  beforeEach(() => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
    vi.spyOn(StyleGroup, 'init').mockResolvedValue(StyleGroup);
    vi.spyOn(mongoose, 'startSession').mockResolvedValue({ withTransaction: async (fn: any) => fn(), endSession: vi.fn() } as any);
    vi.spyOn(CatalogStyle, 'find').mockReturnValue({ select: () => query([{ id: 'pink', verified: true }, { id: 'lavender', verified: true }]) } as any);
    vi.spyOn(StyleGroup, 'findOne').mockReturnValue(query(null) as any);
    vi.spyOn(StyleGroup, 'create').mockImplementation(async (rows: any) => rows as any);
    vi.spyOn(StyleGroup, 'findOneAndUpdate').mockReturnValue({ lean: async () => ({ id: 'group-one', ...input }) } as any);
    vi.spyOn(CatalogAuditLog, 'create').mockResolvedValue([] as any);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  const post = (body: unknown = input, token = 'admin') => request(app).post('/admin/catalog/groups').set('Authorization', `Bearer ${token}`).send(body as any);
  it('requires verified administrator access', async () => {
    expect((await request(app).post('/admin/catalog/groups').send(input)).status).toBe(401);
    expect((await post(input, 'outsider')).status).toBe(403);
    expect((await post(input, 'unverified')).status).toBe(403);
    expect(StyleGroup.create).not.toHaveBeenCalled();
  });
  it('creates ordered references and an audit record in the same transaction', async () => {
    expect((await post()).status).toBe(201);
    const [rows, options] = vi.mocked(StyleGroup.create).mock.calls[0] as any;
    expect(rows[0]).toMatchObject({ ...input, archived: false });
    expect(rows[0]).not.toHaveProperty('prompt');
    expect(CatalogAuditLog.create).toHaveBeenCalledWith([expect.objectContaining({ action: 'GROUP_CREATED' })], { session: options.session, ordered: true });
  });
  it('rejects duplicate membership and concurrent unique-index conflicts', async () => {
    vi.mocked(StyleGroup.findOne).mockReturnValueOnce(query({ id: 'other' }) as any);
    expect((await post()).status).toBe(409); expect(StyleGroup.create).not.toHaveBeenCalled();
    vi.mocked(StyleGroup.create).mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: 11000 }));
    expect((await post()).status).toBe(409); expect(CatalogAuditLog.create).not.toHaveBeenCalled();
  });
  it('requires a verified cover and two verified members when published', async () => {
    vi.mocked(CatalogStyle.find).mockReturnValue({ select: () => query([{ id: 'pink', verified: false }, { id: 'lavender', verified: true }]) } as any);
    expect((await post()).status).toBe(409); expect(StyleGroup.create).not.toHaveBeenCalled();
    expect((await post({ ...input, published: false })).status).toBe(201);
  });
  it('rejects deleted members, malformed groups and stale edits', async () => {
    vi.mocked(CatalogStyle.find).mockReturnValueOnce({ select: () => query([]) } as any);
    expect((await post()).status).toBe(409);
    expect((await post({ ...input, members: [input.members[0], input.members[0]] })).status).toBe(400);
    vi.mocked(StyleGroup.findOneAndUpdate).mockReturnValueOnce({ lean: async () => null } as any);
    expect((await request(app).put('/admin/catalog/groups/group-one').set('Authorization', 'Bearer admin').send({ ...input, expectedUpdatedAt: '2026-11-16T00:00:00Z' })).status).toBe(409);
    expect(CatalogAuditLog.create).not.toHaveBeenCalled();
  });
  it('archives only group metadata and preserves original styles', async () => {
    const deletion = vi.spyOn(CatalogStyle, 'deleteMany');
    const result = await request(app).delete('/admin/catalog/groups/group-one').set('Authorization', 'Bearer admin').send({ expectedUpdatedAt: '2026-11-16T00:00:00Z' });
    expect(result.status).toBe(200);
    expect(StyleGroup.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'group-one', updatedAt: expect.any(Date) }), { $set: { archived: true, published: false } }, expect.anything());
    expect(deletion).not.toHaveBeenCalled();
    expect(CatalogAuditLog.create).toHaveBeenCalledWith([expect.objectContaining({ action: 'GROUP_ARCHIVED' })], expect.objectContaining({ ordered: true }));
  });
});
