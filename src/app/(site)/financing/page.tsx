import FinancingForm from "@/components/FinancingForm";

export const metadata = { title: "Financing" };

export default function FinancingPage() {
  return (
    <div className="py-12">
      <div className="mx-auto max-w-4xl px-4">
        <h1 className="font-oswald mb-4 text-4xl font-bold uppercase">Financing</h1>
        <p className="mb-10 text-neutral-600">Credit Application Form</p>
        <FinancingForm />
      </div>
    </div>
  );
}
