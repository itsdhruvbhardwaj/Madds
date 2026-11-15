import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, clearSession, jsonBody, sessionEvent, setSession, storedSession, updateUser } from './api';
import { cacheCatalog, readCatalog } from './storage';
import type { CatalogSnapshot } from './storage';
import { normalizePreference } from './preferences';
import type { Collection, Preference, Section, Style, StylesResponse, Tokens, User } from './types';

type AppState = {
  user: User | null; authBusy: boolean; authError: string; clearAuthError: () => void;
  login: (email: string, password: string) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>; logout: () => Promise<void>; refreshUser: () => Promise<void>;
  preference: Preference; changePreference: (p: Preference) => Promise<void>;
  seed: string; shuffle: () => void;
  home: Section[]; styles: Style[]; collections: Collection[];
  loading: boolean; catalogError: string; cached: boolean; refreshCatalog: () => void;
  favoriteIds: Set<string>; favoriteStyles: Style[]; favoriteBusy: Set<string>; toggleFavorite: (id: string) => Promise<void>;
  favoritesError: string; refreshFavorites: () => void;
  toast: (text: string) => void; notice: string; online: boolean;
};
const Context = createContext<AppState | null>(null);
export function useApp() { const c = useContext(Context); if (!c) throw new Error('App state unavailable'); return c; }
export const describeError = (error: unknown) => error instanceof Error ? error.message : 'Could not complete this action. Please try again.';

