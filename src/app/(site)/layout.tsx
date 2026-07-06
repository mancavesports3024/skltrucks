import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getSiteContent, revalidate } from "@/lib/site-content";

export { revalidate };

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const site = await getSiteContent();

  return (
    <>
      <Header contact={site.contact} social={site.social} />
      <main className="flex-1">{children}</main>
      <Footer contact={site.contact} />
    </>
  );
}
