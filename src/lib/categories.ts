// Client-safe: what kind of place a story is, for the chips that filter the map's pins.

/**
 * The categories, in chip order. A place can be in several (সোহরাওয়ার্দী উদ্যান is a park and a
 * 1971 site). They are worked out from the story's own words (its kind and era) unless an editor
 * picked them in the admin.
 * Short Bangla words must end there: দুর্গ is not দুর্গাপুর, মহল is not মহল্লা, হল is not হলুদ.
 */
export const CATEGORIES = [
  { id: "mosque", bn: "মসজিদ", en: "Mosques", match: /মসজিদ|ঈদগাহ|mosque|masjid/i },
  { id: "temple", bn: "মন্দির", en: "Temples", match: /মন্দির(?![\u0980-\u09FF])|দেউল|temple/i },
  { id: "church", bn: "গির্জা", en: "Churches", match: /গির্জা|চার্চ|church|cathedral/i },
  { id: "shrine", bn: "মাজার ও সমাধি", en: "Shrines & tombs", match: /মাজার|দরগা|সমাধি|কবরস্থান|শাহী কবর|shrine|mausoleum|\btomb|dargah/i },
  { id: "zamindar", bn: "জমিদার বাড়ি", en: "Zamindar houses", match: /জমিদার|রাজবাড়ি|রাজবাড়ী|zamindar|rajbari/i },
  { id: "fort", bn: "দুর্গ ও প্রাসাদ", en: "Forts & palaces", match: /দুর্গ(?![\u0980-\u09FF])|কেল্লা|প্রাসাদ|মঞ্জিল|মহল(?![\u0980-\u09FF])|\bfort\b|palace/i },
  { id: "building", bn: "ঐতিহাসিক ভবন", en: "Landmark buildings", match: /ভবন|দালান|কাটরা|হল(?![\u0980-\u09FF])|building|\bhall\b/i },
  { id: "government", bn: "সরকারি ভবন", en: "Government buildings", match: /সরকারি|সংসদ|সচিবালয়|আদালত|হাইকোর্ট|মন্ত্রণালয়|বঙ্গভবন|গণভবন|parliament|secretariat|\bcourt\b|ministry|government/i },
  { id: "museum", bn: "জাদুঘর", en: "Museums", match: /জাদুঘর|যাদুঘর|সংগ্রহশালা|museum/i },
  { id: "education", bn: "স্কুল ও বিশ্ববিদ্যালয়", en: "Schools & universities", match: /বিদ্যাল|কলেজ|স্কুল|মাদ্রাসা|শিক্ষা প্রতিষ্ঠান|university|college|school|madrasa/i },
  { id: "park", bn: "পার্ক ও উদ্যান", en: "Parks & gardens", match: /উদ্যান|পার্ক(?![\u0980-\u09FF])|বাগান(?![\u0980-\u09FF])|ময়দান|\bpark\b|garden/i },
  { id: "stadium", bn: "স্টেডিয়াম", en: "Stadiums", match: /স্টেডিয়াম|ক্রীড়া|খেলার মাঠ|stadium|sports/i },
  { id: "liberation", bn: "মুক্তিযুদ্ধ", en: "1971", match: /মুক্তিযুদ্ধ|স্মৃতিসৌধ|শহীদ মিনার|বধ্যভূমি|liberation war|1971|১৯৭১/i },
  { id: "archaeology", bn: "প্রত্নস্থল", en: "Archaeological sites", match: /প্রত্ন|বিহার(?![\u0980-\u09FF])|স্তূপ|archaeolog|vihara|stupa/i },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

/** Stored in the admin's override when an editor says "no category" (the guess was wrong). */
export const NO_CATEGORY = "none";

export const isCategory = (v: unknown): v is CategoryId => CATEGORIES.some((c) => c.id === v);

export const categoryLabel = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!.bn;

/** Several categories as one line, e.g. "পার্ক ও উদ্যান, মুক্তিযুদ্ধ" (null when none). */
export const categoryLabels = (ids: readonly CategoryId[]) => (ids.length ? ids.map(categoryLabel).join(", ") : null);

// য় and ড় can be typed as one letter or two: compare both sides in the same (NFC) form.
const MATCHERS = CATEGORIES.map((c) => ({ id: c.id as CategoryId, re: new RegExp(c.match.source.normalize("NFC"), c.match.flags) }));

/**
 * The guess from the story's own words: every category its kind ("মসজিদ", "উদ্যান"…) or era (a
 * 1971 memorial's era is the Liberation War) names, in chip order. Never the name: "মসজিদ রোড"
 * is a road. Some kinds win over another (see below).
 */
export function guessCategories(s: { kind_bn?: string | null; era?: string | null }): CategoryId[] {
  const text = [s.kind_bn, s.era].filter(Boolean).join(" · ").normalize("NFC");
  if (!text) return [];
  const hits = MATCHERS.filter((m) => m.re.test(text)).map((m) => m.id);
  // A জমিদার বাড়ি is not also a palace, a সরকারি ভবন is not also a landmark building, a stadium not a park.
  const over: [CategoryId, CategoryId][] = [["zamindar", "fort"], ["government", "building"], ["stadium", "park"]];
  return hits.filter((c) => !over.some(([wins, loses]) => c === loses && hits.includes(wins)));
}

/**
 * The editor's choice as stored in stories.category: null = the guess, "none" = no category,
 * else ids joined by commas ("park,liberation"; an older single id is the same thing).
 */
export function parseCategories(stored: string | null | undefined): CategoryId[] | undefined {
  if (stored == null || stored === "") return undefined;
  if (stored === NO_CATEGORY) return [];
  const ids = stored.split(",").map((x) => x.trim()).filter(isCategory);
  return ids.length ? CATEGORIES.map((c) => c.id).filter((id) => ids.includes(id)) : undefined;
}

/** How the editor's choice is stored (see parseCategories). */
export const storeCategories = (ids: readonly CategoryId[]) => (ids.length ? CATEGORIES.map((c) => c.id).filter((id) => ids.includes(id)).join(",") : NO_CATEGORY);

/** A place's categories: the editor's choice when there is one, otherwise the guess. */
export function categoriesOf(stored: string | null | undefined, guess: CategoryId[]): CategoryId[] {
  return parseCategories(stored) ?? guess;
}
