import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bell, Check, ChevronRight, Clock3, Coins, Compass, Heart, House, Images, LogOut, Mail, MessageSquare, Search, Settings2, ShieldCheck, Shuffle, Smartphone, Sparkles, UserRound, Wallet, X } from 'lucide-react';
import { AppProvider, describeError, useApp } from './state';
import { api, jsonBody } from './api';
import { preferenceLabel } from './preferences';
import { AppHeader, Avatar, CompactHeader, EmptyState, ErrorNotice, FavoriteButton, FilterDock, GenderBadge, Modal, PreferenceSheet, Spinner, StyleCard, StyleImage, StyleSkeletons } from './components';
import type { Generation, Style } from './types';
import { GalleryPage, PhotoViewer } from './Gallery';
import { GeneratePage, UploadSheet } from './Generation';

const navigation = [{ path: '/', label: 'Home', Icon: House }, { path: '/explore', label: 'Explore', Icon: Search }, { path: '/collections', label: 'Collections', Icon: Images }, { path: '/favorites', label: 'Favourites', Icon: Heart }, { path: '/profile', label: 'Profile', Icon: UserRound }];

export default function App() { return <AppProvider><AppShell /></AppProvider>; }
function AppShell() {
  const { notice, online, user } = useApp();
  const location = useLocation();
  const mainTab = navigation.some(n => n.path === location.pathname);
  const [preferences, setPreferences] = useState(false);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [location.pathname]);
  const operations = useQuery({ queryKey: ['operations', user?.id], meta: { private: true }, enabled: Boolean(user) && online,
    queryFn: ({ signal }) => api<{ items: Generation[] }>('/api/generations', { signal }, true),
    refetchInterval: query => query.state.data?.items.some(g => g.status === 'processing') ? 6000 : 30000,
    refetchIntervalInBackground: false });
  const ready = operations.data?.items.find(g => g.status === 'completed' && g.resultAvailable);
  return <><div className={`app-shell ${mainTab ? 'has-nav' : ''}`}>
    {!online && <div className="offline-strip" role="status">You’re offline · previously loaded styles are available</div>}
    {ready && mainTab && <Link className="ready-strip" to={`/generations/${ready.id}`}><span><Bell size={15} />Your image is ready</span><ArrowRight size={15} /></Link>}
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/explore" element={<ExplorePage />} />
      <Route path="/collections" element={<CollectionsPage />} />
      <Route path="/favorites" element={<FavoritesPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/style/:id" element={<StylePage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/generations" element={<GalleryPage />} />
      <Route path="/generations/:id" element={<PhotoViewer />} />
      <Route path="/generating/:key" element={<GeneratePage />} />
      <Route path="/history/:type" element={<AccountHistoryPage />} />
      <Route path="/feedback" element={<FeedbackPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<><CompactHeader title="Madds" /><EmptyState title="This page has moved" action={<Link className="button primary" to="/">Back to Home</Link>}>Find your next look on Madds.</EmptyState></>} />
    </Routes>
    {mainTab && <nav className="bottom-nav" aria-label="Main navigation">{navigation.map(({ path, label, Icon }) => <NavLink key={path} to={path} end={path === '/'} aria-label={label}><Icon size={24} /><i /></NavLink>)}</nav>}
    {['/', '/explore'].includes(location.pathname) && <FilterDock open={() => setPreferences(true)} />}
  </div>{notice && <div className="toast" role="status">{notice}</div>}{preferences && <PreferenceSheet close={() => setPreferences(false)} />}</>;
}

function HomePage() {
  const { home, loading, catalogError, refreshCatalog, cached } = useApp();
  return <><AppHeader title="Home" /><main className="home-page">
    {cached && <p className="cache-note">Showing your last loaded styles.</p>}
    {catalogError && <ErrorNotice message={catalogError} retry={refreshCatalog} />}
    {loading && <StyleSkeletons />}
    {home.map((section, index) => <section className="home-section" key={section.id}><div className="section-head"><h2>{section.title}</h2><Link to={`/explore?collection=${encodeURIComponent(section.slug)}`}>See all <ChevronRight size={15} /></Link></div><div className="style-rail">{section.styles.map((style, i) => <StyleCard key={style.id} style={style} priority={index === 0 && i < 3} />)}</div></section>)}
    {!loading && !home.length && !catalogError && <EmptyState icon={<Compass />} title="Find your next look" action={<button className="button primary" onClick={refreshCatalog}>Load styles</button>}>Your next creation starts here.</EmptyState>}
  </main></>;
}

