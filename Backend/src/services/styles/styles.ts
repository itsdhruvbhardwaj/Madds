export interface Style {
  id: string;
  name: string;
  description: string;
  prompt: string;
  thumbnail: string | null;
  previewImages: string[];
  imageCount: 1 | 2;
  tokensRequired: number;
  category: string;
  collections: string[];
}

export const styles: Style[] = [
  {
    id: "cinematic-couple",
    name: "Cinematic Couple",
    description: "Create a cinematic couple portrait",
    prompt: "Create a cinematic, emotionally warm couple portrait with refined lighting and a natural composition.",
    thumbnail: "https://res.cloudinary.com/xjqlkkta/image/upload/w_500,h_500,c_fill,q_auto,f_auto/v1791225261/Golden-Hour_Riverfront_Embrace.png",
    previewImages: ["https://res.cloudinary.com/xjqlkkta/image/upload/w_500,h_500,c_fill,q_auto,f_auto/v1791469404/Golden-Hour_Embrace_Over_the_City.png"],
    imageCount: 2,
    tokensRequired: 10,
    category: "Portrait",
    collections: ["Couple", "Trending", "Merge"],
  },
  {
    id: "90s-bollywood",
    name: "90s Bollywood",
    description: "A colorful, nostalgic 1990s Bollywood-inspired portrait",
    prompt: "Apply a colorful, nostalgic 1990s Bollywood film aesthetic with expressive cinematic lighting and period-inspired color grading.",
    thumbnail: "https://res.cloudinary.com/xjqlkkta/image/upload/w_500,h_500,c_fill,q_auto,f_auto/v1791225254/90s_Bollywood_Mountain_Romance.png",
    previewImages: [],
    imageCount: 1,
    tokensRequired: 10,
    category: "Trending",
    collections: ["Trending", "Popular"]
  },
  {
    id: "vintage-film",
    name: "Vintage Film",
    description: "A timeless analog film portrait",
    prompt: "Create a timeless analog film portrait with subtle grain, gentle contrast, natural skin tones, and restrained vintage color.",
    thumbnail: "https://res.cloudinary.com/xjqlkkta/image/upload/w_500,h_500,c_fill,q_auto,f_auto/v1791225274/Nostalgic_Golden-Hour_Romance.png",
    previewImages: [],
    imageCount: 1,
    tokensRequired: 10,
    category: "Artistic",
    collections: ["Popular"]
  },
  {
    id: "anime-portrait",
    name: "Anime Portrait",
    description: "A polished anime-inspired portrait",
    prompt: "Render the portrait in a polished anime-inspired illustration style while preserving the subject's recognizable facial characteristics.",
    thumbnail: "https://res.cloudinary.com/xjqlkkta/image/upload/w_500,h_500,c_fill,q_auto,f_auto/v1791225270/Sunset_Selfie_for_Two.png",
    previewImages: [],
    imageCount: 1,
    tokensRequired: 10,
    category: "Artistic",
    collections: ["Popular"]
  },
  {
    id: "wedding",
    name: "Wedding",
    description: "An elegant, romantic wedding portrait",
    prompt: "Create an elegant, romantic wedding portrait with graceful composition, soft natural light, and refined editorial styling.",
    thumbnail: "https://res.cloudinary.com/xjqlkkta/image/upload/w_500,h_500,c_fill,q_auto,f_auto/v1791225259/Golden_Indian_Wedding_Embrace.png",
    previewImages: [],
    imageCount: 1,
    tokensRequired: 10,
    category: "Portrait",
    collections: ["Couple"]
  },
  {
    id: "professional-portrait",
    name: "Professional Portrait",
    description: "A polished professional headshot",
    prompt: "Create a polished professional portrait with flattering studio-quality light, a clean background, and natural, credible styling.",
    thumbnail: "https://res.cloudinary.com/xjqlkkta/image/upload/w_500,h_500,c_fill,q_auto,f_auto/v1791225246/Warm_Professional_Office_Portrait.png",
    previewImages: [],
    imageCount: 1,
    tokensRequired: 10,
    category: "Portrait",
    collections: ["Professional"]
  },
];

export function findStyle(styleId: string): Style | undefined {
  return styles.find((style) => style.id === styleId);
}

export function buildPrompt(style: Style, imageCount: number): string {
  const referenceInstructions = imageCount === 1
    ? "Use the uploaded image as the primary subject reference. Preserve the person's identity and recognizable facial characteristics. Avoid unnecessary changes to identity."
    : "Use the first reference image as the base scene and primary composition. Naturally incorporate the person from the second reference image into that scene. Preserve the recognizable facial characteristics and identity of both people. Do not simply place the two images side by side or concatenate them."

  return [
    referenceInstructions,
    style.prompt,
    "Apply the selected visual style to the composition while keeping the result realistic and high quality. Follow the reference composition unless the selected style requires a restrained adjustment. Do not identify or infer the identity of any person.",
  ].join(" ");
}
