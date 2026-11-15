import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Clock3, Download, Images, Info, RefreshCw, Share2, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { api, authBlob, storedSession } from './api';
import { CompactHeader, EmptyState, ErrorNotice, Modal, Spinner } from './components';
import { describeError, useApp } from './state';
import { imageDataUrl, removeSaved, savedPhotos, savePhoto, timeLeft } from './storage';
import { SignInGate } from './App';
import type { GalleryResponse, Generation, GenerationResult, SavedPhoto } from './types';

function useBlobUrl(blob?: Blob) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) { setUrl(''); return; }
    const value = URL.createObjectURL(blob); setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [blob]);
  return url;
}
export function GalleryPage() {
  const { user, online } = useApp();
  const [tab, setTab] = useState<'unsaved' | 'saved'>('unsaved');
  const [help, setHelp] = useState(false);
  const [now, setNow] = useState(Date.now());
  const recent = useInfiniteQuery({ queryKey: ['gallery', user?.id], meta: { private: true }, enabled: Boolean(user) && online,
    initialPageParam: '', queryFn: ({ pageParam, signal }) => api<GalleryResponse>(`/api/generations/gallery${pageParam ? `?cursor=${pageParam}` : ''}`, { signal }, true),
    getNextPageParam: page => page.nextCursor || undefined, refetchInterval: online ? 30000 : false });
  const local = useQuery({ queryKey: ['saved', user?.id], meta: { private: true }, enabled: Boolean(user), queryFn: () => savedPhotos(user!.id) });
  const saved = local.data || [];
  const savedIds = new Set(saved.map(s => s.id));
  const all = recent.data?.pages.flatMap(p => p.items) || [];
  const serverOffset = recent.data?.pages[0]?.serverNow && recent.dataUpdatedAt ? Date.parse(recent.data.pages[0].serverNow) - recent.dataUpdatedAt : 0;
  const photos = all.filter(g => !savedIds.has(g.id) && (g.status === 'processing' || g.resultAvailable && timeLeft(g.resultExpiresAt, now + serverOffset) !== 'Expired'));
  const refreshing = recent.isFetching || local.isFetching;
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  // A page consisting entirely of saved photos is not an empty unsaved gallery.
  useEffect(() => { if (tab === 'unsaved' && !photos.length && recent.hasNextPage && !recent.isFetching && !recent.error) void recent.fetchNextPage(); }, [tab, photos.length, recent.hasNextPage, recent.isFetching, recent.error]);
  return <><CompactHeader title="My Generations" back="/profile" action={<button className="icon-button" aria-label="Refresh generations" disabled={refreshing || !user} onClick={() => { void recent.refetch(); void local.refetch(); }}>{refreshing ? <Spinner small /> : <RefreshCw size={20} />}</button>} /><main className="gallery-page">
    {!user ? <SignInGate title="Your creations live here">Sign in to revisit your recent photos and saved creations.</SignInGate> : <>
      <button className="gallery-help text-button" onClick={() => setHelp(true)}><Info size={14} />About your photos</button>
      {tab === 'unsaved' && recent.error && <ErrorNotice message={describeError(recent.error)} retry={() => void recent.refetch()} />}
      {tab === 'saved' && local.error && <ErrorNotice message="Browser storage is unavailable. Please allow site storage to see saved photos." retry={() => void local.refetch()} />}
      <div className="generation-grid">{tab === 'unsaved' ? photos.map(g => <RecentTile key={g.id} generation={g} now={now + serverOffset} />) : saved.map(p => <SavedTile key={p.id} photo={p} />)}
      {(tab === 'unsaved' ? recent.isPending : local.isPending) && Array.from({ length: 6 }, (_, i) => <div className="skeleton gallery-skeleton" key={i} />)}</div>
      {tab === 'unsaved' && recent.hasNextPage && <button className="button secondary load-more" disabled={recent.isFetching} onClick={() => void recent.fetchNextPage()}>{recent.isFetching ? <Spinner small /> : 'Load more'}</button>}
      {!(tab === 'unsaved' ? photos.length || recent.isPending || recent.hasNextPage || recent.error : saved.length || local.isPending || local.error) && <EmptyState icon={tab === 'saved' ? <CheckCircle2 /> : <Images />} title={tab === 'saved' ? 'Your keepers go here' : 'No unsaved photos'} action={<Link className="button secondary" to="/explore">Explore styles</Link>}>{tab === 'saved' ? 'Save a creation to keep a copy in this browser.' : 'New creations are available here for 24 hours.'}</EmptyState>}
      <nav className="gallery-tabs" aria-label="Generation filters">{(['unsaved', 'saved'] as const).map(t => <button key={t} className={tab === t ? 'active' : ''} aria-pressed={tab === t} onClick={() => setTab(t)}>{t === 'unsaved' ? <Clock3 size={16} /> : <CheckCircle2 size={16} />}{t === 'unsaved' ? 'Unsaved' : 'Saved'}</button>)}</nav>
    </>}
  </main>{help && <Modal title="A little space for your creations" onClose={() => setHelp(false)}><p>Unsaved photos stay in your Madds account for 24 hours after generation. Opening a photo doesn’t extend its timer.</p><p>Saved photos are kept in this browser. They don’t sync to other devices, and clearing website data can remove them.</p><p className="muted">Download your favourites to keep a separate device copy. On iPhone, use Share → Save Image when available.</p><button className="button primary full" onClick={() => setHelp(false)}>Got it</button></Modal>}</>;
}
function RecentTile({ generation: g, now }: { generation: Generation; now: number }) {
  const { user } = useApp();
  const thumb = useQuery({ queryKey: ['thumbnail', user?.id, g.id], meta: { private: true }, enabled: Boolean(user) && g.status === 'completed',
    queryFn: ({ signal }) => authBlob(`/api/generations/${g.id}/thumbnail`, signal), staleTime: 20 * 60_000, retry: 1 });
  const url = useBlobUrl(thumb.data);
  return <Link className="generation-tile" to={g.status === 'processing' ? `/generating/id_${g.id}` : `/generations/${g.id}`}>
    {url ? <img src={url} alt={g.styleName} loading="lazy" /> : <div className="tile-placeholder">{g.status === 'processing' ? <Spinner /> : <Images size={22} />}</div>}
    <span className="timer-badge"><Clock3 size={10} />{g.status === 'processing' ? 'Creating…' : timeLeft(g.resultExpiresAt, now)}</span><span className="tile-name">{g.styleName}</span>
  </Link>;
}
function SavedTile({ photo }: { photo: SavedPhoto }) {
  const url = useBlobUrl(photo.blob);
  return <Link className="generation-tile" to={`/generations/${photo.id}`}>{url && <img src={url} alt={photo.name} loading="lazy" />}<span className="tile-name">{photo.name}</span></Link>;
}

