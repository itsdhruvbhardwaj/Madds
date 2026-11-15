import type { SavedPhoto, Style, Section, Collection } from './types';

let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('madds-web-v1', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('photos', { keyPath: 'key' }); request.result.createObjectStore('catalog'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transaction<T>(store: string, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, mode);
    const request = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export async function savePhoto(photo: SavedPhoto) { await transaction('photos', 'readwrite', s => s.put({ ...photo, key: `${photo.owner}:${photo.id}` })); }
export async function savedPhotos(owner: string) { return (await transaction<SavedPhoto[]>('photos', 'readonly', s => s.getAll())).filter(p => p.owner === owner).sort((a, b) => b.savedAt - a.savedAt); }
export async function removeSaved(owner: string, id: string) { await transaction('photos', 'readwrite', s => s.delete(`${owner}:${id}`)); }
export type CatalogSnapshot = { home: Section[]; styles: Style[]; collections: Collection[]; savedAt: number };
export async function readCatalog(preference: string) { return transaction<CatalogSnapshot | undefined>('catalog', 'readonly', s => s.get(preference)); }
export async function cacheCatalog(preference: string, catalog: CatalogSnapshot) { await transaction('catalog', 'readwrite', s => s.put(catalog, preference)); }

export function imageUrl(url: string | undefined, large = false) {
  if (!url) return '';
  // Two fixed CDN variants: no per-render width or timestamp cache breakers.
  if (url.startsWith('https://res.cloudinary.com/') && url.includes('/image/upload/')) {
    return url.replace(/\/image\/upload\/(?:[^/]+,)*[^/]+(?=\/v\d+\/)/, `/image/upload/c_limit,w_${large ? 900 : 450},h_${large ? 1260 : 630},q_auto,f_auto`);
  }
  return url;
}
export function timeLeft(expires?: string, now = Date.now()) {
  if (!expires) return '';
  const minutes = Math.ceil((Date.parse(expires) - now) / 60000);
  if (!Number.isFinite(minutes) || minutes <= 0) return 'Expired';
  return minutes < 60 ? `${minutes}m left` : `${Math.floor(minutes / 60)}h ${minutes % 60}m left`;
}
export function imageDataUrl(value: string) {
  if (!/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(value)) throw new Error('The server returned an unsupported image. Please reopen the photo.');
  return value;
}
