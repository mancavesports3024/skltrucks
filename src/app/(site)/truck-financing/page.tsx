import Link from "next/link";

export const metadata = { title: "Truck Financing" };

export default function TruckFinancingPage() {
  return (
    <div className="py-12">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <h1 className="font-oswald mb-6 text-4xl font-bold uppercase">Truck Financing</h1>
        <p className="mb-10 text-neutral-600 leading-relaxed">
          Get the best financing options for your truck with our easy and flexible financing solutions.
          Fill out our credit application and our team will work with you to find the right financing plan.
        </p>
        <Link
          href="/financing"
          className="inline-block bg-[#fc0527] px-10 py-4 text-sm font-semibold uppercase text-white hover:bg-[#d90422] transition-colors"
        >
          Credit Application Form
        </Link>
      </div>
    </div>
  );
}
