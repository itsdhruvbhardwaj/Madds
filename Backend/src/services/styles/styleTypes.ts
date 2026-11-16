export interface Style {
  id: string;
  name: string;
  description: string;
  prompt: string;
  verified?: boolean;
  genderTag?: "her" | "him" | "none";
  tags?: string[];
  variantLabel?: string;
  group?: { id: string; name: string; coverStyleId: string; variants: Style[] };
  thumbnail: string | null;
  thumbnailPublicId?: string | null;
  exampleBeforeUrl?: string | null;
  exampleBeforePublicId?: string | null;
  exampleAfterUrl?: string | null;
  exampleAfterPublicId?: string | null;
  previewImages: string[];
  previewImagePublicIds?: string[];
  imageCount: 1 | 2 | 3;
  tokensRequired: number;
  collections: string[];
}
