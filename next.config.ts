import type { NextConfig } from "next";
import { buildWordPressRedirects } from "./src/lib/seo/redirects";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  async redirects() {
    return buildWordPressRedirects();
  },
  images: {
    // Keep unoptimized: Vercel /_next/image previously returned 402 Payment
    // Required on this project. Homepage hero delivery uses /api/site-image
    // (sharp) instead of re-enabling the Vercel optimizer.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "skltrucks.com",
        pathname: "/wp-content/uploads/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "kgnhisdckorctefbggwo.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
