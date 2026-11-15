import { describe, expect, it } from 'vitest';
import { imageDataUrl, imageUrl, timeLeft } from '../src/storage';

describe('image caching and gallery expiry', () => {
  const url = 'https://res.cloudinary.com/test/image/upload/c_limit,w_900,h_1260,q_auto,f_auto/v123/picmee/styles/fashion/test.webp';
  it('uses fixed thumbnail variants and retains the versioned identity', () => {
    expect(imageUrl(url)).toBe('https://res.cloudinary.com/test/image/upload/c_limit,w_450,h_630,q_auto,f_auto/v123/picmee/styles/fashion/test.webp');
    expect(imageUrl(imageUrl(url))).toBe(imageUrl(url));
    expect(imageUrl(url, true)).toBe(url);
    expect(imageUrl('blob:local')).toBe('blob:local');
  });
  it('does not add a timestamp when requesting an unchanged image', () => {
    expect(imageUrl(url)).not.toContain('?'); expect(imageUrl(url)).toBe(imageUrl(url));
  });
  it('uses an exact expiry boundary and rounds a remaining partial minute up', () => {
    const now = Date.parse('2026-11-15T12:00:00Z');
    expect(timeLeft('2026-11-15T12:00:00Z', now)).toBe('Expired');
    expect(timeLeft('2026-11-15T12:00:01Z', now)).toBe('1m left');
    expect(timeLeft('2026-11-16T12:00:00Z', now)).toBe('24h 0m left');
    expect(timeLeft('invalid', now)).toBe('Expired');
  });
  it('rejects executable or remote content as generated image data', () => {
    expect(() => imageDataUrl('javascript:alert(1)')).toThrow();
    expect(() => imageDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toThrow();
    expect(imageDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
  });
});
