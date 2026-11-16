const { test } = require('node:test'), assert = require('node:assert/strict');
const { create } = require('../session-api.js');
function fixture(fetcher) {
  const tokens = new Map([['picmee_admin_access','old'],['picmee_admin_refresh','refresh']]);
  let online = true, expired = 0;
  const storage = { getItem: key => tokens.get(key) || null, setItem: (key,value) => tokens.set(key,value), removeItem: key => tokens.delete(key) };
  const client = create({ base:'https://fixture.invalid', storage, fetcher, online:() => online, onExpired:() => expired++ });
  return { client, tokens, setOnline(value) { online=value; }, get expired() { return expired; } };
}
const response = (status, data = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => data });

test('offline edits are rejected without sending or clearing the session', async () => {
  let sent = 0; const f = fixture(async () => { sent++; return response(200); }); f.setOnline(false);
  await assert.rejects(f.client.api('/api/admin/settings', { method:'PATCH', body:'{}' }), /not been queued/);
  assert.equal(sent, 0); assert.equal(f.expired, 0); assert.equal(f.tokens.get('picmee_admin_refresh'), 'refresh');
  f.setOnline(true); await new Promise(resolve => setImmediate(resolve)); assert.equal(sent, 0);
});
test('network loss during renewal preserves the session for a manual retry', async () => {
  const f = fixture(async url => { if (url.endsWith('/refresh')) throw Error('Network'); return response(401); });
  await assert.rejects(f.client.api('/api/admin/catalog'), /Check your connection/);
  assert.equal(f.tokens.get('picmee_admin_access'), 'old'); assert.equal(f.expired, 0);
});
test('a lost rotation response reuses the same recovery attempt after reopening the page', async () => {
  let lost = true; const attempts = [];
  const fetcher = async (url, options) => {
    if (!url.endsWith('/refresh')) return options.headers.get('Authorization') === 'Bearer old' ? response(401) : response(200, {ok:true});
    const body = JSON.parse(options.body); attempts.push(body.refreshAttemptId);
    if (lost) { lost = false; throw Error('Response lost after server rotated'); }
    return response(200, {accessToken:'new',refreshToken:'rotated'});
  };
  const f = fixture(fetcher);
  await assert.rejects(f.client.api('/api/admin/catalog'), /Check your connection/);
  const storage = {getItem:key=>f.tokens.get(key)||null,setItem:(key,value)=>f.tokens.set(key,value),removeItem:key=>f.tokens.delete(key)};
  const reopened = create({base:'https://fixture.invalid',storage,fetcher,online:()=>true,onExpired:()=>assert.fail('must recover')});
  assert.equal((await reopened.api('/api/admin/catalog')).ok,true);
  assert.equal(attempts.length,2); assert.match(attempts[0],/^[a-zA-Z0-9_-]{16,128}$/); assert.equal(attempts[0],attempts[1]);
  assert.equal(f.tokens.has('picmee_admin_refresh_attempt'),false);
});
test('server failure or malformed renewal never logs the team out', async () => {
  for (const renewal of [response(503), response(200, { accessToken:'partial' })]) {
    const f = fixture(async url => url.endsWith('/refresh') ? renewal : response(401));
    await assert.rejects(f.client.api('/api/admin/catalog'), /could not be renewed/);
    assert.equal(f.tokens.get('picmee_admin_refresh'), 'refresh'); assert.equal(f.expired, 0);
  }
});
test('confirmed expired refresh credentials clear access and require sign-in', async () => {
  const f = fixture(async () => response(401));
  await assert.rejects(f.client.api('/api/admin/catalog'), /session has ended/);
  assert.equal(f.tokens.size, 0); assert.equal(f.expired, 1);
});
test('simultaneous expired requests share one renewal and retry with the new access token', async () => {
  let renewals = 0, retryWrites = 0;
  const f = fixture(async (url, options) => {
    assert.equal(options.cache, 'no-store');
    if (url.endsWith('/refresh')) { renewals++; await new Promise(resolve => setImmediate(resolve)); return response(200, { accessToken:'new', refreshToken:'new-refresh' }); }
    if (options.headers.get('Authorization') === 'Bearer old') return response(401);
    if (options.method === 'PATCH') retryWrites++;
    return response(200, { ok:true });
  });
  const results = await Promise.all([f.client.api('/api/admin/catalog'), f.client.api('/api/admin/settings', { method:'PATCH', body:'{}' })]);
  assert.equal(renewals, 1); assert.equal(retryWrites, 1); assert.equal(results[0].ok, true); assert.equal(f.expired, 0);
});
test('signout while renewal is pending cannot restore the old account', async () => {
  let release, started; const ready = new Promise(resolve => started=resolve);
  const f = fixture(async url => {
    if (!url.endsWith('/refresh')) return response(401);
    started(); return new Promise(resolve => release=resolve);
  });
  const request = f.client.api('/api/admin/catalog'); await ready;
  f.client.reset(); f.tokens.clear(); release(response(200, { accessToken:'new', refreshToken:'new-refresh' }));
  await assert.rejects(request, /session has changed/); assert.equal(f.tokens.size, 0);
});
test('failed password login never attempts renewal or clears an existing session', async () => {
  let requests = 0; const f = fixture(async () => { requests++; return response(401, {error:'Incorrect password'}); });
  await assert.rejects(f.client.api('/api/auth/login', {method:'POST', body:'{}'}, false), /Incorrect password/);
  assert.equal(requests, 1); assert.equal(f.expired, 0);
});
test('forbidden admin access does not rotate credentials or replay a request', async () => {
  let requests = 0; const f = fixture(async () => { requests++; return response(403, {error:'Access denied'}); });
  await assert.rejects(f.client.api('/api/admin/settings', {method:'PATCH',body:'{}'}), /Access denied/);
  assert.equal(requests,1); assert.equal(f.expired,0);
});
