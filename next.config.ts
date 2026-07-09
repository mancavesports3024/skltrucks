import type { NextConfig } from "next";
import { buildWordPressRedirects } from "./src/lib/seo/redirects";

const nextConfig: NextConfig = {
  async redirects() {
    return buildWordPressRedirects();
  },
  images: {
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
    ],
  },
};

export default nextConfig;