function ExplorePage() {
  const { styles, loading, catalogError, refreshCatalog, shuffle } = useApp();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') || '';
  const collection = params.get('collection') || '';
  const filtered = styles.filter(s => (!collection || s.collections.some(c => c.toLowerCase() === collection.toLowerCase())) && `${s.name} ${s.description}`.toLowerCase().includes(search.toLowerCase()));
  const update = (key: string, value: string) => { const n = new URLSearchParams(params); if (value) n.set(key, value); else n.delete(key); setParams(n, { replace: true }); };
  return <><AppHeader title="Explore" /><main className="explore-page"><div className="explore-toolbar"><label className="search-field"><Search size={18} /><input aria-label="Search styles" placeholder="Search styles…" value={search} onChange={e => update('q', e.target.value)} />{search && <button className="icon-button" aria-label="Clear search" onClick={() => update('q', '')}><X size={16} /></button>}</label><button className="icon-button shuffle-button" aria-label="Shuffle styles" title="Shuffle styles" onClick={shuffle}><Shuffle size={19} /></button></div>
    {catalogError && <ErrorNotice message={catalogError} retry={refreshCatalog} />}
    {loading ? <StyleSkeletons count={12} /> : <><div className="explore-meta"><span>{collection || (search ? 'Search results' : 'Discover your next look')}</span><span>{filtered.length} styles</span></div><div className={`explore-grid ${search || collection ? 'uniform' : ''}`}>{filtered.map((style, i) => <StyleCard key={style.id} style={style} minimal priority={i < 5} />)}</div>{!filtered.length && <EmptyState icon={<Search />} title="No styles found">Try another search or collection.</EmptyState>}</>}
  </main></>;
}
function CollectionsPage() {
  const { collections, loading, catalogError, refreshCatalog } = useApp();
  return <><AppHeader title="Collections" /><main className="collections-page"><p className="page-subtitle">Explore all styles by collection</p>{catalogError && <ErrorNotice message={catalogError} retry={refreshCatalog} />}{loading ? <StyleSkeletons /> : <div className="collections-grid">{collections.map((c, i) => <Link className="collection-card" key={c.id} to={`/explore?collection=${encodeURIComponent(c.name)}`}><StyleImage src={c.thumbnail} alt={c.name} priority={i < 4} /><div className="card-caption"><h2>{c.name}</h2><span>{c.styleCount} styles</span></div></Link>)}</div>}</main></>;
}
export function SignInGate({ title = 'Your creations, all together', children = 'Sign in to access your Madds account.' }: { title?: string; children?: ReactNode }) {
  const location = useLocation();
  return <EmptyState icon={<UserRound />} title={title} action={<Link className="button primary" to={`/login?next=${encodeURIComponent(location.pathname)}`}>Sign in <ArrowRight size={17} /></Link>}>{children}</EmptyState>;
}
function FavoritesPage() {
  const { user, favoriteStyles: favorites, favoritesError, refreshFavorites } = useApp();
  return <><AppHeader title="Favourites" /><main className="favorites-page">{!user ? <SignInGate title="Keep the looks you love">Sign in to save your favourite styles across devices.</SignInGate> : <>{favoritesError && <ErrorNotice message={favoritesError} retry={refreshFavorites} />}{favorites.length ? <><p className="page-subtitle">A little inspiration, saved for later.</p><div className="styles-grid">{favorites.map(s => <StyleCard key={s.id} style={s} />)}</div></> : <EmptyState title="Your favourites start here" action={<Link className="button secondary" to="/explore">Explore styles</Link>}>Tap the heart on a style to keep it close.</EmptyState>}</>}</main></>;
}

