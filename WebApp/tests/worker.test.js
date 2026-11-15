import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../worker/index.js';
beforeEach(() => {
  vi.stubGlobal('assets', { '/index.html': { type: 'text/html', body: btoa('<h1>Madds</h1>') } });
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true })));
});
afterEach(() => vi.unstubAllGlobals());
describe('private review hosting', () => {
  it('serves SPA deep links without redirecting to a missing HTML file', async () => {
    const r = await worker.fetch(new Request('https://example.test/style/portrait'));
    expect(r.status).toBe(200); expect(await r.text()).toContain('Madds');
    expect(r.headers.get('Content-Security-Policy')).toContain("object-src 'none'");
  });
  it('does not expose administrator, billing or arbitrary upstream endpoints', async () => {
    for (const path of ['/api/admin/users', '/api/billing/purchase', '/api/proxy?url=https://example.com']) {
      expect((await worker.fetch(new Request(`https://example.test${path}`))).status).toBe(404);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects cross-origin API submissions', async () => {
    const r = await worker.fetch(new Request('https://example.test/api/auth/login', { method: 'POST', headers: { Origin: 'https://other.test' }, body: '{}' }));
    expect(r.status).toBe(403); expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves authorization and idempotency but never forwards browser cookies', async () => {
    const r = await worker.fetch(new Request('https://example.test/api/generate', { method: 'POST', headers: { Authorization: 'Bearer example', Cookie: 'private=example', 'Idempotency-Key': 'same-request', 'X-Generation-Recovery': '1' }, body: 'reference' }));
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://picme-ai.onrender.com/api/generate');
    expect(options.headers.get('Authorization')).toBe('Bearer example');
    expect(options.headers.get('Idempotency-Key')).toBe('same-request');
    expect(options.headers.has('Cookie')).toBe(false);
  });
});
