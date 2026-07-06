import Link from "next/link";

export const metadata = { title: "Services" };

const services = [
  {
    title: "Truck Sales",
    desc: "Explore our wide selection of quality trucks and find the perfect vehicle to meet your needs.",
    href: "/truck-sales",
  },
  {
    title: "Truck Financing",
    desc: "Get the best financing options for your truck with our easy and flexible financing solutions.",
    href: "/truck-financing",
  },
  {
    title: "Sell My Truck",
    desc: "Easily sell your truck with us – trade-in, consignment, or direct sale options available.",
    href: "/sell-my-truck",
  },
  {
    title: "Inventory Search",
    desc: "Browse our full inventory of sleeper trucks, day cabs, box trucks, and more.",
    href: "/shop",
  },
  {
    title: "Contact Us",
    desc: "Reach out to our sales team for personalized assistance with your transportation needs.",
    href: "/contact-us",
  },
  {
    title: "Credit Application",
    desc: "Apply for truck financing online with our secure credit application form.",
    href: "/financing",
  },
];

export default function ServicesPage() {
  return (
    <div className="py-12">
      <div className="mx-auto max-w-7xl px-4">
        <h1 className="font-oswald mb-12 text-4xl font-bold uppercase">Services</h1>
        <div className="grid gap-8 md:grid-cols-3">
          {services.map((s) => (
            <div key={s.title} className="border border-neutral-200 p-8 transition-shadow hover:shadow-lg">
              <h2 className="mb-4 text-lg font-bold uppercase">{s.title}</h2>
              <p className="mb-6 text-sm text-neutral-600 leading-relaxed">{s.desc}</p>
              <Link href={s.href} className="text-sm font-semibold uppercase text-[#fc0527] hover:underline">
                Read More
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
