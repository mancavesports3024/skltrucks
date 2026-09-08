export interface Product {
  id: string;
  slug: string;
  name: string;
  price: number;
  image: string;
  images: string[];
  categories: string[];
  categorySlugs: string[];
  cabType?: string;
  type: string;
  manufacturer: string;
  vin: string;
  year: string;
  model: string;
  miles: string;
  hours: string;
  condition: string;
  /** Seller notes shown on the product page (e.g. new tires, recent parts). */
  comments?: string;
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
  cabType?: string;
  type: string;
  manufacturer: string;
  vin: string;
  year: string;
  model: string;
  miles: string;
  hours: string;
  condition: string;
  comments?: string;
  details: Record<string, string>;
  published: boolean;
}
