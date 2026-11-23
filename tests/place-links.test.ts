import { describe, expect, it } from "vitest";
import { slugOf } from "../src/lib/analytics";
import { findPlacePage, placeNameKey, type PageCandidate } from "../src/lib/place-links";

const pages: PageCandidate[] = [
  { slug: "jatiyo-sangsad-bhaban", names: ["জাতীয় সংসদ ভবন", "Jatiyo Sangsad Bhaban"], lat: 23.7623, lng: 90.3785 },
  { slug: "curzon-hall", names: ["কার্জন হল", "Curzon Hall"], lat: 23.7266, lng: 90.4021 },
  { slug: "dhaka-university", names: ["ঢাকা বিশ্ববিদ্যালয়"], lat: 23.7339, lng: 90.3929 },
];

describe("links to place pages", () => {
  it("normalises names", () => {
    expect(placeNameKey("জাতীয় সংসদ ভবন, ঢাকা")).toBe("জাতীয় সংসদ ভবন");
    expect(placeNameKey("Curzon Hall (Dhaka)")).toBe("curzon hall");
  });
  it("links a step at the place by its name", () => {
    expect(findPlacePage(pages, { name: "জাতীয় সংসদ ভবন, শেরেবাংলা নগর", lat: 23.7625, lng: 90.3790 })).toBe("jatiyo-sangsad-bhaban");
    expect(findPlacePage(pages, { name: "Curzon Hall", lat: 23.7267, lng: 90.4020 })).toBe("curzon-hall");
    // A longer name that contains the page's name.
    expect(findPlacePage(pages, { name: "কার্জন হল প্রাঙ্গণ", lat: 23.7267, lng: 90.4020 })).toBe("curzon-hall");
  });
  it("never links by distance alone, or by name alone", () => {
    expect(findPlacePage(pages, { name: "শাহবাগ মোড়", lat: 23.7267, lng: 90.4020 })).toBeUndefined();
    expect(findPlacePage(pages, { name: "কার্জন হল", lat: 23.75, lng: 90.42 })).toBeUndefined(); // ~3 km away
    expect(findPlacePage(pages, { name: "ঢাকা", lat: 23.7339, lng: 90.3929 })).toBeUndefined(); // a bare city name
    expect(findPlacePage(pages, { name: "কার্জন হল", lat: null, lng: null })).toBeUndefined();
  });
  it("reads the slug from a page address", () => {
    expect(slugOf("https://ondor.example/place/lalbagh-fort?utm_source=fb")).toBe("lalbagh-fort");
    expect(slugOf("/place/curzon-hall")).toBe("curzon-hall");
    expect(slugOf("/?event=x")).toBeUndefined();
  });
});