function StylePage() {
  const { id } = useParams();
  const { styles, user } = useApp();
  const navigate = useNavigate();
  const [position, setPosition] = useState(50);
  const [upload, setUpload] = useState(false);
  const fallback = styles.find(s => s.id === id);
  const details = useQuery({ queryKey: ['style', id], queryFn: ({ signal }) => api<{ style: Style }>(`/api/styles/${encodeURIComponent(id || '')}`, { signal }), staleTime: 300_000 });
  const style = details.data?.style || fallback;
  return <><CompactHeader title={style?.name || 'Style preview'} back="/explore" action={<FavoriteButton styleId={id || ''} />} /><main className="style-page">
    {details.error && <ErrorNotice message={describeError(details.error)} retry={() => void details.refetch()} />}
    {!style ? <StyleSkeletons count={1} /> : <><div className="before-after" style={{ '--split': `${position}%` } as React.CSSProperties}><StyleImage src={style.exampleAfterUrl || style.thumbnail} alt={`${style.name}, after`} large priority /><div className="before-layer"><StyleImage src={style.exampleBeforeUrl || style.thumbnail} alt="Before transformation" large priority /></div><span className="compare-label before">Before</span><span className="compare-label after">After</span><div className="compare-line"><span>↔</span></div><input aria-label="Before and after comparison" type="range" min="0" max="100" value={position} onChange={e => setPosition(Number(e.target.value))} /></div><div className="style-description"><GenderBadge style={style} /><p>{style.description}</p></div><div className="generate-dock"><div><strong>{style.tokensRequired} credits</strong><span>per generation</span></div><button className="button primary" onClick={() => user ? setUpload(true) : navigate(`/login?next=${encodeURIComponent(`/style/${style.id}`)}`)}>Generate <Sparkles size={17} /></button></div></>}
  </main>{upload && style && <UploadSheet style={style} close={() => setUpload(false)} />}</>;
}

function ProfilePage() {
  const { user, authError, refreshUser } = useApp();
  const rows = [{ path: '/generations', text: 'My Generations', Icon: Images }, { path: '/history/purchases', text: 'My Purchases', Icon: Wallet }, { path: '/history/credits', text: 'Credit History', Icon: Clock3 }, { path: '/settings', text: 'Settings', Icon: Settings2 }, { path: 'https://maddsofficial.com/help.html', text: 'Help & Support', Icon: ShieldCheck }, { path: '/feedback', text: 'Send Feedback', Icon: MessageSquare }];
  return <><AppHeader title="Profile" /><main className="profile-page">{!user ? <SignInGate title="Your space. Your creations.">Sign in to manage your credits, favourites, and creations.</SignInGate> : <>
    {authError && <ErrorNotice message={authError} retry={() => void refreshUser()} />}
    <div className="profile-identity"><Avatar /><Link to="/settings" className="text-button">Your account</Link><h2>{user.name}</h2><p>{user.email}</p></div>
    <div className="credit-card"><div><div className="credit-amount"><Coins size={28} /><strong>{user.credits}</strong></div><span>Credits</span></div><Link className="text-button" to="/history/credits">View history <ChevronRight size={16} /></Link></div>
    <div className="profile-menu">{rows.map(({ path, text, Icon }) => path.startsWith('https') ? <a key={path} href={path} target="_blank" rel="noreferrer"><Icon /><span>{text}</span><ChevronRight /></a> : <Link key={path} to={path}><Icon /><span>{text}</span><ChevronRight /></Link>)}</div>
  </>}</main></>;
}
export function CreditsSheet({ close, requiredCredits }: { close: () => void; requiredCredits: number }) {
  const { user, refreshUser } = useApp();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const balance = user?.credits || 0;
  return <Modal title={balance < requiredCredits ? 'Not enough credits' : 'Your Madds credits'} onClose={close}><div className="credits-modal"><Coins size={40} /><strong>{balance}</strong><span>credits available</span></div><p>{balance < requiredCredits ? `This style needs ${requiredCredits} credits. You need ${requiredCredits - balance} more to generate it.` : 'Your balance is ready. Close this message and tap Generate to continue.'}</p><div className="info-box">You can use your existing Madds balance here. Getting more credits on the web is not available yet.</div>{error && <ErrorNotice message={error} />}<button className="button secondary full" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await refreshUser(); } catch (e) { setError(describeError(e)); } finally { setBusy(false); } }}>{busy ? <Spinner small /> : 'Refresh balance'}</button><button className="button primary full" onClick={close}>Got it</button></Modal>;
}

