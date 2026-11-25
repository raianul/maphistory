// Client-safe: what kind of place a story is, for the chips that filter the map's pins.

/**
 * The categories, in chip order. Each place has at most one. It is worked out from the story's
 * own words (its kind and era) unless an editor picked one in the admin.
 * Order matters for the guess: the first match wins (a জমিদার বাড়ি is often called a প্রাসাদ).
 */
export const CATEGORIES = [
  { id: "mosque", bn: "মসজিদ", en: "Mosques", match: /মসজিদ|ঈদগাহ|mosque|masjid/i },
  { id: "temple", bn: "মন্দির", en: "Temples", match: /মন্দির(?![\u0980-\u09FF])|দেউল|temple/i },
  { id: "church", bn: "গির্জা", en: "Churches", match: /গির্জা|চার্চ|church|cathedral/i },
  { id: "zamindar", bn: "জমিদার বাড়ি", en: "Zamindar houses", match: /জমিদার|রাজবাড়ি|রাজবাড়ী|zamindar|rajbari/i },
  { id: "fort", bn: "দুর্গ ও প্রাসাদ", en: "Forts & palaces", match: /দুর্গ(?![\u0980-\u09FF])|কেল্লা|প্রাসাদ|মঞ্জিল|মহল(?![\u0980-\u09FF])|\bfort\b|palace/i },
  { id: "liberation", bn: "মুক্তিযুদ্ধ", en: "1971", match: /মুক্তিযুদ্ধ|স্মৃতিসৌধ|শহীদ মিনার|বধ্যভূমি|liberation war|1971|১৯৭১/i },
  { id: "archaeology", bn: "প্রত্নস্থল", en: "Archaeological sites", match: /প্রত্ন|বিহার(?![\u0980-\u09FF])|স্তূপ|archaeolog|vihara|stupa/i },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

/** Stored in the admin's override when an editor says "no category" (the guess was wrong). */
export const NO_CATEGORY = "none";

export const isCategory = (v: unknown): v is CategoryId => CATEGORIES.some((c) => c.id === v);

export const categoryLabel = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!.bn;

/**
 * The guess from the story's own words: its kind ("মসজিদ", "দুর্গ"…), then its era (a 1971
 * memorial's era is the Liberation War). Never the name: "মসজিদ রোড" is a road.
 * Short words must end there: দুর্গ is not দুর্গাপুর, মহল is not মহল্লা.
 */
export function guessCategory(s: { kind_bn?: string | null; era?: string | null }): CategoryId | undefined {
  for (const text of [s.kind_bn, s.era]) {
    if (!text) continue;
    const hit = CATEGORIES.find((c) => c.match.test(text));
    if (hit) return hit.id;
  }
  return undefined;
}

/** A place's category: the editor's choice when there is one, otherwise the guess. */
export function categoryOf(override: string | null | undefined, guess: CategoryId | undefined): CategoryId | undefined {
  if (override === NO_CATEGORY) return undefined;
  return isCategory(override) ? override : guess;
}
