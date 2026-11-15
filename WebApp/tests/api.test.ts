import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const user = { id: 'user-a', name: 'Test User', email: 'test@example.invalid', credits: 20, emailVerified: true };
const SESSION = 'madds.web.session.v1';
let values: Map<string, string>;
let request: ReturnType<typeof vi.fn>;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  vi.resetModules(); values = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { onLine: true });
  request = vi.fn(); vi.stubGlobal('fetch', request);
  values.set(SESSION, JSON.stringify({ refreshToken: 'test-refresh', user }));
});
afterEach(() => vi.unstubAllGlobals());
describe('Madds web session recovery', () => {
  it('keeps a recoverable session and the same rotation attempt after a network interruption', async () => {
    request.mockRejectedValueOnce(new TypeError('network'));
    const { api } = await import('../src/api');
    await expect(api('/api/auth/me', {}, true)).rejects.toMatchObject({ status: 0 });
    const first = JSON.parse(values.get(SESSION)!);
    expect(first.refreshToken).toBe('test-refresh'); expect(first.refreshAttemptId).toBeTruthy();
    request.mockResolvedValueOnce(response({ accessToken: 'access', refreshToken: 'rotated', user })).mockResolvedValueOnce(response({ user }));
    await api('/api/auth/me', {}, true);
    expect(JSON.parse(request.mock.calls[1][1].body).refreshAttemptId).toBe(first.refreshAttemptId);
    expect(JSON.parse(values.get(SESSION)!).refreshToken).toBe('rotated');
  });
  it('does not log the user out when session recovery gets a service error', async () => {
    request.mockResolvedValue(response({ error: 'Unavailable', code: 'SESSION_SERVICE_UNAVAILABLE' }, 503));
    const { api } = await import('../src/api');
    await expect(api('/api/auth/me', {}, true)).rejects.toMatchObject({ status: 503 });
    expect(JSON.parse(values.get(SESSION)!).user.id).toBe('user-a');
  });
  it('clears a definitively invalid refresh session', async () => {
    request.mockResolvedValue(response({ error: 'Expired', code: 'SESSION_INVALID' }, 401));
    const { api } = await import('../src/api');
    await expect(api('/api/auth/me', {}, true)).rejects.toMatchObject({ status: 401 });
    expect(values.has(SESSION)).toBe(false);
  });
  it('shares one refresh request between concurrent protected requests', async () => {
    request.mockImplementation(async (path: string) => path.endsWith('/refresh') ? response({ accessToken: 'access', refreshToken: 'rotated', user }) : response({ user }));
    const { api } = await import('../src/api');
    await Promise.all([api('/api/auth/me', {}, true), api('/api/me/favorites', {}, true)]);
    expect(request.mock.calls.filter(([path]) => path.endsWith('/refresh'))).toHaveLength(1);
  });
  it('allows the hosting session on same-origin API calls without including cross-origin cookies', async () => {
    request.mockResolvedValue(response({ collections: [] }));
    const { api } = await import('../src/api');
    await api('/api/collections');
    expect(request.mock.calls[0][1].credentials).toBe('same-origin');
  });
  it('retries expired access only once instead of entering an infinite refresh loop', async () => {
    request.mockImplementation(async (path: string) => path.endsWith('/refresh') ? response({ accessToken: 'access', refreshToken: 'rotated', user }) : response({ error: 'Expired', code: 'ACCESS_TOKEN_INVALID' }, 401));
    const { api } = await import('../src/api');
    await expect(api('/api/auth/me', {}, true)).rejects.toMatchObject({ status: 401 });
    expect(request).toHaveBeenCalledTimes(4);
  });
  it('rejects a private response after the user switches accounts', async () => {
    const { api, setSession } = await import('../src/api');
    setSession({ accessToken: 'access', refreshToken: 'refresh', user });
    request.mockImplementation(async () => {
      setSession({ accessToken: 'other', refreshToken: 'other-refresh', user: { ...user, id: 'user-b' } });
      return response({ privatePhoto: 'test' });
    });
    await expect(api('/api/generations', {}, true)).rejects.toMatchObject({ status: 409 });
  });
});
