import mongoose from 'mongoose';
import { StyleGroup } from '../../models/StyleGroup.js';
import type { Style } from './styleTypes.js';

export interface GroupRecord { id: string; name: string; coverStyleId: string; members: { styleId: string; label: string }[]; published: boolean; archived?: boolean }
export function validateGroup(input: unknown): { value?: Omit<GroupRecord, 'id'>; error?: string } {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 2 || name.length > 80) return { error: 'Use a group name of 2–80 characters.' };
  if (typeof body.published !== 'boolean') return { error: 'Choose draft or published.' };
  if (!Array.isArray(body.members) || body.members.length < 2 || body.members.length > 8) return { error: 'Choose 2–8 existing styles per group.' };
  const members: GroupRecord['members'] = [];
  for (const member of body.members) {
    if (!member || typeof member.styleId !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(member.styleId) || typeof member.label !== 'string' || member.label.trim().length > 40) return { error: 'Each member needs a valid style and a label of up to 40 characters.' };
    members.push({ styleId: member.styleId, label: member.label.trim() });
  }
  if (new Set(members.map(member => member.styleId)).size !== members.length) return { error: 'Choose each style only once.' };
  if (typeof body.coverStyleId !== 'string' || !members.some(member => member.styleId === body.coverStyleId)) return { error: 'Choose a cover from the group members.' };
  return { value: { name, members, coverStyleId: body.coverStyleId, published: body.published } };
}
export async function listPublishedGroups(): Promise<GroupRecord[]> {
  if (mongoose.connection.readyState !== 1) return [];
  return StyleGroup.find({ archived: false, published: true }, null, { maxTimeMS: 5000 }).lean();
}
export function groupSearchNames(groups: GroupRecord[]): Record<string, string> {
  return Object.fromEntries(groups.filter(group => group.published && !group.archived).flatMap(group => group.members.map(member => [member.styleId, `${group.name} ${member.label}`])));
}
export function groupStyles(matches: Style[], eligible: Style[], groups: GroupRecord[], searching = false): Style[] {
  const published = groups.filter(group => group.published && !group.archived);
  const names = new Map(published.flatMap(group => group.members.map(member => [member.styleId, group.name] as const)));
  const byId = new Map(eligible.map(style => [style.id, style]));
  const byMember = new Map<string, { record: GroupRecord; variants: Style[] }>();
  for (const record of published) {
    const variants = record.members.flatMap(member => {
      const style = byId.get(member.styleId);
      if (!style) return [];
      const { group: _group, ...plain } = style;
      return [{ ...plain, groupName: record.name, variantLabel: member.label || style.name }];
    });
    if (variants.length < 2) continue;
    for (const variant of variants) byMember.set(variant.id, { record, variants });
  }
  const emitted = new Set<string>();
  return matches.flatMap(style => {
    const family = byMember.get(style.id);
    if (!family) return [names.has(style.id) ? { ...style, groupName: names.get(style.id) } : style];
    if (emitted.has(family.record.id)) return [];
    emitted.add(family.record.id);
    const selected = searching ? style : family.variants.find(member => member.id === family.record.coverStyleId) || family.variants[0];
    return [{ ...selected, groupName: family.record.name, group: { id: family.record.id, name: family.record.name, coverStyleId: family.record.coverStyleId, variants: family.variants } }];
  });
}
