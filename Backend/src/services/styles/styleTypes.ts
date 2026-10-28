export interface Style {
  id: string;
  name: string;
  description: string;
  prompt: string;
  thumbnail: string | null;
  thumbnailPublicId?: string | null;
  exampleBeforeUrl?: string | null;
  exampleBeforePublicId?: string | null;
  exampleAfterUrl?: string | null;
  exampleAfterPublicId?: string | null;
  previewImages: string[];
  imageCount: 1 | 2 | 3;
  tokensRequired: number;
  collections: string[];
}
