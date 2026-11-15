import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { avatarIds, avatarBackgrounds as serverBackgrounds } from '../../Backend/src/services/avatarCatalog';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/api', () => ({ api: request, jsonBody: (body: unknown, method = 'POST') => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }));
import { avatarOptions, avatarBackgrounds, prepareProfilePhoto, saveAvatar, saveProfilePhoto } from '../src/profileAppearance';

beforeEach(() => request.mockReset());
afterEach(() => vi.unstubAllGlobals());
describe('profile picture integration', () => {
  it('offers exactly the avatars and backgrounds supported by Android/backend, with every image bundled', () => {
    expect(new Set(avatarOptions.map(a => a.id))).toEqual(avatarIds);
    expect(new Set(avatarBackgrounds.map(b => b.id))).toEqual(serverBackgrounds);
    for (const avatar of avatarOptions) expect(existsSync(new URL(`../public/assets/avatars/${avatar.id}.png`, import.meta.url))).toBe(true);
  });
  it('saves an avatar through the protected appearance endpoint and rejects unsupported choices', async () => {
    request.mockResolvedValue({ user: { id: 'user-a', profileAppearance: 'avatar' } });
    await saveAvatar('avatar_009', 'sage');
    expect(request).toHaveBeenCalledWith('/api/profile/appearance', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ profileAppearance: 'avatar', avatarId: 'avatar_009', avatarBackground: 'sage' }) }), true);
    expect(() => saveAvatar('avatar_020', 'sage')).toThrow();
    expect(() => saveAvatar('avatar_009', 'unsupported')).toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('uploads the photo under the backend-required multipart image field', async () => {
    const file = new File(['photo'], 'profile.jpg', { type: 'image/jpeg' });
    await saveProfilePhoto(file);
    const [path, options, authenticated] = request.mock.calls[0];
    expect(path).toBe('/api/profile/photo'); expect(authenticated).toBe(true);
    expect(options.body.get('image')).toEqual(file); expect(options.headers).toBeUndefined();
  });
  it('crops a large source to 512 square, re-encodes as JPEG and releases its source URL', async () => {
    const drawImage = vi.fn(); const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL });
    vi.stubGlobal('Image', class { naturalWidth = 1800; naturalHeight = 1200; onload?: () => void; set src(_value: string) { this.onload?.(); } });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect: vi.fn(), drawImage }), toBlob: (done: (b: Blob) => void) => done(new Blob(['encoded'], { type: 'image/jpeg' })) }) });
    const file = await prepareProfilePhoto(new File(['input'], 'photo.png', { type: 'image/png' }));
    expect(file.type).toBe('image/jpeg'); expect(file.name).toBe('profile.jpg');
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 300, 0, 1200, 1200, 0, 0, 512, 512);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
  it('rejects unreadable files and releases their preview resources', async () => {
    const revokeObjectURL = vi.fn(); vi.stubGlobal('URL', { createObjectURL: () => 'blob:bad', revokeObjectURL });
    vi.stubGlobal('Image', class { onerror?: () => void; set src(_value: string) { this.onerror?.(); } });
    await expect(prepareProfilePhoto(new File(['broken'], 'photo.jpg', { type: 'image/jpeg' }))).rejects.toThrow('could not be opened');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:bad');
    await expect(prepareProfilePhoto(new File(['text'], 'bad.txt', { type: 'text/plain' }))).rejects.toThrow('Choose a JPEG');
  });
});
