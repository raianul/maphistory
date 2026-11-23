import type { NextConfig } from "next";

// Fully static site: every place page is built ahead of time from
// content/ (see scripts/build-content.ts), so Cache Components is off.
const nextConfig: NextConfig = {
  // HarfBuzz (Bangla text in share cards) loads its .wasm from its own folder: keep it unbundled.
  serverExternalPackages: ["harfbuzzjs"],
  // The share-card routes read fonts and photos from public/ at run time; ship them with those
  // server functions.
  outputFileTracingIncludes: {
    "/og/**": ["./public/fonts/HindSiliguri-*.ttf", "./public/media/**/*"],
  },
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
