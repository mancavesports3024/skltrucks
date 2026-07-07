import ContactForm from "@/components/ContactForm";
import { getSiteContent } from "@/lib/site-content";
import { phoneToHref } from "@/lib/phone";

export const metadata = { title: "Contact Us" };

export default async function ContactPage() {
  const site = await getSiteContent();
  const phoneHref = phoneToHref(site.contact.phone);

  return (
    <div className="py-12">
      <div className="mx-auto max-w-7xl px-4">
        <h1 className="font-oswald mb-8 text-3xl font-bold uppercase sm:mb-12 sm:text-4xl">Contact Us</h1>

        <div className="mb-12 grid gap-8 md:grid-cols-3">
          {[
            { title: "Location Address", content: site.contact.address },
            { title: "Phone Contact", content: site.contact.phone, href: phoneHref },
            {
              title: "Email Contact",
              content: site.contact.email,
              href: `mailto:${site.contact.email}`,
            },
          ].map((box) => (
            <div key={box.title} className="border border-neutral-200 p-8 text-center">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#fc0527]">
                {box.title}
              </h2>
              {box.href ? (
                <a href={box.href} className="text-neutral-700 hover:text-[#fc0527]">
                  {box.content}
                </a>
              ) : (
                <p className="text-neutral-700">{box.content}</p>
              )}
            </div>
          ))}
        </div>

        <div className="max-w-2xl">
          <h2 className="mb-6 text-xl font-bold">Have A Question For Us</h2>
          <ContactForm />
        </div>
      </div>
    </div>
  );
}
