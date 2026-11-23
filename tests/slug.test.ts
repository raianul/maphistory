/** Place page addresses: readable, ASCII, stable, never clashing. */
import { describe, expect, it } from "vitest";
import { cityPart, freeSlug, isPlaceSlug, slugBase } from "../src/lib/slug";

describe("slugBase", () => {
  it("lowercase ASCII words from the English name", () => {
    expect(slugBase("Jatiyo Sangsad Bhaban")).toBe("jatiyo-sangsad-bhaban");
    expect(slugBase("  Baitul Mukarram  National Mosque ")).toBe("baitul-mukarram-national-mosque");
    expect(slugBase("Dhakeshwari National Temple")).toBe("dhakeshwari-national-temple");
  });
  it("drops accents, apostrophes and symbols; & becomes and", () => {
    expect(slugBase("Café Rèsumé")).toBe("cafe-resume");
    expect(slugBase("St. Mary's Cathedral")).toBe("st-marys-cathedral");
    expect(slugBase("Arts & Crafts")).toBe("arts-and-crafts");
  });
  it("keeps addresses short (8 words, 70 characters) and is empty for non-Latin names", () => {
    expect(slugBase("one two three four five six seven eight nine ten").split("-")).toHaveLength(8);
    expect(slugBase("a".repeat(100)).length).toBeLessThanOrEqual(70);
    expect(slugBase("জাতীয় সংসদ ভবন")).toBe("");
  });
});

describe("cityPart", () => {
  it("the city from an address, not the division or country", () => {
    expect(cityPart("Babu Bazar, Dhaka, Dhaka Division, Bangladesh")).toBe("dhaka");
    expect(cityPart("Patenga, Chattogram, Bangladesh")).toBe("chattogram");
    expect(cityPart(null)).toBe("");
  });
});

describe("freeSlug", () => {
  const takenBy = (used: string[]) => async (s: string) => used.includes(s);
  it("the plain name when free", async () => {
    expect(await freeSlug("Curzon Hall", "Dhaka", takenBy([]))).toBe("curzon-hall");
  });
  it("adds the city on a clash, then a number", async () => {
    expect(await freeSlug("Shaheed Minar", "Rajshahi, Bangladesh", takenBy(["shaheed-minar"]))).toBe("shaheed-minar-rajshahi");
    expect(await freeSlug("Shaheed Minar", "Rajshahi, Bangladesh", takenBy(["shaheed-minar", "shaheed-minar-rajshahi"]))).toBe("shaheed-minar-rajshahi-2");
  });
  it("never doubles the city, and falls back to 'place' without an English name", async () => {
    expect(await freeSlug("National Stadium Dhaka", "Dhaka", takenBy(["national-stadium-dhaka"]))).toBe("national-stadium-dhaka-2");
    expect(await freeSlug("", null, takenBy([]))).toBe("place");
  });
});

describe("isPlaceSlug", () => {
  it("accepts only well-formed addresses", () => {
    expect(isPlaceSlug("jatiyo-sangsad-bhaban")).toBe(true);
    for (const bad of ["Jatiyo", "a--b", "-a", "a-", "জাতীয়", "../etc", "a b", "x".repeat(81)]) expect(isPlaceSlug(bad)).toBe(false);
  });
});
