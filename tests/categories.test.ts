import { describe, expect, it } from "vitest";
import { categoryOf, guessCategory, isCategory, NO_CATEGORY } from "../src/lib/categories";
import { smallPicture } from "../src/lib/db";

describe("place categories", () => {
  it("guesses from the story's kind", () => {
    expect(guessCategory({ kind_bn: "মসজিদ" })).toBe("mosque");
    expect(guessCategory({ kind_bn: "হিন্দু মন্দির" })).toBe("temple");
    expect(guessCategory({ kind_bn: "দুর্গ" })).toBe("fort");
    expect(guessCategory({ kind_bn: "প্রাসাদ" })).toBe("fort");
    expect(guessCategory({ kind_bn: "জমিদার বাড়ির প্রাসাদ" })).toBe("zamindar");
    expect(guessCategory({ kind_bn: "বৌদ্ধ বিহার" })).toBe("archaeology");
    expect(guessCategory({ kind_bn: "প্রত্নস্থল" })).toBe("archaeology");
    expect(guessCategory({ kind_bn: "গির্জা" })).toBe("church");
  });

  it("falls back to the era, never the name", () => {
    expect(guessCategory({ kind_bn: "স্মারক", era: "মুক্তিযুদ্ধ (১৯৭১)" })).toBe("liberation");
    expect(guessCategory({ kind_bn: "সড়ক" })).toBeUndefined();
    expect(guessCategory({})).toBeUndefined();
  });

  it("doesn't match words that only start the same", () => {
    expect(guessCategory({ kind_bn: "মহল্লা" })).toBeUndefined();
    expect(guessCategory({ kind_bn: "দুর্গাপূজার মণ্ডপ" })).toBeUndefined();
    expect(guessCategory({ kind_bn: "বিহারী ক্যাম্প" })).toBeUndefined();
  });

  it("the editor's choice wins, and 'none' clears the guess", () => {
    expect(categoryOf("temple", "mosque")).toBe("temple");
    expect(categoryOf(NO_CATEGORY, "mosque")).toBeUndefined();
    expect(categoryOf(null, "mosque")).toBe("mosque");
    expect(categoryOf("nonsense", "fort")).toBe("fort");
    expect(isCategory("mosque")).toBe(true);
    expect(isCategory("none")).toBe(false);
  });
});

describe("hover preview pictures", () => {
  it("asks Commons for a 500 px thumbnail", () => {
    expect(smallPicture("https://upload.wikimedia.org/wikipedia/commons/a/aa/Curzon_hall_front.jpg?utm_source=x")).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Curzon_hall_front.jpg/500px-Curzon_hall_front.jpg",
    );
    expect(smallPicture("https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ea/DJI_0760.jpg/1280px-DJI_0760.jpg?utm_source=x")).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/DJI_0760.jpg/500px-DJI_0760.jpg",
    );
    expect(smallPicture("https://i.ytimg.com/vi/abc/hqdefault.jpg")).toBe("https://i.ytimg.com/vi/abc/mqdefault.jpg");
    expect(smallPicture(null)).toBeUndefined();
  });
});