type Watermark = { enabled: boolean; logoUrl: string; widthPercent: number; opacityPercent: number; paddingPercent: number };
async function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.crossOrigin = 'anonymous'; image.onload = () => resolve(image); image.onerror = () => reject(new Error('Could not prepare the photo for saving. Please retry.')); image.src = src; });
}
export async function exportPhoto(dataUrl: string): Promise<Blob> {
  const config = await api<Watermark>('/api/app-config/watermark');
  const image = await loadImage(imageDataUrl(dataUrl));
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d'); if (!context) throw new Error('Your browser could not prepare this photo.');
  context.drawImage(image, 0, 0);
  if (config.enabled) {
    if (!config.logoUrl.startsWith('https://res.cloudinary.com/')) throw new Error('Photo export settings are unavailable. Please retry.');
    const logo = await loadImage(config.logoUrl);
    const padding = Math.min(canvas.width, canvas.height) * config.paddingPercent / 100;
    const scale = Math.min(canvas.width * config.widthPercent / 100 / logo.naturalWidth, (canvas.height - 2 * padding) / logo.naturalHeight);
    const width = logo.naturalWidth * scale;
    const height = logo.naturalHeight * scale;
    context.globalAlpha = config.opacityPercent / 100;
    context.drawImage(logo, canvas.width - width - padding, canvas.height - height - padding, width, height);
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not export this photo.')), 'image/jpeg', .95));
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
  document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function PhotoViewer() {
  const { id } = useParams(); const { user, toast, refreshUser } = useApp(); const navigate = useNavigate(); const queries = useQueryClient();
  const [busy, setBusy] = useState(false); const [zoom, setZoom] = useState(false); const [confirm, setConfirm] = useState(false); const [actionError, setActionError] = useState('');
  const local = useQuery({ queryKey: ['saved', user?.id], meta: { private: true }, enabled: Boolean(user), queryFn: () => savedPhotos(user!.id) });
  const saved = local.data?.find(p => p.id === id);
  const detail = useQuery({ queryKey: ['generation', user?.id, id], meta: { private: true }, enabled: Boolean(user) && !local.isPending && !saved,
    queryFn: ({ signal }) => api<Generation>(`/api/generations/${id}`, { signal }, true) });
  const result = useQuery({ queryKey: ['result', user?.id, id], meta: { private: true }, enabled: Boolean(user) && !local.isPending && !saved,
    queryFn: async ({ signal }) => {
      const response = await api<GenerationResult>(`/api/generations/${id}/result`, { signal }, true, 45000);
      if (!response.image) throw new Error('This photo is not available yet. Please check My Generations.');
      imageDataUrl(response.image);
      return response;
    }, staleTime: 0, gcTime: 0, retry: false });
  const savedUrl = useBlobUrl(saved?.blob);
  const source = savedUrl || (result.data?.image ? imageDataUrl(result.data.image) : '');
  const title = saved?.name || detail.data?.styleName || 'Your creation';
  useEffect(() => {
    if (!source || !user || !id) return;
    void api(`/api/generations/${id}/viewed`, { method: 'POST' }, true).then(() => queries.invalidateQueries({ queryKey: ['operations', user.id] })).catch(() => {});
    void refreshUser().catch(() => {});
  }, [source, id, user?.id]);
  const name = `Madds-${id}.jpg`;
  const save = async () => {
    if (!user || !result.data?.image || busy) return;
    const owner = user.id; setBusy(true); setActionError('');
    try {
      const blob = await exportPhoto(result.data.image);
      if (storedSession()?.user.id !== owner) throw new Error('Your account changed. Reopen the photo to save it.');
      await savePhoto({ id: id!, owner, name: title, blob, savedAt: Date.now() });
      await queries.invalidateQueries({ queryKey: ['saved', owner] });
      if (storedSession()?.user.id !== owner) return;
      download(blob, name); toast('Saved in this browser. Keep the downloaded copy on your device too.');
    } catch (e) { setActionError(describeError(e)); } finally { setBusy(false); }
  };
  const share = async () => {
    if (!source || busy || !user) return; const owner = user.id; setBusy(true); setActionError('');
    try {
      const blob = saved?.blob || await exportPhoto(result.data!.image!);
      if (storedSession()?.user.id !== owner) throw new Error('Your account changed. Reopen the photo to share it.');
      const file = new File([blob], name, { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Made with Madds' });
      else { download(blob, name); toast('Photo downloaded. You can share it from your files.'); }
    } catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setActionError(describeError(e)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!user || busy) return; setBusy(true); setActionError('');
    try {
      if (saved) await removeSaved(user.id, id!);
      else await api(`/api/generations/${id}/result`, { method: 'DELETE' }, true);
      await queries.invalidateQueries({ queryKey: [saved ? 'saved' : 'gallery', user.id] });
      navigate('/generations', { replace: true });
    } catch (e) { setActionError(describeError(e)); setConfirm(false); } finally { setBusy(false); }
  };
  return <div className="photo-viewer"><header><button className="icon-button" aria-label="Close photo and show My Generations" onClick={() => navigate('/generations', { replace: true })}><X /></button><span>{title}</span><button className="icon-button" aria-label={zoom ? 'Zoom out' : 'Zoom in'} disabled={!source} onClick={() => setZoom(v => !v)}>{zoom ? <ZoomOut /> : <ZoomIn />}</button></header>
    {!user ? <SignInGate /> : <><div className={`photo-stage ${zoom ? 'zoomed' : ''}`}>
      {source ? <img src={source} alt={title} onDoubleClick={() => setZoom(v => !v)} /> : result.error ? <ErrorNotice message={describeError(result.error)} retry={() => void result.refetch()} /> : <div className="center-loading"><Spinner /><span>Opening your photo…</span></div>}
    </div><footer>{detail.data?.resultExpiresAt && !saved && <p className="viewer-expiry"><Clock3 size={14} />Available in My Generations for {timeLeft(detail.data.resultExpiresAt).replace(' left', '')}</p>}{actionError && <ErrorNotice message={actionError} />}<div className="viewer-actions"><button className="button secondary icon-only" aria-label="Delete photo" disabled={busy || !source} onClick={() => setConfirm(true)}><Trash2 size={19} /></button><button className="button secondary" disabled={busy || !source} onClick={() => void share()}><Share2 size={18} />Share</button>{saved ? <button className="button primary" disabled={busy} onClick={() => download(saved.blob, name)}><Download size={18} />Download</button> : <button className="button primary" disabled={busy || !source} onClick={() => void save()}>{busy ? <Spinner small /> : <Download size={18} />}Save photo</button>}</div></footer></>}
    {confirm && <Modal title={saved ? 'Remove saved copy?' : 'Delete this creation?'} onClose={() => setConfirm(false)}><p>{saved ? 'This removes the copy kept in this browser. Files you downloaded to your device are not deleted.' : 'This removes the temporary photo from your Madds gallery. This cannot be undone.'}</p><div className="modal-actions"><button className="button secondary" onClick={() => setConfirm(false)}>Keep photo</button><button className="button danger" disabled={busy} onClick={() => void remove()}>{busy ? <Spinner small /> : 'Delete'}</button></div></Modal>}
  </div>;
}
