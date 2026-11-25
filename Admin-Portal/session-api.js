(() => {
  function create({ base, storage, fetcher = (...args) => fetch(...args), online = () => navigator.onLine !== false, onExpired }) {
    const accessKey = 'picmee_admin_access', refreshKey = 'picmee_admin_refresh', attemptKey = 'picmee_admin_refresh_attempt';
    let renewal = null, epoch = 0;
    const connectionError = () => Error('Cannot reach Workspace. Check your connection and try again. Your changes have not been queued.');
    async function request(url, options) {
      if (!online()) throw connectionError();
      try { return await fetcher(url, { ...options, cache: 'no-store' }); }
      catch (error) { if (error.name === 'AbortError') throw error; throw connectionError(); }
    }
    function expire(owner) {
      if (owner !== epoch) return;
      ++epoch; storage.removeItem(accessKey); storage.removeItem(refreshKey); storage.removeItem(attemptKey); onExpired();
    }
    async function renew(owner) {
      const token = storage.getItem(refreshKey);
      if (!token) { expire(owner); throw Error('Your session has ended. Please sign in again.'); }
      // Preserve the same attempt across a lost response, including a page reload.
      // The existing backend recovers that exact rotation without extending admin access.
      let attempt = storage.getItem(attemptKey);
      if (!attempt || !/^[a-zA-Z0-9_-]{16,128}$/.test(attempt)) {
        attempt = crypto.randomUUID(); storage.setItem(attemptKey, attempt);
      }
      const response = await request(`${base}/api/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: token, refreshAttemptId: attempt })
      });
      if (response.status === 401 || response.status === 403) { expire(owner); throw Error('Your session has ended. Please sign in again.'); }
      if (!response.ok) throw Error('Sign-in could not be renewed right now. Please try again shortly.');
      const credentials = await response.json().catch(() => null);
      if (!credentials?.accessToken || !credentials?.refreshToken) throw Error('Sign-in could not be renewed right now. Please try again shortly.');
      if (owner !== epoch) throw Error('Your session has changed. Please try again.');
      storage.setItem(accessKey, credentials.accessToken); storage.setItem(refreshKey, credentials.refreshToken);
      storage.removeItem(attemptKey);
    }
    async function api(path, options = {}, retry = true) {
      const owner = epoch, access = storage.getItem(accessKey), headers = new Headers(options.headers || {});
      headers.set('Accept', 'application/json');
      if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
      if (access) headers.set('Authorization', `Bearer ${access}`);
      const response = await request(`${base}${path}`, { ...options, headers });
      if (owner !== epoch) throw Error('Your session has changed. Please try again.');
      if (response.status === 401 && retry) {
        // Concurrent requests share renewal. A late 401 must not rotate the new token again.
        if (storage.getItem(accessKey) === access) {
          if (!renewal) { const pending = renew(owner); renewal = pending; pending.finally(() => { if (renewal === pending) renewal = null; }).catch(() => {}); }
          await renewal;
        }
        return api(path, options, false);
      }
      if (response.status === 401 && !path.startsWith('/api/auth/')) expire(owner);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(data.error || `Request failed (${response.status}).`);
      return data;
    }
    return { api, reset() { ++epoch; renewal = null; storage.removeItem(attemptKey); } };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { create };
  else window.MaddsSessionApi = { create };
})();
