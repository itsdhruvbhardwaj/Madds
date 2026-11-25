import { Router, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { StyleGroup } from '../models/StyleGroup.js';
import { CatalogStyle } from '../models/CatalogStyle.js';
import { CatalogAuditLog } from '../models/CatalogAuditLog.js';
import { validateGroup } from '../services/styles/styleGroups.js';

export const styleGroupsRouter = Router();
styleGroupsRouter.use((req: AuthenticatedRequest, res, next) => {
  if (req.user?.emailVerified !== true) return res.status(403).json({ error: 'Verified administrator access required.' });
  next();
});
styleGroupsRouter.get('/', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ groups: await StyleGroup.find({ archived: false }).sort({ name: 1 }).lean() });
});
async function save(req: AuthenticatedRequest, res: Response) {
  const validation = validateGroup(req.body);
  if (!validation.value) return res.status(400).json({ error: validation.error });
  const id = req.params.id ? String(req.params.id) : `group-${randomUUID()}`;
  if (req.params.id && (typeof req.body.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(req.body.expectedUpdatedAt)))) return res.status(400).json({ error: 'Reopen the group before saving.' });
  const value = validation.value;
  await StyleGroup.init(); // Wait for the unique membership index before concurrent writes.
  const session = await mongoose.startSession();
  try {
    const group = await session.withTransaction(async () => {
      const styles = await CatalogStyle.find({ id: { $in: value.members.map(member => member.styleId) } }).select('id verified').session(session).lean();
      if (styles.length !== value.members.length) throw new Error('Choose existing styles; a member may have been deleted.');
      if (value.published && (styles.filter(style => style.verified === true).length < 2 || !styles.some(style => style.id === value.coverStyleId && style.verified === true))) throw new Error('Publishing needs at least two verified members and a verified cover.');
      const conflict = await StyleGroup.findOne({ archived: false, id: { $ne: id }, 'members.styleId': { $in: value.members.map(member => member.styleId) } }).session(session).lean();
      if (conflict) throw new Error('A selected style already belongs to another group. Remove it there first.');
      let saved;
      if (req.params.id) {
        saved = await StyleGroup.findOneAndUpdate({ id, archived: false, updatedAt: new Date(req.body.expectedUpdatedAt) }, { $set: value }, { new: true, runValidators: true, session }).lean();
        if (!saved) throw new Error('This group changed. Reopen it before saving.');
      } else [saved] = await StyleGroup.create([{ ...value, id, archived: false }], { session });
      await CatalogAuditLog.create([{ actorEmail: req.user!.email, actorName: req.user!.name || '', action: req.params.id ? 'GROUP_UPDATED' : 'GROUP_CREATED', itemId: id, itemName: value.name }], { session, ordered: true });
      return saved;
    });
    res.status(req.params.id ? 200 : 201).json({ group });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const known = /^(Choose existing|Publishing needs|A selected style|This group changed)/.test(message);
    res.status(409).json({ error: known ? message : 'Could not save the group. A member may already be grouped; refresh and try again.' });
  } finally { await session.endSession(); }
}
styleGroupsRouter.post('/', save);
styleGroupsRouter.put('/:id', save);
styleGroupsRouter.delete('/:id', async (req: AuthenticatedRequest, res) => {
  if (typeof req.body?.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(req.body.expectedUpdatedAt))) return res.status(400).json({ error: 'Reopen the group before ungrouping.' });
  const session = await mongoose.startSession();
  try {
    const group = await session.withTransaction(async () => {
      const saved = await StyleGroup.findOneAndUpdate({ id: req.params.id, archived: false, updatedAt: new Date(req.body.expectedUpdatedAt) }, { $set: { archived: true, published: false } }, { new: true, session }).lean();
      if (!saved) return null;
      await CatalogAuditLog.create([{ actorEmail: req.user!.email, actorName: req.user!.name || '', action: 'GROUP_ARCHIVED', itemId: saved.id, itemName: saved.name }], { session, ordered: true });
      return saved;
    });
    return group ? res.json({ ok: true }) : res.status(409).json({ error: 'This group changed. Refresh before ungrouping.' });
  } finally { await session.endSession(); }
});
