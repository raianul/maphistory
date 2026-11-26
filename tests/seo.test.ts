import { describe, expect, it } from "vitest";
import { clip, firstSentence, isoDuration, jsonLdText, placeJsonLd, seoTitle, type PlaceSeo } from "../src/lib/seo";

const base: PlaceSeo = {
  slug: "jatiyo-sangsad-bhaban",
  name: "জাতীয় সংসদ ভবন",
  alternateNames: ["Jatiya Sangsad Bhaban"],
  hook: "সংসদ ভবন · ১৯৫৯ (পরিকল্পনা) / ১৯৮২ (উদ্বোধন)",
  description: "বাংলাদেশের আইনসভার ভবন।",
  lat: 23.7626,
  lng: 90.3786,
  city: "Dhaka",
  building: true,
  indexable: true,
};

describe("seo", () => {
  it("clips at a word and marks the cut", () => {
    expect(clip("এক দুই তিন চার পাঁচ", 100)).toBe("এক দুই তিন চার পাঁচ");
    const c = clip("এক দুই তিন চার পাঁচ ছয় সাত", 14);
    expect(c.length).toBeLessThanOrEqual(14);
    expect(c.endsWith("…")).toBe(true);
    expect(c).not.toMatch(/\s…$/);
  });

  it("builds '<name> — <hook> | Place & Past' near 60 characters", () => {
    expect(seoTitle({ ...base, hook: "সংসদ ভবন · ১৯৮২" })).toBe("জাতীয় সংসদ ভবন — সংসদ ভবন · ১৯৮২ | Place & Past");
    // Too long: whole parts are dropped, never cut.
    expect(seoTitle({ ...base, hook: "স্থাপত্য ও সরকারি ভবন · ১৯৫৯ (পরিকল্পনা) / ১৯৮২ (উদ্বোধন) আরও অনেক কথা" })).toBe("জাতীয় সংসদ ভবন — স্থাপত্য ও সরকারি ভবন | Place & Past");
    expect(seoTitle({ ...base, hook: undefined })).toBe("জাতীয় সংসদ ভবন | Place & Past");
  });

  it("takes the summary's first sentence as the one-line hook", () => {
    const summary = "বুড়িগঙ্গার তীরে অবস্থিত আহসান মঞ্জিল ঢাকার নবাবদের বাসভবন ছিল। এটি ইন্দো-সারাসেনিক স্থাপত্যের নিদর্শন। আরও কথা।";
    expect(firstSentence(summary)).toBe("বুড়িগঙ্গার তীরে অবস্থিত আহসান মঞ্জিল ঢাকার নবাবদের বাসভবন ছিল।");
    // Too short to stand alone, or no sentence end within the limit: clipped at a word instead.
    expect(firstSentence("ছোট। তারপর অনেক লম্বা একটি বাক্য যা চলতেই থাকে")).toBe("ছোট। তারপর অনেক লম্বা একটি বাক্য যা চলতেই থাকে");
    const long = "এক ".repeat(80).trim() + "।";
    expect(firstSentence(long).endsWith("…")).toBe(true);
    expect(firstSentence(long).length).toBeLessThanOrEqual(155);
  });

  it("writes ISO 8601 durations", () => {
    expect(isoDuration(208)).toBe("PT3M28S");
    expect(isoDuration(3600)).toBe("PT1H");
    expect(isoDuration(45)).toBe("PT45S");
  });

  it("describes the place and its video", () => {
    const [place, video] = placeJsonLd(
      { ...base, video: { id: "v", provider: "youtube", providerVideoId: "JZNtFCW5RFE", url: "", title: "সংসদ ভবন", language: "bn", durationSeconds: 208, publishedAt: "2026-11-23T10:22:23-08:00" } },
      { url: "https://i.ytimg.com/vi/JZNtFCW5RFE/maxresdefault.jpg" },
    ) as Record<string, unknown>[];
    expect(place["@type"]).toEqual(["TouristAttraction", "LandmarksOrHistoricalBuildings"]);
    expect(place.geo).toEqual({ "@type": "GeoCoordinates", latitude: 23.7626, longitude: 90.3786 });
    expect(video).toMatchObject({ "@type": "VideoObject", duration: "PT3M28S", embedUrl: "https://www.youtube.com/embed/JZNtFCW5RFE", uploadDate: "2026-11-23T10:22:23-08:00" });
    expect(placeJsonLd(base, { url: "x" })).toHaveLength(1);
  });

  it("can't close its script tag", () => {
    expect(jsonLdText({ a: "</script><script>alert(1)</script>" })).not.toContain("<");
  });
});
