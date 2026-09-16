import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { absoluteUrl } from "@/lib/seo/site-url";
import { getSiteContent, revalidate } from "@/lib/site-content";

export { revalidate };

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const site = await getSiteContent();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "SKL Trucks LLC",
    url: absoluteUrl("/"),
    publisher: {
      "@type": "Organization",
      name: "SKL Trucks LLC",
      url: absoluteUrl("/"),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header contact={site.contact} social={site.social} />
      <main className="flex-1">{children}</main>
      <Footer contact={site.contact} />
    </>
  );
}
