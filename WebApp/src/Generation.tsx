import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Clock3, Images, Sparkles, Upload, X } from 'lucide-react';
import { api, ApiError } from './api';
import { CreditsSheet, SignInGate } from './App';
import { CompactHeader, ErrorNotice, Modal, Spinner } from './components';
import { describeError, useApp } from './state';
import type { Generation, GenerationResult, Style } from './types';

async function prepareUpload(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a photo smaller than 10 MB.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP photo. Export HEIC photos as JPEG first.');
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('This photo could not be opened. Please choose another.')); i.src = source; });
    const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Your browser could not prepare this photo.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not prepare this photo.')), 'image/jpeg', .92));
    return new File([blob], 'reference.jpg', { type: 'image/jpeg' });
  } finally { URL.revokeObjectURL(source); }
}
export function UploadSheet({ style, close }: { style: Style; close: () => void }) {
  const { user, refreshUser } = useApp(); const navigate = useNavigate(); const queries = useQueryClient();
  const [photos, setPhotos] = useState<File[]>([]); const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [credits, setCredits] = useState(false);
  const key = useRef<string | null>(null);
  const mounted = useRef(true); useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { const urls = photos.map(p => URL.createObjectURL(p)); setPreviews(urls); return () => urls.forEach(URL.revokeObjectURL); }, [photos]);
  const choose = async (e: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []); e.target.value = ''; setError('');
    if (selected.length + photos.length > style.imageCount) { setError(`Choose exactly ${style.imageCount} photo${style.imageCount === 1 ? '' : 's'} for this style.`); return; }
    setBusy(true);
    try { const prepared = await Promise.all(selected.map(prepareUpload)); setPhotos(old => [...old, ...prepared]); key.current = null; }
    catch (e) { setError(describeError(e)); } finally { setBusy(false); }
  };
  const start = async () => {
    if (!user || busy || photos.length !== style.imageCount) return;
    if (user.credits < style.tokensRequired) { setCredits(true); return; }
    setBusy(true); setError('');
    // Keep the same request key across uncertain responses; never repeat paid work with a new key.
    key.current ||= crypto.randomUUID();
    const requestKey = key.current;
    localStorage.setItem(`madds.pending.${user.id}`, JSON.stringify({ key: requestKey, styleId: style.id, styleName: style.name, startedAt: Date.now() }));
    const form = new FormData(); form.set('styleId', style.id); photos.forEach(p => form.append('images', p));
    try {
      await api<GenerationResult>('/api/generate', { method: 'POST', body: form, headers: { 'Idempotency-Key': requestKey, 'X-Generation-Recovery': '1' } }, true, 60000);
      void refreshUser().catch(() => {}); void queries.invalidateQueries({ queryKey: ['operations', user.id] });
      navigate(`/generating/${requestKey}`);
    } catch (e) {
      const uncertain = !(e instanceof ApiError) || e.status === 0 || e.status >= 500 || e.status === 409;
      if (uncertain) navigate(`/generating/${requestKey}`);
      else {
        localStorage.removeItem(`madds.pending.${user.id}`);
        if (e instanceof ApiError && e.status === 402) { void refreshUser().catch(() => {}); setCredits(true); }
        else setError(describeError(e));
      }
    } finally { if (mounted.current) setBusy(false); }
  };
  return <Modal title="Your photo. A whole new look." onClose={() => { if (!busy) close(); }} className="upload-modal"><p className="muted">{style.name}</p><div className="upload-grid">{previews.map((src, i) => <div className="upload-preview" key={src}><img src={src} alt={`Reference photo ${i + 1}`} /><button className="icon-button" disabled={busy} aria-label={`Remove photo ${i + 1}`} onClick={() => { setPhotos(p => p.filter((_, n) => n !== i)); key.current = null; }}><X size={17} /></button></div>)}{photos.length < style.imageCount && <label className="upload-target"><Upload size={28} /><strong>Add a photo</strong><span>JPEG, PNG or WebP · up to 10 MB</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple={style.imageCount > 1} disabled={busy} onChange={e => void choose(e)} /></label>}</div><div className="photo-tips"><Check size={16} /><span>Use a clear, well-lit photo with your face visible.</span></div><p className="legal-note">Only upload photos you have permission to use. Your photo will be sent for AI processing.</p>{error && <ErrorNotice message={error} />}<button className="button primary full" disabled={busy || photos.length !== style.imageCount} onClick={() => void start()}>{busy ? <Spinner small /> : <Sparkles size={18} />}Generate · {style.tokensRequired} credits<ArrowRight size={17} /></button><p className="upload-count">{photos.length} of {style.imageCount} photo{style.imageCount === 1 ? '' : 's'} selected</p>{credits && <CreditsSheet close={() => setCredits(false)} requiredCredits={style.tokensRequired} />}</Modal>;
}

export function GeneratePage() {
  const { key = '' } = useParams(); const { user, refreshUser, online } = useApp(); const navigate = useNavigate(); const queries = useQueryClient();
  const [slow, setSlow] = useState(false);
  const owner = user?.id;
  const operation = useQuery({ queryKey: ['pending-generation', owner, key], meta: { private: true }, enabled: Boolean(owner) && online,
    queryFn: ({ signal }) => api<Generation>(key.startsWith('id_') ? `/api/generations/${key.slice(3)}` : `/api/generations/by-key/${key}`, { signal }, true),
    refetchInterval: q => ['completed', 'failed', 'outcome_unknown'].includes(q.state.data?.status || '') ? false : 5000,
    retry: false, refetchIntervalInBackground: false });
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 20000); return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const g = operation.data;
    if (!g || !owner) return;
    if (g.status === 'completed') {
      localStorage.removeItem(`madds.pending.${owner}`);
      void queries.invalidateQueries({ queryKey: ['gallery', owner] });
      void queries.invalidateQueries({ queryKey: ['operations', owner] });
      void refreshUser().catch(() => {});
      navigate(`/generations/${g.id}`, { replace: true });
    }
  }, [operation.data, owner]);
  const failed = operation.data?.status === 'failed'; const unknown = operation.data?.status === 'outcome_unknown';
  return <><CompactHeader title={failed ? 'Your generation' : 'Creating Your AI Photo'} back="/generations" /><main className="generation-page">{!user ? <SignInGate /> : <><div className="generation-frame"><div className="generation-orbit"><img src="/assets/icon.png" alt="" /><span /><span /><span /></div><div className="generation-inner"><Sparkles size={27} /><span>{failed || unknown ? 'Let’s check on your photo' : 'A little magic is happening'}</span></div></div>
    {operation.error ? <ErrorNotice message={operation.error instanceof ApiError && operation.error.status === 404 ? 'We haven’t confirmed this request yet. Check again before starting another generation.' : describeError(operation.error)} retry={() => void operation.refetch()} /> : failed || unknown ? <ErrorNotice message={operation.data?.failureReason || 'Your generation needs checking. Do not submit it again. Contact support if this continues.'} retry={() => void operation.refetch()} /> : <><p className="generation-status">{slow ? 'Good things take a moment. You can keep browsing.' : 'Creating your photo… You can browse while it finishes.'}</p><div className="progress-track"><span /></div></>}
    <div className="info-box"><Clock3 size={17} /><span>Once ready, your image will be available in My Generations for 24 hours. Save your favourites to keep them.</span></div><Link className="button secondary" to="/generations"><Images size={18} />My Generations</Link>
  </>}</main></>;
}
