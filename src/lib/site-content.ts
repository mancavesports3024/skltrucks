import { SITE } from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import type { SiteContent } from "@/types/site-content";

const CONTENT_ROW_ID = "main";

export const revalidate = 30;

export function defaultSiteContent(): SiteContent {
  return {
    hero: {
      headline: "Transportation\nSemi trucks and\nTrailers FOR SALE",
      image: SITE.heroImage,
      buttonText: "View All",
      buttonLink: "/shop",
    },
    about: {
      subtitle: "ABOUT US",
      title: "WELCOME TO SKL Trucks LLC",
      body:
        "We are a family-owned company where integrity meets trucking! We buy and sell class 7 & 8 trucks and trailers located on Route 66 in Southwest Missouri. We have over 30 years of experience buying and selling tractor trucks & trailers of all makes and models. SKL Trucks strive to give the best customer service and earning your trust for all your transportation needs.",
      image: SITE.aboutImage,
    },
    cta: {
      headline: "Transportation Semi trucks\nand Trailers FOR SALE",
      image: SITE.ctaImage,
      buttonText: "Contact Us",
      buttonLink: "/contact-us",
    },
    services: [
      {
        title: "TRUCK SALES",
        description:
          "Explore our wide selection of quality trucks and find the perfect vehicle to meet your needs.",
        href: "/truck-sales",
      },
      {
        title: "TRUCK FINANCING",
        description:
          "Get the best financing options for your truck with our easy and flexible financing solutions.",
        href: "/truck-financing",
      },
      {
        title: "SELL MY TRUCK",
        description:
          "Easily sell your truck with us – trade-in, consignment, or direct sale options available.",
        href: "/sell-my-truck",
      },
    ],
    whyChoose: {
      subtitle: "WHY CHOOSE US",
      title: "Your Trusted Truck Partner",
      body:
        "We specialize in all makes and models in the used truck and trailer industry. Medium duty, over the road Trucks and Trailers, Box trucks, Reefer trucks and trailers, Specialty trucks, boom Trucks, Crane Trucks, oil field trucks ETC. Let our sales team help you with all your transportation needs. If we don't have it in stock, we will find it for you. We are always looking to buy your truck, take it in on trade, or advertise and sell your truck on consignment. If you need financing, fill out our credit application. Here at SKL Trucks we value you and your business.",
      image: SITE.whyChooseImage,
    },
    contact: {
      phone: SITE.phone,
      email: SITE.email,
      address: SITE.address,
    },
    social: {
      facebook: SITE.facebook,
      linkedin: SITE.linkedin,
    },
  };
}

function mergeWithDefaults(partial: Partial<SiteContent> | null | undefined): SiteContent {
  const defaults = defaultSiteContent();
  if (!partial) return defaults;

  return {
    hero: { ...defaults.hero, ...partial.hero },
    about: { ...defaults.about, ...partial.about },
    cta: { ...defaults.cta, ...partial.cta },
    services:
      partial.services?.length === 3
        ? partial.services.map((service, index) => ({
            ...defaults.services[index],
            ...service,
          }))
        : defaults.services,
    whyChoose: { ...defaults.whyChoose, ...partial.whyChoose },
    contact: { ...defaults.contact, ...partial.contact },
    social: { ...defaults.social, ...partial.social },
  };
}

async function fetchFromDb(): Promise<SiteContent | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("site_content")
      .select("content")
      .eq("id", CONTENT_ROW_ID)
      .maybeSingle();

    if (error) {
      console.error("[site-content] Supabase error:", error.message);
      return null;
    }

    if (!data?.content) return null;
    return mergeWithDefaults(data.content as Partial<SiteContent>);
  } catch (err) {
    console.error("[site-content] fetch error:", err);
    return null;
  }
}

async function fetchAdminFromDb(): Promise<SiteContent | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("site_content")
      .select("content")
      .eq("id", CONTENT_ROW_ID)
      .maybeSingle();

    if (error) {
      console.error("[site-content] admin error:", error.message);
      return null;
    }

    if (!data?.content) return null;
    return mergeWithDefaults(data.content as Partial<SiteContent>);
  } catch (err) {
    console.error("[site-content] admin fetch error:", err);
    return null;
  }
}

export async function getSiteContent(): Promise<SiteContent> {
  const fromDb = await fetchFromDb();
  return fromDb ?? defaultSiteContent();
}

export async function getSiteContentAdmin(): Promise<SiteContent> {
  const fromDb = await fetchAdminFromDb();
  return fromDb ?? defaultSiteContent();
}

export function parseSiteContentForm(formData: FormData): SiteContent {
  const defaults = defaultSiteContent();

  const services: SiteContent["services"] = [0, 1, 2].map((index) => ({
    title: (formData.get(`service_${index}_title`) as string) || defaults.services[index].title,
    description:
      (formData.get(`service_${index}_description`) as string) ||
      defaults.services[index].description,
    href: (formData.get(`service_${index}_href`) as string) || defaults.services[index].href,
  }));

  return {
    hero: {
      headline: (formData.get("hero_headline") as string) || defaults.hero.headline,
      image: (formData.get("hero_image") as string) || defaults.hero.image,
      buttonText: (formData.get("hero_buttonText") as string) || defaults.hero.buttonText,
      buttonLink: (formData.get("hero_buttonLink") as string) || defaults.hero.buttonLink,
    },
    about: {
      subtitle: (formData.get("about_subtitle") as string) || defaults.about.subtitle,
      title: (formData.get("about_title") as string) || defaults.about.title,
      body: (formData.get("about_body") as string) || defaults.about.body,
      image: (formData.get("about_image") as string) || defaults.about.image,
    },
    cta: {
      headline: (formData.get("cta_headline") as string) || defaults.cta.headline,
      image: (formData.get("cta_image") as string) || defaults.cta.image,
      buttonText: (formData.get("cta_buttonText") as string) || defaults.cta.buttonText,
      buttonLink: (formData.get("cta_buttonLink") as string) || defaults.cta.buttonLink,
    },
    services,
    whyChoose: {
      subtitle: (formData.get("whyChoose_subtitle") as string) || defaults.whyChoose.subtitle,
      title: (formData.get("whyChoose_title") as string) || defaults.whyChoose.title,
      body: (formData.get("whyChoose_body") as string) || defaults.whyChoose.body,
      image: (formData.get("whyChoose_image") as string) || defaults.whyChoose.image,
    },
    contact: {
      phone: (formData.get("contact_phone") as string) || defaults.contact.phone,
      email: (formData.get("contact_email") as string) || defaults.contact.email,
      address: (formData.get("contact_address") as string) || defaults.contact.address,
    },
    social: {
      facebook: (formData.get("social_facebook") as string) || defaults.social.facebook,
      linkedin: (formData.get("social_linkedin") as string) || defaults.social.linkedin,
    },
  };
}
