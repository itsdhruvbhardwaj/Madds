import { useEffect, useRef, useState } from 'react';
import { loadGoogleIdentity, renderGoogleButton } from './googleIdentity';
import { ErrorNotice, Spinner } from './components';
import { describeError } from './state';

export function GoogleSignIn({ signup, busy, onCredential }: { signup: boolean; busy: boolean; onCredential: (credential: string) => Promise<void> }) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential); callback.current = onCredential;
  const blocked = useRef(busy); blocked.current = busy;
  const submitting = useRef(false);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [attempt, retry] = useState(0);
  useEffect(() => {
    let active = true; let release: (() => void) | undefined;
    setLoading(true); setError('');
    void loadGoogleIdentity().then(sdk => {
      if (!active || !container.current) return;
      release = renderGoogleButton(sdk, container.current, signup, credential => {
        if (submitting.current || blocked.current) return;
        submitting.current = true; setError('');
        void callback.current(credential).catch(e => { if (active) setError(describeError(e)); }).finally(() => { submitting.current = false; });
      });
      setLoading(false);
    }).catch(e => { if (active) { setLoading(false); setError(describeError(e)); } });
    return () => { active = false; release?.(); };
  }, [signup, attempt]);
  return <div className="google-auth">
    <div className={`google-signin ${busy ? 'is-busy' : ''}`} aria-busy={loading || busy} ref={container} />
    {loading && <div className="google-loading" role="status"><Spinner small /><span>Loading Google sign-in…</span></div>}
    {busy && <p className="auth-help" role="status">Connecting your Madds account…</p>}
    {error && <ErrorNotice message={error} retry={() => retry(n => n + 1)} />}
    {!loading && !error && <p className="google-hint">{signup ? 'Create your account with Google. No password needed.' : 'Use Google for an existing account or to join Madds.'}</p>}
  </div>;
}
