import { tagAliases } from './styleTags.js';
type SearchableStyle = { name: string; description: string; collections: string[]; tags?: string[] };
function text(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/u).map(word => Object.hasOwn(tagAliases, word) ? tagAliases[word] : word).join(' ');
}
export function styleSearchScore(style: SearchableStyle, query: string, extraName = ''): number {
  const normalized = text(query);
  if (!normalized) return 0;
  const fields = [text(style.name), text(`${extraName} ${(style.tags || []).join(' ')}`), text(style.collections.join(' ')), text(style.description)];
  const terms = [...new Set(normalized.split(' '))];
  const matches = (field: string, term: string) => field.split(' ').some(word => word.startsWith(term));
  if (!terms.every(term => fields.some(field => matches(field, term)))) return 0;
  return (fields[0] === normalized ? 1000 : fields[0].startsWith(normalized) ? 300 : 0) +
    terms.reduce((score, term) => score + (matches(fields[0], term) ? 20 : matches(fields[1], term) ? 12 : matches(fields[2], term) ? 6 : 1), 0);
}
export function searchStyles<T extends SearchableStyle>(styles: T[], query: string, groupNames: Record<string, string> = {}): T[] {
  if (!query.trim()) return styles;
  // Stable ties keep the existing discovery seed; relevance takes priority in search.
  return styles.map(style => { const id = (style as T & { id?: string }).id || ''; return { style, score: styleSearchScore(style, query, Object.hasOwn(groupNames, id) ? groupNames[id] : '') }; })
    .filter(row => row.score > 0).sort((a, b) => b.score - a.score).map(row => row.style);
}
