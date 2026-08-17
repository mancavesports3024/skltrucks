import type { NextConfig } from "next";
import { buildWordPressRedirects } from "./src/lib/seo/redirects";

const nextConfig: NextConfig = {
  async redirects() {
    return buildWordPressRedirects();
  },
  images: {
    // Vercel Image Optimization is returning 402 Payment Required on this
    // project, which breaks every next/image. Serve originals instead.
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
