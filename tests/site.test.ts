import { afterEach, describe, expect, it, vi } from "vitest";

const load = async () => {
  vi.resetModules();
  return import("../src/lib/site");
};

describe("the site's address", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("comes from NEXT_PUBLIC_SITE_URL, without a trailing slash", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ondor.site/");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "ondor-one.vercel.app");
    const { SITE_URL, siteUrl } = await load();
    expect(SITE_URL).toBe("https://ondor.site");
    expect(siteUrl("/place/lalbagh-fort?utm_source=fb")).toBe("https://ondor.site/place/lalbagh-fort?utm_source=fb");
  });
  it("falls back to Vercel's production address, then localhost", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "ondor-one.vercel.app");
    expect((await load()).SITE_URL).toBe("https://ondor-one.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect((await load()).SITE_URL).toBe("http://localhost:3000");
  });
});
