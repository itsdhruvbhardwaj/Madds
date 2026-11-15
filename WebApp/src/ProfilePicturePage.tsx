import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Check, Upload } from 'lucide-react';
import { SignInGate } from './App';
import { updateUser } from './api';
import { CompactHeader, ErrorNotice, ProfilePicture, Spinner } from './components';
import { avatarBackgrounds, avatarFill, avatarOptions, prepareProfilePhoto, saveAvatar, saveProfilePhoto, validAvatar } from './profileAppearance';
import { describeError, useApp } from './state';

export function ProfileAppearancePage() {
  const { user, toast } = useApp(); const navigate = useNavigate();
  const [mode, setMode] = useState<'avatar' | 'photo'>(user?.profileImage && user.profileAppearance !== 'avatar' ? 'photo' : 'avatar');
  const [avatar, setAvatar] = useState(validAvatar(user?.avatarId) ? user!.avatarId! : avatarOptions[0].id);
  const [background, setBackground] = useState(avatarBackgrounds.some(b => b.id === user?.avatarBackground) ? user!.avatarBackground! : 'gold');
  const [photo, setPhoto] = useState<File>(); const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const working = useRef(false);
  useEffect(() => { if (!photo) { setPreview(''); return; } const url = URL.createObjectURL(photo); setPreview(url); return () => URL.revokeObjectURL(url); }, [photo]);
  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || working.current) return;
    working.current = true; setBusy(true); setError('');
    try { setPhoto(await prepareProfilePhoto(file)); }
    catch (e) { setError(describeError(e)); }
    finally { working.current = false; setBusy(false); }
  };
  const save = async () => {
    if (!user || working.current || (mode === 'photo' && !photo)) return;
    working.current = true; setBusy(true); setError('');
    try {
      const result = mode === 'avatar' ? await saveAvatar(avatar, background) : await saveProfilePhoto(photo!);
      updateUser(result.user); toast('Profile picture updated'); navigate('/profile');
    } catch (e) { setError(describeError(e)); }
    finally { working.current = false; setBusy(false); }
  };
  const previewUser = user ? { ...user, profileAppearance: mode, avatarId: avatar, avatarBackground: background,
    profileImage: mode === 'photo' ? preview || user.profileImage : '' } : null;
  return <><CompactHeader title="Edit profile picture" back="/profile" /><main className="appearance-page">{!user ? <SignInGate /> : <>
    <div className="appearance-preview"><ProfilePicture user={previewUser} /><p>Make Madds yours</p></div>
    <div className="appearance-tabs" role="group" aria-label="Profile picture type"><button aria-pressed={mode === 'avatar'} disabled={busy} onClick={() => { setMode('avatar'); setError(''); }}>Avatars</button><button aria-pressed={mode === 'photo'} disabled={busy} onClick={() => { setMode('photo'); setError(''); }}><Camera size={16} />Your photo</button></div>
    {mode === 'avatar' ? <>
      <div className="background-picker" role="group" aria-label="Avatar background">{avatarBackgrounds.map(b => <button key={b.id} aria-label={`${b.label} background`} aria-pressed={background === b.id} disabled={busy} style={{ background: b.fill }} onClick={() => setBackground(b.id)}>{background === b.id && <Check size={18} />}</button>)}</div>
      <div className="avatar-grid" role="group" aria-label="Choose an avatar">{avatarOptions.map(a => <button key={a.id} aria-label={a.label} aria-pressed={avatar === a.id} disabled={busy} style={{ background: avatarFill(background) }} onClick={() => setAvatar(a.id)}><img src={`/assets/avatars/${a.id}.png`} alt="" loading="lazy" />{avatar === a.id && <span><Check size={13} /></span>}</button>)}</div>
    </> : <div className="profile-photo-picker"><label className={`button secondary ${busy ? 'disabled' : ''}`}><Upload size={17} />{photo ? 'Choose another photo' : 'Choose a photo'}<input aria-label="Choose profile photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" disabled={busy} onChange={event => void choose(event)} /></label><p>Choose a photo with your face in the centre. We’ll crop it to fit your profile.</p><small>Up to 20 MB · iPhone photos supported when your browser can open them</small></div>}
    <div className="appearance-save">{error && <ErrorNotice message={error} />}<button className="button primary full" disabled={busy || (mode === 'photo' && !photo)} onClick={() => void save()}>{busy ? <Spinner small /> : <Check size={17} />}Save profile picture</button><p>This updates your Madds account on web and Android.</p></div>
  </>}</main></>;
}
