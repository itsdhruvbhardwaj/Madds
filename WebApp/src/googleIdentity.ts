// Public OAuth Web client already used as the Android/server token audience.
// Google Cloud must authorize each web origin; this is not a client secret.
export const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '444690875641-gpg9b7j4p5dnmfprcrgmaaf96kdvvcd8.apps.googleusercontent.com').trim();

type Identity = {
  initialize: (config: { client_id: string; callback: (response: { credential?: string }) => void; auto_select: boolean; ux_mode: string }) => void;
  renderButton: (element: HTMLElement, config: { theme: string; size: string; shape: string; text: string; width: number }) => void;
};
const identity = () => (window as unknown as { google?: { accounts?: { id?: Identity } } }).google?.accounts?.id;
let loading: Promise<Identity> | undefined;
let initialized: Identity | undefined;
let activeListener: ((credential: string) => void) | undefined;

export function loadGoogleIdentity(): Promise<Identity> {
  const ready = identity(); if (ready) return Promise.resolve(ready);
  if (loading) return loading;
  loading = new Promise<Identity>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-signin]');
    const script = existing || document.createElement('script');
    const cleanup = () => { clearTimeout(timer); script.removeEventListener('load', loaded); script.removeEventListener('error', failed); };
    const failed = () => { cleanup(); script.remove(); reject(new Error('Google sign-in could not load. Check your connection and try again.')); };
    const loaded = () => { const sdk = identity(); if (!sdk) { failed(); return; } cleanup(); resolve(sdk); };
    const timer = setTimeout(failed, 15000);
    script.addEventListener('load', loaded); script.addEventListener('error', failed);
    if (!existing) { script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.dataset.googleSignin = 'true'; document.head.append(script); }
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}

export function renderGoogleButton(sdk: Identity, container: HTMLElement, signup: boolean, onCredential: (credential: string) => void) {
  if (initialized !== sdk) {
    sdk.initialize({ client_id: googleClientId, auto_select: false, ux_mode: 'popup', callback: response => {
      if (typeof response.credential === 'string' && response.credential) activeListener?.(response.credential);
    } });
    initialized = sdk;
  }
  activeListener = onCredential;
  container.replaceChildren();
  try {
    sdk.renderButton(container, { theme: 'filled_black', size: 'large', shape: 'pill', text: signup ? 'signup_with' : 'signin_with', width: Math.max(200, Math.min(400, Math.floor(container.clientWidth || 300))) });
  } catch (error) { if (activeListener === onCredential) activeListener = undefined; throw error; }
  return () => { if (activeListener === onCredential) activeListener = undefined; };
}
