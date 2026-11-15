/** Video links and durations: which links are accepted, and what is shown. */
import { describe, expect, it } from "vitest";
import { formatDuration, parseDuration, parseVideoUrl, PROVIDERS } from "../src/lib/video";

describe("parseVideoUrl", () => {
  const id = "jNQXAC9IVRw";
  it.each([
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s&list=PL123`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `https://www.youtube.com/live/${id}`,
    `  https://www.youtube.com/watch?v=${id}  `,
  ])("accepts %s", (link) => {
    expect(parseVideoUrl(link)).toEqual({ provider: "youtube", providerVideoId: id, url: `https://www.youtube.com/watch?v=${id}` });
  });

  it.each([
    "not a url",
    "https://vimeo.com/123456",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/channel/UC123",
    "https://evil.example/watch?v=jNQXAC9IVRw",
    "javascript:alert(1)",
  ])("rejects %s", (link) => {
    expect(parseVideoUrl(link)).toBeUndefined();
  });

  it("embeds in privacy-enhanced mode, and only plays after the viewer's click", () => {
    const url = PROVIDERS.youtube.embedUrl(id);
    expect(url.startsWith("https://www.youtube-nocookie.com/embed/")).toBe(true);
    expect(PROVIDERS.youtube.thumbnailUrl(id)).toBe(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
  });
});

describe("durations", () => {
  it("formats in Bangla", () => {
    expect(formatDuration(754)).toBe("১২:৩৪");
    expect(formatDuration(65)).toBe("১:০৫");
    expect(formatDuration(3725)).toBe("১:০২:০৫");
    expect(formatDuration(undefined)).toBeUndefined();
    expect(formatDuration(0)).toBeUndefined();
  });

  it("reads what an editor types, in Latin or Bangla digits", () => {
    expect(parseDuration("12:34")).toBe(754);
    expect(parseDuration("১২:৩৪")).toBe(754);
    expect(parseDuration("1:02:05")).toBe(3725);
    expect(parseDuration("12:75")).toBeUndefined();
    expect(parseDuration("abc")).toBeUndefined();
    expect(parseDuration("0:00")).toBeUndefined();
  });
});
