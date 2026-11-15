import type { NextConfig } from "next";

// Fully static site: every place page is built ahead of time from
// content/ (see scripts/build-content.ts), so Cache Components is off.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
