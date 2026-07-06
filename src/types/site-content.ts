export interface HeroContent {
  headline: string;
  image: string;
  buttonText: string;
  buttonLink: string;
}

export interface AboutContent {
  subtitle: string;
  title: string;
  body: string;
  image: string;
}

export interface CtaContent {
  headline: string;
  image: string;
  buttonText: string;
  buttonLink: string;
}

export interface ServiceCard {
  title: string;
  description: string;
  href: string;
}

export interface WhyChooseContent {
  subtitle: string;
  title: string;
  body: string;
  image: string;
}

export interface ContactContent {
  phone: string;
  email: string;
  address: string;
}

export interface SocialContent {
  facebook: string;
  linkedin: string;
}

export interface SiteContent {
  hero: HeroContent;
  about: AboutContent;
  cta: CtaContent;
  services: ServiceCard[];
  whyChoose: WhyChooseContent;
  contact: ContactContent;
  social: SocialContent;
}

export type SiteContentInput = SiteContent;
