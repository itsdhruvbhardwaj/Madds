export interface Style {
  id: string;
  name: string;
  description: string;
  prompt: string;
  verified?: boolean;
  genderTag?: "her" | "him" | "none";
  tags?: string[];
  groupName?: string;
  variantLabel?: string;
  group?: { id: string; name: string; coverStyleId: string; variants: Style[] };
  thumbnail: string | null;
  thumbnailPublicId?: string | null;
  coverAfterLinked?: boolean;
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
