import SellTruckForm from "@/components/SellTruckForm";
import { indexablePageMetadata } from "@/lib/seo/page-metadata";

export const metadata = indexablePageMetadata("/sell-my-truck", { title: "Sell My Truck" });

export default function SellMyTruckPage() {
  return (
    <div className="py-12">
      <div className="mx-auto max-w-3xl px-4">
        <h1 className="font-oswald mb-10 text-4xl font-bold uppercase">Sell My Truck</h1>
        <SellTruckForm />
      </div>
    </div>
  );
}
