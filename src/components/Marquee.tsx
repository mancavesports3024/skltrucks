import Image from "next/image";
import { SITE } from "@/lib/constants";

export default function Marquee() {
  const items = Array.from({ length: 12 });

  return (
    <div className="overflow-hidden bg-white py-4 border-y border-neutral-100">
      <div className="flex animate-marquee whitespace-nowrap">
        {[...items, ...items].map((_, i) => (
          <span key={i} className="mx-8 inline-flex items-center gap-3 text-lg font-bold uppercase tracking-wider text-neutral-800">
            <Image src={SITE.deliveryIcon} alt="" width={32} height={32} className="h-8 w-8" />
            {SITE.name}
          </span>
        ))}
      </div>
    </div>
  );
}
