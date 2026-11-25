import { describe, expect, it } from "vitest";
import { categoriesOf, guessCategories, isCategory, NO_CATEGORY, parseCategories, storeCategories } from "../src/lib/categories";
import { smallPicture } from "../src/lib/db";

describe("place categories", () => {
  const g = (kind_bn?: string, era?: string) => guessCategories({ kind_bn, era });

  it("guesses from the story's kind", () => {
    expect(g("মসজিদ")).toEqual(["mosque"]);
    expect(g("হিন্দু মন্দির")).toEqual(["temple"]);
    expect(g("দুর্গ")).toEqual(["fort"]);
    expect(g("প্রাসাদ")).toEqual(["fort"]);
    expect(g("বৌদ্ধ বিহার")).toEqual(["archaeology"]);
    expect(g("প্রত্নস্থল")).toEqual(["archaeology"]);
    expect(g("গির্জা")).toEqual(["church"]);
  });

  it("knows the new kinds: buildings, parks, schools, museums, shrines", () => {
    expect(g("সংসদ ভবন")).toEqual(["government"]);
    expect(g("স্থাপত্য ও সরকারি ভবন")).toEqual(["government"]);
    expect(g("সচিবালয়")).toEqual(["government"]);
    expect(g("হাইকোর্ট ভবন")).toEqual(["government"]);
    expect(g("স্টেডিয়াম")).toEqual(["stadium"]);
    expect(g("হাসপাতাল")).toEqual(["hospital"]);
    expect(g("মেডিকেল কলেজ ও হাসপাতাল")).toEqual(["hospital", "education"]);
    expect(g("ক্রীড়া কমপ্লেক্স")).toEqual(["stadium"]);
    expect(g("খেলার মাঠ")).toEqual(["stadium"]);
    expect(g("ঐতিহাসিক হল")).toEqual(["building"]);
    expect(g("উদ্যান")).toEqual(["park"]);
    expect(g("পার্ক")).toEqual(["park"]);
    expect(g("বাগান")).toEqual(["park"]);
    expect(g("বিশ্ববিদ্যালয়")).toEqual(["education"]);
    expect(g("উচ্চ বিদ্যালয়")).toEqual(["education"]);
    expect(g("কলেজ")).toEqual(["education"]);
    expect(g("জাদুঘর")).toEqual(["museum"]);
    expect(g("মাজার")).toEqual(["shrine"]);
    expect(g("সমাধিসৌধ")).toEqual(["shrine"]);
  });

  it("gives every category the kind and era name", () => {
    expect(g("উদ্যান", "মুক্তিযুদ্ধ (১৯৭১)")).toEqual(["park", "liberation"]);
    expect(g("বিশ্ববিদ্যালয়ের ভবন")).toEqual(["building", "education"]);
    expect(g("স্মারক", "মুক্তিযুদ্ধ (১৯৭১)")).toEqual(["liberation"]);
  });

  it("a zamindar's palace is a zamindar house, not a palace too", () => {
    expect(g("জমিদার বাড়ির প্রাসাদ")).toEqual(["zamindar"]);
  });

  it("matches whole words and ignores how য় / ড় were typed", () => {
    expect(g("সড়ক")).toEqual([]);
    expect(g()).toEqual([]);
    expect(g("মহল্লা")).toEqual([]);
    expect(g("দুর্গাপূজার মণ্ডপ")).toEqual([]);
    expect(g("বিহারী ক্যাম্প")).toEqual([]);
    expect(g("হলুদ খেত")).toEqual([]);
    expect(g("বাগানবাড়ি")).toEqual([]);
    expect(g("ময়দান".normalize("NFD"))).toEqual(["park"]);
    expect(g("ময়দান".normalize("NFC"))).toEqual(["park"]);
  });

  it("the editor's choice wins over the guess", () => {
    expect(categoriesOf("temple", ["mosque"])).toEqual(["temple"]);
    expect(categoriesOf("liberation,park", ["park"])).toEqual(["park", "liberation"]);
    expect(categoriesOf(NO_CATEGORY, ["mosque"])).toEqual([]);
    expect(categoriesOf(null, ["mosque"])).toEqual(["mosque"]);
    expect(categoriesOf("nonsense", ["fort"])).toEqual(["fort"]);
    expect(parseCategories("park,nonsense")).toEqual(["park"]);
    expect(storeCategories(["liberation", "park"])).toBe("park,liberation");
    expect(storeCategories([])).toBe(NO_CATEGORY);
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
