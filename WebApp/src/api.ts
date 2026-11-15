import type { Tokens, User } from './types';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code = '', public data: Record<string, unknown> = {}) { super(message); }
}
const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const SESSION = 'madds.web.session.v1';
type Session = { refreshToken: string; user: User; refreshAttemptId?: string };
let accessToken = '';
let revision = 0;
let refreshing: Promise<void> | null = null;
export const sessionEvent = 'madds-session';
export function storedSession(): Session | null {
  try { const value = JSON.parse(localStorage.getItem(SESSION) || 'null'); return value?.refreshToken && value?.user?.id ? value : null; }
  catch { return null; }
}
export function setSession(tokens: Tokens) {
  revision++;
  accessToken = tokens.accessToken;
  localStorage.setItem(SESSION, JSON.stringify({ refreshToken: tokens.refreshToken, user: tokens.user }));
  window.dispatchEvent(new Event(sessionEvent));
}
export function clearSession() {
  revision++; accessToken = ''; localStorage.removeItem(SESSION);
  window.dispatchEvent(new Event(sessionEvent));
}
export function updateUser(user: User) {
  const current = storedSession();
  if (current?.user.id === user.id) {
    localStorage.setItem(SESSION, JSON.stringify({ ...current, user }));
    window.dispatchEvent(new Event(sessionEvent));
  }
}
window.addEventListener('storage', e => {
  if (e.key === SESSION) { accessToken = ''; revision++; window.dispatchEvent(new Event(sessionEvent)); }
});
async function decode(response: Response) {
  if (response.status === 204) return undefined;
  const body = await response.text();
  try { return JSON.parse(body); } catch { return { error: response.status === 429 ? 'Too many requests. Please wait a moment and try again.' : 'The service could not complete this request. Please try again.' }; }
}
async function send(path: string, init: RequestInit, token?: string, timeout = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const abort = () => controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  if (init.signal?.aborted) controller.abort();
  try {
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    // The private review host authenticates same-origin requests with its own
    // cookie. Never send those cookies to a separate backend origin.
    const response = await fetch(`${base}${path}`, { ...init, headers, signal: controller.signal, cache: 'no-store', credentials: 'same-origin' });
    return response;
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError(navigator.onLine ? 'Connection interrupted. Please try again. Your session is still saved.' : 'You’re offline. Reconnect to continue.', 0, 'NETWORK_ERROR');
  } finally { clearTimeout(timer); init.signal?.removeEventListener('abort', abort); }
}
async function refreshSession() {
  if (refreshing) return refreshing;
  const recover = async () => {
    const current = storedSession();
    if (!current) throw new ApiError('Sign in to continue.', 401);
    const startRevision = revision;
    const attempt = current.refreshAttemptId || crypto.randomUUID();
    localStorage.setItem(SESSION, JSON.stringify({ ...current, refreshAttemptId: attempt }));
    const response = await send('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: current.refreshToken, refreshAttemptId: attempt }) });
    const data = await decode(response);
    if (revision !== startRevision) throw new ApiError('Your account changed. Please retry.', 409);
    if (!response.ok) {
      // A network error or server outage must never erase a recoverable session.
      if (response.status === 401 && data.code === 'SESSION_INVALID') clearSession();
      throw new ApiError(data.error || 'Could not restore your session. Please retry.', response.status, data.code);
    }
    setSession(data as Tokens);
  };
  // Serialize rotation across tabs where Web Locks are available.
  refreshing = (async () => {
    if ('locks' in navigator) await navigator.locks.request('madds-session-refresh', async () => { await recover(); });
    else await recover();
  })().finally(() => { refreshing = null; });
  return refreshing;
}
export async function api<T>(path: string, init: RequestInit = {}, auth = false, timeout?: number, retried = false): Promise<T> {
  if (auth && !accessToken) await refreshSession();
  const requestRevision = revision;
  const requestOwner = auth ? storedSession()?.user.id : undefined;
  const response = await send(path, init, auth ? accessToken : undefined, timeout);
  const data = await decode(response);
  if (auth && storedSession()?.user.id !== requestOwner) throw new ApiError('Your account changed. Please retry.', 409);
  if (auth && !retried && response.status === 401) {
    await refreshSession();
    return api<T>(path, init, auth, timeout, true);
  }
  if (auth && revision !== requestRevision && !response.ok) throw new ApiError('Your session changed. Please retry.', 409);
  if (!response.ok) throw new ApiError(data?.error || data?.message || 'Something went wrong. Please try again.', response.status, data?.code, data);
  return data as T;
}
export const jsonBody = (body: unknown, method = 'POST'): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export async function authBlob(path: string, signal?: AbortSignal) {
  if (!accessToken) await refreshSession();
  let response = await send(path, { signal }, accessToken);
  if (response.status === 401) { await refreshSession(); response = await send(path, { signal }, accessToken); }
  if (!response.ok) { const data = await decode(response); throw new ApiError(data?.error || 'This photo is no longer available.', response.status); }
  return response.blob();
}
