"use client";

import Image from "next/image";
import { useState } from "react";

interface ProductGalleryProps {
  name: string;
  images: string[];
}

export default function ProductGallery({ name, images }: ProductGalleryProps) {
  const photos = images.filter(Boolean);
  const [active, setActive] = useState(0);
  const main = photos[active] || photos[0] || "";

  if (!main) {
    return <div className="aspect-[4/3] bg-neutral-100" />;
  }

  return (
    <div>
      <div className="relative mb-4 aspect-[4/3] bg-neutral-100">
        <Image
          key={main}
          src={main}
          alt={name}
          fill
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 50vw"
          priority
        />
      </div>
      {photos.length > 1 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {photos.map((img, i) => (
            <button
              key={`${img}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              className={`relative aspect-square overflow-hidden bg-neutral-100 ring-2 ring-offset-1 transition ${
                i === active ? "ring-[#fc0527]" : "ring-transparent hover:ring-neutral-300"
              }`}
              aria-label={`View photo ${i + 1}`}
            >
              <Image src={img} alt="" fill className="object-cover" sizes="120px" />
            </button>
          ))}
        </div>
      )}
      {photos.length > 1 && (
        <p className="mt-2 text-xs text-neutral-500">
          {photos.length} photos — click a thumbnail to view
        </p>
      )}
    </div>
  );
}