export function AppProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(() => storedSession()?.user || null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [preference, setPreference] = useState<Preference>(() => {
    return normalizePreference(storedSession()?.user.stylePreference ?? localStorage.getItem('madds.preference'));
  });
  // Ordering changes between browsing sessions, never in the middle of pagination.
  const [seed, setSeed] = useState(() => crypto.randomUUID());
  const [notice, setNotice] = useState('');
  const toast = useCallback((text: string) => setNotice(text), []);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer); } }, [notice]);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => {
    let previousOwner = storedSession()?.user.id;
    const sync = () => {
      const session = storedSession();
      if (session?.user.id !== previousOwner) {
        // Do not retain another account's private query data after switching.
        void queryClient.cancelQueries({ predicate: q => q.meta?.private === true });
        queryClient.removeQueries({ predicate: q => q.meta?.private === true });
        previousOwner = session?.user.id;
      }
      setUser(session?.user || null);
      setPreference(normalizePreference(session ? session.user.stylePreference : localStorage.getItem('madds.preference')));
    };
    window.addEventListener(sessionEvent, sync);
    return () => window.removeEventListener(sessionEvent, sync);
  }, [queryClient]);
  const refreshUser = useCallback(async () => {
    if (!storedSession()) return;
    const { user: fresh } = await api<{ user: User }>('/api/auth/me', {}, true);
    updateUser(fresh); setAuthError('');
  }, []);
  useEffect(() => { void refreshUser().catch(e => setAuthError(describeError(e))); }, [refreshUser]);
  useEffect(() => { if (online && storedSession()) void refreshUser().catch(e => setAuthError(describeError(e))); }, [online, refreshUser]);
  const completeLogin = async (path: string, body: unknown) => {
    setAuthBusy(true); setAuthError('');
    try {
      const data = await api<Tokens>(path, jsonBody(body));
      setSession(data);
    } finally { setAuthBusy(false); }
  };
  const changePreference = async (p: Preference) => {
    if (user) {
      const data = await api<{ user: User }>('/api/profile/style-preference', jsonBody({ preference: p }, 'PATCH'), true);
      updateUser(data.user);
    }
    localStorage.setItem('madds.preference', p); setPreference(p);
  };

  const [cachedCatalog, setCachedCatalog] = useState<{ preference: Preference; snapshot: CatalogSnapshot }>();
  const catalogue = useQuery({
    queryKey: ['catalog', preference, seed],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ gender: preference, shuffleSeed: seed });
      const [home, collections, first] = await Promise.all([
        api<{ sections: Section[] }>(`/api/home/config?includeStyles=true&${params}`, { signal }),
        api<{ collections: Collection[] }>(`/api/collections?gender=${preference}`, { signal }),
        api<StylesResponse>(`/api/styles?limit=50&page=1&trendingFirst=true&${params}`, { signal }),
      ]);
      const pages = await Promise.all(Array.from({ length: Math.max(0, first.pagination.totalPages - 1) }, (_, i) =>
        api<StylesResponse>(`/api/styles?limit=50&page=${i + 2}&trendingFirst=true&${params}`, { signal })));
      const snapshot = { home: home.sections.filter(s => s.visible !== false), collections: collections.collections,
        styles: [...first.styles, ...pages.flatMap(p => p.styles)], savedAt: Date.now() };
      void cacheCatalog(preference, snapshot).catch(() => {});
      return snapshot;
    }, staleTime: 5 * 60_000,
  });
  useEffect(() => {
    let active = true; setCachedCatalog(undefined);
    void readCatalog(preference).then(snapshot => { if (active && snapshot) setCachedCatalog({ preference, snapshot }); }).catch(() => {});
    return () => { active = false; };
  }, [preference]);
  const catalog = catalogue.data || (cachedCatalog?.preference === preference ? cachedCatalog.snapshot : undefined);

  const favorites = useQuery({ queryKey: ['favorites', user?.id], meta: { private: true }, enabled: Boolean(user) && online,
    queryFn: ({ signal }) => api<{ favorites: Style[] }>('/api/me/favorites', { signal }, true), staleTime: 60_000 });
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<string, boolean>>({});
  const [favoriteBusy, setFavoriteBusy] = useState<Set<string>>(new Set());
  useEffect(() => { setFavoriteOverrides({}); setFavoriteBusy(new Set()); }, [user?.id]);
  const favoriteIds = useMemo(() => {
    const ids = new Set(favorites.data?.favorites.map(s => s.id));
    Object.entries(favoriteOverrides).forEach(([id, on]) => on ? ids.add(id) : ids.delete(id));
    return ids;
  }, [favorites.data, favoriteOverrides]);
  const favoriteStyles = useMemo(() => {
    const byId = new Map<string, Style>();
    // Keep favourites outside the current discovery preference visible too.
    [...(favorites.data?.favorites || []), ...(catalog?.styles || [])].forEach(style => {
      if (favoriteIds.has(style.id)) byId.set(style.id, style);
    });
    return [...byId.values()];
  }, [favorites.data, catalog, favoriteIds]);
  const toggleFavorite = async (id: string) => {
    if (!user || favoriteBusy.has(id)) return;
    const owner = user.id;
    const next = !favoriteIds.has(id);
    setFavoriteOverrides(p => ({ ...p, [id]: next }));
    setFavoriteBusy(p => new Set(p).add(id));
    try {
      await api(`/api/me/favorites/${encodeURIComponent(id)}`, { method: next ? 'PUT' : 'DELETE' }, true);
      if (storedSession()?.user.id === owner) void favorites.refetch();
    } catch (e) {
      if (storedSession()?.user.id === owner) { setFavoriteOverrides(p => ({ ...p, [id]: !next })); toast(describeError(e)); }
    } finally {
      if (storedSession()?.user.id === owner) setFavoriteBusy(p => { const n = new Set(p); n.delete(id); return n; });
    }
  };
  return <Context.Provider value={{
    user, authBusy, authError, clearAuthError: () => setAuthError(''),
    login: (email, password) => completeLogin('/api/auth/login', { email, password }),
    googleLogin: credential => completeLogin('/api/auth/google', { idToken: credential }),
    logout: async () => {
      try { await api('/api/auth/logout', { method: 'POST' }, true); } catch (e) { if (!(e instanceof ApiError && e.status === 401)) { toast(describeError(e)); throw e; } }
      clearSession();
    }, refreshUser, preference, changePreference, seed,
    shuffle: () => setSeed(crypto.randomUUID()),
    home: catalog?.home || [], styles: catalog?.styles || [], collections: catalog?.collections || [],
    loading: catalogue.isFetching && !catalog, catalogError: catalogue.error ? describeError(catalogue.error) : '',
    cached: !catalogue.data && Boolean(catalog), refreshCatalog: () => { void catalogue.refetch(); },
    favoriteIds, favoriteStyles, favoriteBusy, toggleFavorite, favoritesError: favorites.error ? describeError(favorites.error) : '',
    refreshFavorites: () => { void favorites.refetch(); }, toast, notice, online,
  }}>{children}</Context.Provider>;
}
