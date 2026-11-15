import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('Google web authentication', () => {
  it('uses the same verified web audience for signup/login, initializes once and releases callbacks when leaving', async () => {
    vi.resetModules();
    const sdk = { initialize: vi.fn(), renderButton: vi.fn() };
    vi.stubGlobal('window', { google: { accounts: { id: sdk } } });
    const { loadGoogleIdentity, renderGoogleButton, googleClientId } = await import('../src/googleIdentity');
    expect(await loadGoogleIdentity()).toBe(sdk);
    const container = { clientWidth: 280, replaceChildren: vi.fn() } as unknown as HTMLElement;
    const login = vi.fn(); const signup = vi.fn();
    const stopLogin = renderGoogleButton(sdk, container, false, login);
    const config = sdk.initialize.mock.calls[0][0];
    expect(config.client_id).toBe(googleClientId); expect(config.auto_select).toBe(false);
    config.callback({ credential: 'verified-by-backend' }); expect(login).toHaveBeenCalledWith('verified-by-backend');
    stopLogin(); config.callback({ credential: 'late' }); expect(login).toHaveBeenCalledTimes(1);
    const stopSignup = renderGoogleButton(sdk, container, true, signup);
    expect(sdk.initialize).toHaveBeenCalledTimes(1);
    expect(sdk.renderButton.mock.calls.map(call => call[1].text)).toEqual(['signin_with', 'signup_with']);
    config.callback({}); expect(signup).not.toHaveBeenCalled();
    config.callback({ credential: 'new-account-token' }); expect(signup).toHaveBeenCalledWith('new-account-token');
    stopSignup();
  });

  it('shares SDK loading, times out a broken connection and permits a fresh retry', async () => {
    vi.resetModules(); vi.useFakeTimers();
    vi.stubGlobal('window', {});
    const scripts: Array<EventTarget & { src?: string; async?: boolean; dataset: Record<string, string>; remove: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal('document', { querySelector: () => null, createElement: () => Object.assign(new EventTarget(), { dataset: {}, remove: vi.fn() }), head: { append: (script: typeof scripts[number]) => scripts.push(script) } });
    const { loadGoogleIdentity } = await import('../src/googleIdentity');
    const first = loadGoogleIdentity(); expect(loadGoogleIdentity()).toBe(first);
    const failure = expect(first).rejects.toThrow('could not load');
    await vi.advanceTimersByTimeAsync(15000); await failure;
    expect(scripts[0].remove).toHaveBeenCalled();
    const retry = loadGoogleIdentity();
    const sdk = { initialize: vi.fn(), renderButton: vi.fn() };
    vi.stubGlobal('window', { google: { accounts: { id: sdk } } });
    scripts[1].dispatchEvent(new Event('load')); expect(await retry).toBe(sdk);
    expect(scripts).toHaveLength(2);
  });
});