function GoogleButton({ onCredential }: { onCredential: (value: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  useEffect(() => {
    if (!clientId) return;
    const init = () => {
      const google = (window as unknown as { google?: { accounts: { id: { initialize: (v: unknown) => void; renderButton: (e: HTMLElement, v: unknown) => void } } } }).google;
      if (!google || !container.current) return;
      google.accounts.id.initialize({ client_id: clientId, callback: (r: { credential: string }) => onCredential(r.credential) });
      google.accounts.id.renderButton(container.current, { theme: 'filled_black', size: 'large', shape: 'pill', width: 300 });
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-signin]');
    if (existing) { init(); existing.addEventListener('load', init); return () => existing.removeEventListener('load', init); }
    const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.dataset.googleSignin = 'true'; script.onload = init; document.head.append(script);
  }, [clientId, onCredential]);
  return clientId ? <div ref={container} className="google-signin" /> : <p className="auth-help">Use your Madds email and password. If you signed up with Google, create a password in the Android app’s account settings first.</p>;
}
function AuthPage() {
  const { user, login, googleLogin, authBusy } = useApp();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const next = params.get('next');
  const destination = next?.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : '/profile';
  useEffect(() => { if (user) navigate(destination, { replace: true }); }, [user, destination, navigate]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setError(''); setMessage(''); setBusy(true);
    const data = new FormData(e.currentTarget); const email = String(data.get('email')).trim(); const password = String(data.get('password'));
    try {
      if (mode === 'login') await login(email, password);
      else if (mode === 'register') { const r = await api<{ message: string }>('/api/auth/register', jsonBody({ name: String(data.get('name')).trim(), email, password })); setMessage(r.message); }
      else { const r = await api<{ message: string }>('/api/auth/forgot-password', jsonBody({ email })); setMessage(r.message); }
    } catch (e) { setError(describeError(e)); } finally { setBusy(false); }
  };
  return <><CompactHeader title="Your Madds account" /><main className="auth-page"><img className="auth-logo" src="/assets/wordmark.png" alt="madds" /><h2>{mode === 'login' ? 'Welcome back.' : mode === 'register' ? 'Make it yours.' : 'Forgot your password?'}</h2><p className="muted">{mode === 'login' ? 'Your next creation is waiting.' : mode === 'register' ? 'One account. Endless possibilities.' : 'We’ll email you a link to reset it.'}</p><form onSubmit={submit}>
    {mode === 'register' && <label>Name<input name="name" autoComplete="name" required minLength={2} placeholder="Your name" /></label>}
    <label>Email<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
    {mode !== 'reset' && <label>Password<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : 1} required placeholder="Your password" />{mode === 'register' && <small>At least 8 characters, with uppercase, lowercase, and a number.</small>}</label>}
    {mode === 'login' && <button className="text-button forgot" type="button" onClick={() => { setMode('reset'); setError(''); }}>Forgot password?</button>}
    {error && <ErrorNotice message={error} />}{message && <div className="success-notice" role="status"><Check size={18} />{message}</div>}
    <button className="button primary full" disabled={busy || authBusy}>{busy || authBusy ? <Spinner small /> : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}<ArrowRight size={17} /></button>
  </form>{mode === 'login' && <GoogleButton onCredential={value => void googleLogin(value).catch(e => setError(describeError(e)))} />}
  <p className="auth-switch">{mode === 'login' ? 'New to Madds?' : 'Already have an account?'} <button className="text-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setMessage(''); }}>{mode === 'login' ? 'Create account' : 'Sign in'}</button></p>
  <p className="legal-note">By continuing, you agree to our <a href="https://maddsofficial.com/terms.html" target="_blank" rel="noreferrer">Terms</a> and <a href="https://maddsofficial.com/privacy.html" target="_blank" rel="noreferrer">Privacy Policy</a>.</p></main></>;
}

function SettingsPage() {
  const { user, logout, toast, preference } = useApp(); const navigate = useNavigate();
  const [pref, setPref] = useState(false); const [install, setInstall] = useState(false); const [busy, setBusy] = useState(false);
  return <><CompactHeader title="Settings" back="/profile" /><main className="settings-page"><div className="profile-menu"><button onClick={() => setPref(true)}><Settings2 /><span>Style preference<small>{preferenceLabel(preference)}</small></span><ChevronRight /></button><button onClick={() => setInstall(true)}><Smartphone /><span>Add Madds to Home Screen</span><ChevronRight /></button><a href="https://maddsofficial.com/privacy.html" target="_blank" rel="noreferrer"><ShieldCheck /><span>Privacy Policy</span><ChevronRight /></a><a href="https://maddsofficial.com/terms.html" target="_blank" rel="noreferrer"><ShieldCheck /><span>Terms of Service</span><ChevronRight /></a><a href="https://maddsofficial.com/delete-account.html" target="_blank" rel="noreferrer"><UserRound /><span>Account & data deletion</span><ChevronRight /></a>{user && <button disabled={busy} onClick={async () => { setBusy(true); try { await logout(); navigate('/'); } catch (e) { toast(describeError(e)); } finally { setBusy(false); } }}><LogOut /><span>Sign out</span>{busy ? <Spinner small /> : <ChevronRight />}</button>}</div><p className="version-note">Madds Web · 0.1.0</p></main>{pref && <PreferenceSheet close={() => setPref(false)} />}{install && <Modal title="Madds, one tap away" onClose={() => setInstall(false)}><div className="install-icon"><img src="/assets/icon.png" alt="Madds" /></div><p>On iPhone, open Madds in Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. Enable <strong>Open as Web App</strong> if shown.</p><p className="muted">On Android or desktop, choose Install app from your browser’s menu when available.</p><button className="button primary full" onClick={() => setInstall(false)}>Got it</button></Modal>}</>;
}
function AccountHistoryPage() {
  const { type } = useParams(); const { user } = useApp(); const [page, setPage] = useState(1);
  const purchases = type === 'purchases';
  const result = useQuery({ queryKey: ['account-history', user?.id, type, page], meta: { private: true }, enabled: Boolean(user),
    queryFn: ({ signal }) => api<{ purchases?: Record<string, unknown>[]; transactions?: Record<string, unknown>[]; hasMore: boolean }>(`/api/me/${purchases ? 'purchases' : 'credit-history'}?page=${page}&limit=20`, { signal }, true) });
  const rows = result.data?.purchases || result.data?.transactions || [];
  return <><CompactHeader title={purchases ? 'My Purchases' : 'Credit History'} back="/profile" /><main className="history-page">{!user ? <SignInGate /> : result.isPending ? <div className="center-loading"><Spinner /></div> : <>{result.error && <ErrorNotice message={describeError(result.error)} retry={() => void result.refetch()} />}{rows.length ? <div className="history-list">{rows.map((r, i) => <div key={String(r._id || i)}><span className="history-icon"><Coins size={20} /></span><div><strong>{String(r.displayName || 'Credit transaction')}</strong><small>{new Date(String(r.createdAt)).toLocaleString()}</small></div><strong className={Number(r.amount) > 0 ? 'positive' : ''}>{purchases ? `${Number(r.creditsGranted)} credits` : `${Number(r.amount) > 0 ? '+' : ''}${Number(r.amount)}`}</strong></div>)}</div> : !result.error && <EmptyState icon={<Wallet />} title={purchases ? 'No purchases yet' : 'No recent transactions'}>{purchases ? 'Your credit purchases will appear here.' : 'Credit activity from the last 15 days appears here.'}</EmptyState>}<div className="pagination">{page > 1 && <button className="button secondary" onClick={() => setPage(p => p - 1)}>Previous</button>}{result.data?.hasMore && <button className="button secondary" onClick={() => setPage(p => p + 1)}>Next</button>}</div></>}</main></>;
}
function FeedbackPage() {
  const { user } = useApp(); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState(false);
  const requestId = useRef(crypto.randomUUID());
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const data = new FormData(e.currentTarget); setBusy(true); setError('');
    try { await api('/api/feedback', jsonBody({ requestId: requestId.current, category: data.get('category'), message: data.get('message'), contactEmail: user?.email || '', appVersion: 'web-0.1.0', androidVersion: 'Web' }), true); setDone(true); }
    catch (e) { setError(describeError(e)); } finally { setBusy(false); }
  };
  return <><CompactHeader title="Send Feedback" back="/profile" /><main className="feedback-page">{!user ? <SignInGate /> : done ? <EmptyState icon={<Check />} title="Thanks for helping Madds grow." action={<Link to="/profile" className="button primary">Back to Profile</Link>}>Your feedback has been sent to the team.</EmptyState> : <><h2>We’re listening.</h2><p className="muted">Have an idea or found something that needs fixing?</p><form onSubmit={submit}><label>Category<select name="category"><option value="SUGGESTION">Suggestion</option><option value="BUG">Report a problem</option><option value="OTHER">Something else</option></select></label><label>Your message<textarea name="message" minLength={10} maxLength={2000} required rows={6} placeholder="Tell us what’s on your mind…" /></label>{error && <ErrorNotice message={error} />}<button className="button primary full" disabled={busy}>{busy ? <Spinner small /> : <><Mail size={18} />Send feedback</>}</button></form></>}</main></>;
}
