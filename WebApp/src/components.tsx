import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, Heart, ImageOff, LoaderCircle, RefreshCw, SlidersHorizontal, X, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { imageUrl } from './storage';
import { useApp } from './state';
import type { Preference, Style } from './types';

export function Spinner({ small = false }: { small?: boolean }) { return <LoaderCircle className={`spin ${small ? 'icon-sm' : ''}`} aria-label="Loading" />; }
export function Avatar() {
  const { user } = useApp();
  const avatar = user?.profileAppearance === 'avatar' && /^avatar_\d{3}$/.test(user.avatarId || '') ? `/assets/avatars/${user!.avatarId}.png` : null;
  return <span className="avatar">{avatar || user?.profileImage ? <img src={avatar || user!.profileImage} alt="Your profile" referrerPolicy="no-referrer" /> : user ? <span>{user.name.trim().slice(0, 1).toUpperCase()}</span> : <UserRound size={20} />}</span>;
}
export function AppHeader({ title }: { title: string }) {
  return <header className="app-header"><Link to="/" className="wordmark" aria-label="Madds home"><img src="/assets/wordmark.png" alt="madds" /></Link><h1>{title}</h1><Link to="/profile" className="avatar-link" aria-label="Open profile"><Avatar /></Link></header>;
}
export function CompactHeader({ title, action, back = '/' }: { title: string; action?: ReactNode; back?: string }) {
  const navigate = useNavigate();
  return <header className="compact-header"><button className="icon-button" aria-label="Go back" onClick={() => navigate(back)}><ArrowLeft size={22} /></button><h1>{title}</h1>{action || <span className="icon-button spacer" />}</header>;
}
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-notice" role="status"><p>{message}</p>{retry && <button className="text-button" onClick={retry}><RefreshCw size={15} />Try again</button>}</div>;
}
export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon || <Heart />}</div><h2>{title}</h2><p>{children}</p>{action}</div>;
}
export function StyleImage({ src, alt, className = '', large = false, priority = false }: { src?: string; alt: string; className?: string; large?: boolean; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => setFailed(false), [src, retry]);
  return failed || !src ? <div className={`image-unavailable ${className}`}><ImageOff size={24} /><span>Photo unavailable</span>{src && <button onClick={e => { e.stopPropagation(); setRetry(x => x + 1); }}>Retry</button>}</div> :
    <img key={`${src}:${retry}`} src={imageUrl(src, large)} alt={alt} className={className} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async" onError={() => setFailed(true)} />;
}
export function GenderBadge({ style }: { style: Style }) {
  return style.genderTag === 'her' || style.genderTag === 'him' ? <span className="gender-badge">For {style.genderTag}</span> : null;
}
export function StyleCard({ style, minimal = false, priority = false }: { style: Style; minimal?: boolean; priority?: boolean }) {
  return <article className={`style-card ${minimal ? 'minimal' : ''}`}>
    <Link to={`/style/${style.id}`} className="card-link" aria-label={`Preview ${style.name}`}><StyleImage src={style.thumbnail} alt={style.name} priority={priority} />{!minimal && <><GenderBadge style={style} /><div className="card-caption"><h3>{style.name}</h3></div></>}</Link>
  </article>;
}
export function StyleSkeletons({ count = 6 }: { count?: number }) { return <div className="styles-grid" aria-label="Loading styles" aria-busy="true">{Array.from({ length: count }, (_, i) => <div key={i} className="skeleton style-skeleton" />)}</div>; }
export function FavoriteButton({ styleId }: { styleId: string }) {
  const { user, toggleFavorite, favoriteIds, favoriteBusy } = useApp();
  const navigate = useNavigate();
  const active = favoriteIds.has(styleId);
  return <button className={`icon-button favorite ${active ? 'active' : ''}`} aria-label={active ? 'Remove from favourites' : 'Add to favourites'} aria-pressed={active} disabled={favoriteBusy.has(styleId)} onClick={() => user ? void toggleFavorite(styleId) : navigate(`/login?next=${encodeURIComponent(`/style/${styleId}`)}`)}><Heart fill={active ? 'currentColor' : 'none'} /></button>;
}
export function Modal({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const savedFocus = useRef<Element | null>(null);
  useEffect(() => {
    savedFocus.current = document.activeElement;
    dialog.current?.showModal();
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; (savedFocus.current as HTMLElement)?.focus?.(); };
  }, []);
  return <dialog ref={dialog} className={`modal ${className}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === dialog.current) onClose(); }} aria-label={title}><div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="Close" onClick={onClose}><X size={21} /></button></div>{children}</dialog>;
}
export function PreferenceSheet({ close }: { close: () => void }) {
  const { preference, changePreference, toast } = useApp();
  const [chosen, choose] = useState(preference);
  const [busy, setBusy] = useState(false);
  const options: [Preference, string, string][] = [['all', 'For everyone', 'Discover the complete Madds collection'], ['her', 'For her', 'Styles for her, plus universal looks'], ['him', 'For him', 'Styles for him, plus universal looks']];
  return <Modal title="Make Madds yours" onClose={close}><p className="muted">Choose the styles you’d like to see.</p><div className="preference-options">{options.map(([value, title, description]) => <button key={value} className={chosen === value ? 'selected' : ''} onClick={() => choose(value)}><div><strong>{title}</strong><span>{description}</span></div><span className="radio">{chosen === value && <Check size={15} />}</span></button>)}</div><button className="button primary full" disabled={busy} onClick={async () => { setBusy(true); try { await changePreference(chosen); close(); } catch (e) { toast(e instanceof Error ? e.message : 'Could not save preference'); } finally { setBusy(false); } }}>{busy ? <Spinner small /> : 'Apply preference'}</button></Modal>;
}
export function FilterDock({ open }: { open: () => void }) {
  const { preference, user } = useApp();
  return <button className="filter-dock" onClick={open} aria-label="Change style preference"><SlidersHorizontal size={19} /><span>{preference === 'all' ? 'Everyone' : preference === 'her' ? 'For her' : 'For him'}</span>{user && <><i /><strong>{user.credits}</strong></>}</button>;
}
