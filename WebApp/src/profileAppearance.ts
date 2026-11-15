import { api, jsonBody } from './api';
import type { User } from './types';

const unavailable = new Set([20, 27, 28, 67, 68]);
export const avatarOptions = Array.from({ length: 119 }, (_, i) => i + 1)
  .filter(n => !unavailable.has(n)).map(n => ({ id: `avatar_${String(n).padStart(3, '0')}`, label: `Avatar ${n}` }));
export const avatarBackgrounds = [
  { id: 'gold', label: 'Gold', fill: 'linear-gradient(135deg,#ffe8b0,#b88c43,#e8ce91)' },
  { id: 'ivory', label: 'Ivory', fill: 'linear-gradient(135deg,#f0e3c8,#d4c19b)' },
  { id: 'clay', label: 'Clay', fill: 'linear-gradient(135deg,#d79c79,#a56f54)' },
  { id: 'sage', label: 'Sage', fill: 'linear-gradient(135deg,#9ba68a,#64715c)' },
  { id: 'slate', label: 'Slate', fill: 'linear-gradient(135deg,#8899ac,#4f6074)' },
  { id: 'charcoal', label: 'Charcoal', fill: 'linear-gradient(135deg,#46484b,#222324)' },
];
export const avatarFill = (background?: string) => (avatarBackgrounds.find(b => b.id === background) || avatarBackgrounds[0]).fill;
export const validAvatar = (id?: string) => avatarOptions.some(a => a.id === id);

export function saveAvatar(avatarId: string, avatarBackground: string) {
  if (!validAvatar(avatarId) || !avatarBackgrounds.some(b => b.id === avatarBackground)) throw new Error('Choose a valid avatar and background.');
  return api<{ user: User }>('/api/profile/appearance', jsonBody({ profileAppearance: 'avatar', avatarId, avatarBackground }, 'PATCH'), true);
}
export function saveProfilePhoto(photo: File) {
  const body = new FormData(); body.set('image', photo);
  return api<{ user: User }>('/api/profile/photo', { method: 'POST', body }, true, 60000);
}

export async function prepareProfilePhoto(file: File): Promise<File> {
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a photo smaller than 20 MB.');
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(file.type) && !/\.hei[cf]$/i.test(file.name)) {
    throw new Error('Choose a JPEG, PNG, WebP or supported iPhone photo.');
  }
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('This photo could not be opened. Try a JPEG, PNG or WebP image.')); img.src = source;
    });
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (!side) throw new Error('This photo is empty. Choose another image.');
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Your browser could not prepare this photo.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 512, 512);
    ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 512, 512);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not prepare this photo. Please try another.')), 'image/jpeg', .9));
    if (blob.size > 4 * 1024 * 1024) throw new Error('This photo is too large to upload. Choose another image.');
    return new File([blob], 'profile.jpg', { type: 'image/jpeg' });
  } finally { URL.revokeObjectURL(source); }
}
