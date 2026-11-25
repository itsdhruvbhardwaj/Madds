import { describe, expect, it } from 'vitest';
import { validateStyleTags } from './styleTags.js';
import { searchStyles } from './styleSearch.js';

describe('Style tags and discovery search', () => {
  it('normalizes aliases, Unicode and whitespace, and deduplicates without adding tags', () => {
    expect(validateStyleTags(['  SARI ', 'saree', 'Mirror   Selfie', 'ＤＩＷＡＬＩ', 'Grey']).tags).toEqual(['saree', 'mirror selfie', 'diwali', 'gray']);
    expect(validateStyleTags([])).toEqual({ tags: [] });
    expect(validateStyleTags(['constructor', 'toString']).tags).toEqual(['constructor', 'tostring']);
  });
  it('rejects wrong types, oversized sets and executable markup', () => {
    for (const tags of [null, 'saree', [true], [''], ['a'.repeat(41)], ['<img onerror=alert(1)>'], Array.from({ length: 11 }, (_, i) => `tag ${i}`)]) expect(validateStyleTags(tags).error).toBeTruthy();
  });
  it('matches all query words across name, tags and collection, with synonyms and prefixes', () => {
    const style = { name: 'Golden portrait', description: 'Soft light', collections: ['Wedding'], tags: ['red', 'saree'] };
    expect(searchStyles([style], 'red wedding sari')).toEqual([style]);
    expect(searchStyles([style], 'sare')).toEqual([style]);
    expect(searchStyles([style], 'blue saree')).toEqual([]);
  });
  it('ranks names above tags above descriptions, preserves ties and leaves normal browsing untouched', () => {
    const styles = [
      { name: 'Description match', description: 'Saree', collections: [], tags: [] },
      { name: 'Tag match one', description: '', collections: [], tags: ['saree'] },
      { name: 'Saree', description: '', collections: [], tags: [] },
      { name: 'Tag match two', description: '', collections: [], tags: ['saree'] },
    ];
    expect(searchStyles(styles, 'sari').map(s => s.name)).toEqual(['Saree', 'Tag match one', 'Tag match two', 'Description match']);
    expect(searchStyles(styles, '')).toBe(styles);
    expect(styles[0].name).toBe('Description match');
  });
});
