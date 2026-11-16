import { describe, expect, it } from 'vitest';
import { groupStyles, groupSearchNames, validateGroup, type GroupRecord } from './styleGroups.js';
import { searchStyles } from './styleSearch.js';
import { orderDiscoveryStyles } from './discoveryOrder.js';
import type { Style } from './styleTypes.js';
const one = { id: 'lavender', name: 'Lavender saree', description: 'Soft light', tags: ['lavender', 'saree'], collections: ['Fashion'], thumbnail: 'lavender.jpg', tokensRequired: 10, imageCount: 1 } as Style;
const two = { ...one, id: 'pink', name: 'Pink saree', tags: ['pink', 'saree'], thumbnail: 'pink.jpg', tokensRequired: 15, imageCount: 2, collections: ['Trending', 'Fashion'] } as Style;
const lone = { ...one, id: 'other', name: 'Other' };
const group: GroupRecord = { id: 'family', name: 'Pastel Saree Editorial', coverStyleId: one.id, published: true, members: [{ styleId: two.id, label: 'Rose' }, { styleId: one.id, label: 'Lavender' }] };
describe('Grouped style projection', () => {
  it('emits one real style ID with the selected cover and ordered, independent variants', () => {
    const cards = groupStyles([two, lone, one], [one, two, lone], [group]);
    expect(cards.map(card => card.id)).toEqual([one.id, lone.id]);
    expect(cards[0].group?.variants.map(variant => [variant.id, variant.variantLabel, variant.tokensRequired, variant.imageCount])).toEqual([[two.id, 'Rose', 15, 2], [one.id, 'Lavender', 10, 1]]);
    expect(cards[0].group?.variants.every(variant => !variant.group)).toBe(true);
    expect(one).not.toHaveProperty('group');
  });
  it('filters before grouping and never exposes ineligible, deleted or unverified members', () => {
    expect(groupStyles([one], [one], [group])).toEqual([one]);
    expect(groupStyles([one, lone], [one, lone], [group]).map(card => card.id)).toEqual([one.id, lone.id]);
    expect(groupStyles([one, two], [one, two], [{ ...group, published: false }])).toEqual([one, two]);
    expect(groupStyles([one, two], [one, two], [{ ...group, archived: true }])).toEqual([one, two]);
  });
  it('opens a search-matching variant and keeps other eligible variants available', () => {
    const matches = searchStyles([one, two], 'pink saree', groupSearchNames([group]));
    const cards = groupStyles(matches, [one, two], [group], true);
    expect(cards).toHaveLength(1); expect(cards[0].id).toBe(two.id); expect(cards[0].group?.variants).toHaveLength(2);
    expect(searchStyles([one, two], 'pastel rose', groupSearchNames([group])).map(style => style.id)).toEqual([two.id]);
  });
  it('groups before pagination and uses the stable group ID for seeded discovery', () => {
    const cards = groupStyles([two, lone, one], [one, two, lone], [group]);
    expect(cards.slice(0, 1)).toHaveLength(1); expect(cards.slice(1, 2)[0].id).toBe(lone.id);
    const ranked = orderDiscoveryStyles(cards, 'session-one', true);
    expect(ranked[0].group?.id).toBe('family');
    expect(orderDiscoveryStyles(cards, 'session-one', true)).toEqual(ranked);
  });
  it('rejects duplicate members, invalid covers and excessive options', () => {
    const input = { ...group, members: group.members };
    expect(validateGroup(input).value?.members).toEqual(group.members);
    expect(validateGroup({ ...input, coverStyleId: 'missing' }).error).toBeTruthy();
    expect(validateGroup({ ...input, members: [group.members[0], group.members[0]] }).error).toBeTruthy();
    expect(validateGroup({ ...input, members: Array.from({ length: 9 }, (_, i) => ({ styleId: `style-${i}`, label: '' })) }).error).toBeTruthy();
  });
});
