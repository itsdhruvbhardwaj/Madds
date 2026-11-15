export type Preference = 'all' | 'female' | 'male';
export interface Style {
  id: string; name: string; description: string; thumbnail: string;
  genderTag: 'her' | 'him' | 'none'; tokensRequired: number; imageCount: number;
  exampleBeforeUrl?: string; exampleAfterUrl?: string; previewImages?: string[];
  collections: string[];
}
export interface Section { id: string; title: string; slug: string; visible: boolean; styles: Style[] }
export interface Collection { id: string; name: string; thumbnail: string; styleCount: number }
export interface User {
  id: string; name: string; email: string; credits: number; emailVerified: boolean;
  profileImage?: string; profileAppearance?: string; avatarId?: string;
  stylePreference?: Preference; hasPassword?: boolean;
}
export interface Tokens { accessToken: string; refreshToken: string; user: User }
export interface StylesResponse { styles: Style[]; collections: string[]; pagination: { currentPage: number; totalPages: number; totalCount: number; hasNextPage: boolean } }
export interface Generation {
  id: string; styleId: string; styleName: string; status: string; resultAvailable: boolean;
  resultExpiresAt?: string; processingExpiresAt?: string; failureReason?: string; serverNow?: string;
}
export interface GalleryResponse { items: Generation[]; nextCursor: string | null; serverNow?: string }
export interface GenerationResult { ok: boolean; image?: string; generationId?: string; status?: string; resultExpiresAt?: string; serverNow?: string }
export interface SavedPhoto { id: string; owner: string; name: string; blob: Blob; savedAt: number }
