"use client";

import { useState } from "react";

interface AdminImageProps {
  src: string;
  alt?: string;
  className?: string;
  /** Tailwind classes for the outer relative box (must set size). */
  boxClassName: string;
}

/**
 * Plain img for admin — avoids Next.js /_next/image optimizer.
 * Broken WordPress URLs were returning 502 and could hang the admin UI.
 */
export default function AdminImage({
  src,
  alt = "",
  className = "h-full w-full object-cover",
  boxClassName,
}: AdminImageProps) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={`overflow-hidden bg-neutral-200 ${boxClassName}`}>
      {failed || !src ? (
        <div className="flex h-full w-full items-center justify-center text-[10px] font-medium uppercase tracking-wide text-neutral-500">
          No photo
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />
      )}
    </div>
  );
}
