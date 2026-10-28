export interface UploadedImage {
  path: string;
  originalname: string;
  mimetype: string;
  buffer?: Buffer;
}

export interface GenerationUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface GeneratedImage {
  base64: string;
  mimeType?: string;
  usage?: GenerationUsage;
}

export interface GenerationRequest {
  styleId: string;
  images: UploadedImage[];
}

export interface GenerationProvider {
  generate(input: {
    prompt: string;
    images: UploadedImage[];
  }): Promise<GeneratedImage>;
}
