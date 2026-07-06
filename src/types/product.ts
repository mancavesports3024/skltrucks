export interface Product {
  id: string;
  slug: string;
  name: string;
  price: number;
  image: string;
  images: string[];
  categories: string[];
  categorySlugs: string[];
  type: string;
  manufacturer: string;
  vin: string;
  year: string;
  model: string;
  miles: string;
  hours: string;
  condition: string;
  details: Record<string, string>;
  published?: boolean;
}

export interface ProductInput {
  name: string;
  price: number;
  image: string;
  images: string[];
  categories: string[];
  categorySlugs: string[];
  type: string;
  manufacturer: string;
  vin: string;
  year: string;
  model: string;
  miles: string;
  hours: string;
  condition: string;
  details: Record<string, string>;
  published: boolean;
}
