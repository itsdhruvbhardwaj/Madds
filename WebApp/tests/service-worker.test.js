import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function setup() {
  const handlers = {};
  const stores = new Map();
  const caches = { open: async name => {
    if (!stores.has(name)) {
      const responses = new Map();
      stores.set(name, { match: async req => responses.get(req.url)?.clone(), put: async (req, res) => { responses.set(req.url, res); }, keys: async () => [...responses.keys()].map(url => new Request(url)), delete: async req => responses.delete(req.url) });
    }
    return stores.get(name);
  } };
  const fetch = vi.fn(async () => new Response('image', { headers: { 'Content-Type': 'image/webp' } }));
  vm.runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self: { location: { origin: 'https://madds.example' }, addEventListener: (name, fn) => { handlers[name] = fn; } }, caches, fetch, URL,
  });
  const dispatch = request => { let promise; handlers.fetch({ request, respondWith: p => { promise = p; }, waitUntil() {} }); return promise; };
  return { dispatch, fetch, caches };
}
describe('public-image offline cache', () => {
  it('serves a previously fetched style image without another network request', async () => {
    const { dispatch, fetch } = setup();
    const request = new Request('https://res.cloudinary.com/test/image/upload/v1/picmee/styles/fashion/photo.webp');
    expect(await (await dispatch(request)).text()).toBe('image');
    fetch.mockRejectedValue(new TypeError('offline'));
    expect(await (await dispatch(request)).text()).toBe('image');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('never intercepts private generation requests or profile photos', () => {
    const { dispatch, fetch } = setup();
    expect(dispatch(new Request('https://madds.example/api/generations/abc/thumbnail', { headers: { Authorization: 'Bearer example' } }))).toBeUndefined();
    expect(dispatch(new Request('https://madds.example/api/generations/abc/result'))).toBeUndefined();
    expect(dispatch(new Request('https://res.cloudinary.com/test/image/upload/v1/picmee/profiles/private.webp'))).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('bounds the public style image cache instead of growing indefinitely', async () => {
    const { dispatch, caches } = setup();
    for (let i = 0; i < 225; i++) await dispatch(new Request(`https://res.cloudinary.com/test/image/upload/v1/picmee/styles/photo-${i}.webp`));
    const keys = await (await caches.open('madds-style-images-v1')).keys();
    expect(keys).toHaveLength(220); expect(keys[0].url).toContain('photo-5.webp');
  });
});
