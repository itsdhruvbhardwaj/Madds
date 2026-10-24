export interface HomeSection {
  id: string;
  title: string;
  type: "collection";
  slug?: string;
  visible: boolean;
  order: number;
}

export const homeSections: HomeSection[] = [
  {
    id: "trending-styles",
    title: "Trending Styles",
    type: "collection",
    slug: "Trending",
    visible: true,
    order: 1,
  },
  {
    id: "popular",
    title: "Popular",
    type: "collection",
    slug: "Popular",
    visible: true,
    order: 2,
  },
  {
    id: "couple",
    title: "Couple",
    type: "collection",
    slug: "Couple",
    visible: true,
    order: 3,
  },
  {
    id: "merge",
    title: "Merge",
    type: "collection",
    slug: "Merge",
    visible: true,
    order: 4,
  },
  {
    id: "professional",
    title: "Professional",
    type: "collection",
    slug: "Professional",
    visible: true,
    order: 5,
  },
  {
    id: "bhakti",
    title: "Bhakti",
    type: "collection",
    slug: "Bhakti",
    visible: true,
    order: 6,
  },
  {
    id: "artistic-styles",
    title: "Artistic Styles",
    type: "collection",
    slug: "Artistic",
    visible: true,
    order: 1,
  },
  {
    id: "saree-styles",
    title: "Saree",
    type: "collection",
    slug: "Saree",
    visible: true,
    order: 1,
  },
];
