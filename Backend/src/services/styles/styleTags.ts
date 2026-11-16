export const MAX_STYLE_TAGS = 10;
export const MAX_STYLE_TAG_LENGTH = 40;
export const tagAliases: Record<string, string> = {
  sari: 'saree', saari: 'saree', saris: 'saree', sarees: 'saree',
  lehanga: 'lehenga', deepavali: 'diwali', deepawali: 'diwali', watercolour: 'watercolor', grey: 'gray',
};
export const suggestedStyleTags = ['saree', 'lehenga', 'kurta', 'suit', 'dress', 'silk', 'chiffon', 'banarasi',
  'red', 'lavender', 'black', 'white', 'gold', 'blue', 'green', 'pink', 'pastel', 'wedding', 'bridal',
  'diwali', 'birthday', 'beach', 'studio', 'garden', 'city', 'cinematic', 'vintage', 'romantic', 'editorial',
  'elegant', 'flash', 'mirror selfie', 'golden hour', 'collage', 'sketch', 'watercolor', 'portrait'];

export function canonicalTag(value: string): string {
  const normalized = value.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ');
  return Object.hasOwn(tagAliases, normalized) ? tagAliases[normalized] : normalized;
}
export function validateStyleTags(input: unknown): { tags: string[]; error?: string } {
  if (!Array.isArray(input) || input.length > 50 || input.some(value => typeof value !== 'string')) return { tags: [], error: 'Tags must be a list of words or phrases.' };
  const tags = [...new Set(input.map(canonicalTag))];
  if (tags.some(tag => !tag || tag.length > MAX_STYLE_TAG_LENGTH || !/^[\p{L}\p{N}]+(?:[ '-][\p{L}\p{N}]+)*$/u.test(tag))) {
    return { tags: [], error: 'Each tag must be 1–40 characters using letters, numbers, spaces, hyphens or apostrophes.' };
  }
  return tags.length > MAX_STYLE_TAGS ? { tags: [], error: 'Use no more than 10 tags per style.' } : { tags };
}
