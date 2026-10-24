export interface Style {
  id: string;
  name: string;
  description: string;
  prompt: string;
  thumbnail: string | null;
  previewImages: string[];
  imageCount: 1 | 2 | 3;
  tokensRequired: number;
  collections: string[];
}
