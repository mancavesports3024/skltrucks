import ContactForm from "@/components/ContactForm";
import { SITE } from "@/lib/constants";

export const metadata = { title: "Contact Us" };

export default function ContactPage() {
  return (
    <div className="py-12">
      <div className="mx-auto max-w-7xl px-4">
        <h1 className="font-oswald mb-12 text-4xl font-bold uppercase">Contact Us</h1>

        <div className="mb-12 grid gap-8 md:grid-cols-3">
          {[
            { title: "Location Address", content: SITE.address },
            { title: "Phone Contact", content: SITE.phone, href: SITE.phoneHref },
            { title: "Email Contact", content: SITE.email, href: `mailto:${SITE.email}` },
          ].map((box) => (
            <div key={box.title} className="border border-neutral-200 p-8 text-center">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#fc0527]">{box.title}</h2>
              {box.href ? (
                <a href={box.href} className="text-neutral-700 hover:text-[#fc0527]">{box.content}</a>
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
