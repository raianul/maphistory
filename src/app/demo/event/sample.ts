/**
 * DEMO ONLY: hand-written events, to see how "On this day" events could look on the map.
 * Not from the database or the AI. Coordinates come from Photon (OpenStreetMap search), not
 * guesses. Times are approximate, as the sources give them; the slider runs on these times.
 * Sources are listed with each event.
 */

export type Evidence = "documented" | "scholarly" | "disputed";

export type Phase = { id: string; label_bn: string; color: string };

export type Place = {
  name_bn: string;
  lat: number;
  lng: number;
  /** The exact spot isn't known (only the area): drawn as a soft circle, not a pin. */
  approx?: boolean;
};

export type Step = {
  /** Minutes from the event's day 0, 00:00 local time, for the time slider. Approximate. */
  at: number;
  /** As shown: approximate, the way sources put it. */
  when_bn: string;
  phase: string;
  title_bn: string;
  body_bn: string;
  /** A movement (line from → to) or something at one place. */
  from?: Place;
  to: Place;
  evidence: Evidence;
};

export type DemoEvent = {
  id: string;
  date_bn: string;
  title_bn: string;
  summary_bn: string;
  phases: Phase[];
  /** Slider range, in minutes from day 0. */
  start: number;
  end: number;
  /**
   * "clock": one night (রাত ১১:৩০). "days": several days (৩০ মে · ভোর ৪টা). Clock times are shown
   * only for day 0 (`days_bn[0]`); later days show just their label, without a made-up time.
   */
  scale: "clock" | "days";
  /** Day 0's date, for "days" (e.g. ["৩০ মে", "৩১ মে", ...]). */
  days_bn?: string[];
  /** Slider tick marks, minutes from day 0. */
  ticks: number[];
  /** A short note under the summary (what is uncertain or disputed). */
  note_bn?: string;
  steps: Step[];
  sources: { title: string; url: string }[];
};

const SEARCHLIGHT_PHASES: Phase[] = [
  { id: "move", label_bn: "সেনা অভিযান শুরু", color: "#6b5b95" },
  { id: "attack", label_bn: "হামলা", color: "#b8324b" },
  { id: "arrest", label_bn: "গ্রেপ্তার", color: "#2e7d6b" },
];

const P = {
  cantonment: { name_bn: "ঢাকা সেনানিবাস", lat: 23.796, lng: 90.3937 },
  rajarbagh: { name_bn: "রাজারবাগ পুলিশ লাইন্স", lat: 23.7404, lng: 90.4172 },
  pilkhana: { name_bn: "পিলখানা (ইপিআর সদর দপ্তর)", lat: 23.7315, lng: 90.3761 },
  university: { name_bn: "ঢাকা বিশ্ববিদ্যালয় (জগন্নাথ হল)", lat: 23.7294, lng: 90.3947 },
  road32: { name_bn: "ধানমন্ডি ৩২ নম্বর", lat: 23.7517, lng: 90.3765 },
};

export const SEARCHLIGHT: DemoEvent = {
  id: "searchlight",
  date_bn: "২৫–২৬ মার্চ ১৯৭১",
  title_bn: "অপারেশন সার্চলাইট",
  summary_bn:
    "২৫ মার্চ রাতে পাকিস্তান সেনাবাহিনী ঢাকায় সামরিক অভিযান শুরু করে। পুলিশ, ইপিআর ও বিশ্ববিদ্যালয়ে হামলা চালানো হয় এবং শেখ মুজিবুর রহমানকে গ্রেপ্তার করা হয়।",
  phases: SEARCHLIGHT_PHASES,
  // Slider range: 25 March 22:00 → 26 March 02:00.
  start: 22 * 60,
  end: 26 * 60,
  scale: "clock",
  ticks: [22, 23, 24, 25, 26].map((h) => h * 60),
  steps: [
    {
      at: 23 * 60 + 30,
      when_bn: "রাত সাড়ে ১১টা নাগাদ",
      phase: "move",
      title_bn: "সেনাবাহিনী রাজারবাগের দিকে",
      body_bn: "ঢাকা সেনানিবাস থেকে সেনা দল শহরের দিকে রওনা দেয়।",
      from: P.cantonment,
      to: P.rajarbagh,
      evidence: "documented",
    },
    {
      at: 23 * 60 + 30,
      when_bn: "রাত সাড়ে ১১টা নাগাদ",
      phase: "move",
      title_bn: "সেনাবাহিনী পিলখানার দিকে",
      body_bn: "আরেকটি দল ইপিআর সদর দপ্তর পিলখানার দিকে যায়।",
      from: P.cantonment,
      to: P.pilkhana,
      evidence: "documented",
    },
    {
      at: 23 * 60 + 30,
      when_bn: "রাত সাড়ে ১১টা নাগাদ",
      phase: "move",
      title_bn: "সেনাবাহিনী বিশ্ববিদ্যালয়ের দিকে",
      body_bn: "সেনা দল ঢাকা বিশ্ববিদ্যালয় এলাকার দিকে যায়।",
      from: P.cantonment,
      to: P.university,
      evidence: "documented",
    },
    {
      at: 24 * 60,
      when_bn: "মধ্যরাতের দিকে",
      phase: "attack",
      title_bn: "রাজারবাগ পুলিশ লাইন্সে হামলা",
      body_bn: "বাঙালি পুলিশ সদস্যরা প্রতিরোধ গড়ে তোলেন; ভারী অস্ত্র দিয়ে হামলা চালানো হয়।",
      to: P.rajarbagh,
      evidence: "documented",
    },
    {
      at: 24 * 60,
      when_bn: "মধ্যরাতের দিকে",
      phase: "attack",
      title_bn: "পিলখানায় হামলা",
      body_bn: "ইপিআর সদর দপ্তরে বাঙালি সদস্যদের ওপর হামলা চালানো হয়।",
      to: P.pilkhana,
      evidence: "documented",
    },
    {
      at: 24 * 60 + 15,
      when_bn: "মধ্যরাতের পর",
      phase: "attack",
      title_bn: "ঢাকা বিশ্ববিদ্যালয়ে হামলা",
      body_bn: "জগন্নাথ হলসহ বিভিন্ন হলে ছাত্র ও শিক্ষকদের হত্যা করা হয়। নিহতের সংখ্যা নিয়ে বিভিন্ন হিসাব রয়েছে।",
      to: P.university,
      evidence: "documented",
    },
    {
      at: 25 * 60 + 30,
      when_bn: "রাত দেড়টা নাগাদ",
      phase: "arrest",
      title_bn: "শেখ মুজিবুর রহমান গ্রেপ্তার",
      body_bn: "ধানমন্ডি ৩২ নম্বরের বাসভবন থেকে তাঁকে গ্রেপ্তার করে সেনানিবাসে নেওয়া হয়। সঠিক সময় নিয়ে সূত্রভেদে পার্থক্য আছে।",
      from: P.road32,
      to: P.cantonment,
      evidence: "scholarly",
    },
  ],
  sources: [
    { title: "Operation Searchlight — Wikipedia", url: "https://en.wikipedia.org/wiki/Operation_Searchlight" },
    { title: "1971 Dhaka University massacre — Wikipedia", url: "https://en.wikipedia.org/wiki/1971_Dhaka_University_massacre" },
  ],
};

// ── 30 May – June 1981: the assassination of President Ziaur Rahman ─────────────────────────
// Only what the cited sources say. Who planned it, and how Maj. Gen. Abul Manzur died, are
// disputed: marked as such, no side taken. Times other than the attack's are approximate.

const D = 24 * 60; // one day in minutes
const ZP = {
  circuit: { name_bn: "চট্টগ্রাম সার্কিট হাউস", lat: 22.3486, lng: 91.8246 },
  ctgCantonment: { name_bn: "চট্টগ্রাম সেনানিবাস", lat: 22.4089, lng: 91.8149 },
  fatikchhari: { name_bn: "ফটিকছড়ি", lat: 22.6839, lng: 91.7891 },
  hathazari: { name_bn: "হাটহাজারী থানা", lat: 22.5017, lng: 91.807 },
  sangsad: { name_bn: "জাতীয় সংসদ ভবন", lat: 23.7625, lng: 90.3786 },
  shereBangla: { name_bn: "শেরেবাংলা নগর (চন্দ্রিমা উদ্যান)", lat: 23.766, lng: 90.3789 },
};

export const ZIA_1981: DemoEvent = {
  id: "zia-1981",
  date_bn: "৩০ মে ১৯৮১",
  title_bn: "চট্টগ্রামে রাষ্ট্রপতি জিয়াউর রহমান হত্যাকাণ্ড",
  summary_bn:
    "চট্টগ্রাম সফরে থাকা রাষ্ট্রপতি জিয়াউর রহমান ৩০ মে ভোরে সার্কিট হাউসে একদল সেনা কর্মকর্তার হামলায় নিহত হন। এরপর চট্টগ্রামের সেনা অভ্যুত্থানের চেষ্টা ব্যর্থ হয় এবং তাঁকে ঢাকায় সমাহিত করা হয়।",
  note_bn: "হত্যার পরিকল্পনায় কারা ছিলেন এবং মেজর জেনারেল আবুল মঞ্জুরের মৃত্যু কীভাবে হয়েছিল, তা নিয়ে ভিন্নমত আছে।",
  phases: [
    { id: "attack", label_bn: "হামলা", color: "#b8324b" },
    { id: "revolt", label_bn: "অভ্যুত্থানের চেষ্টা ও ব্যর্থতা", color: "#a8741a" },
    { id: "funeral", label_bn: "জানাজা ও দাফন", color: "#3f6f8a" },
  ],
  // 30 May 00:00 = 0. The days after the attack are shown by order, not exact dates.
  start: 3 * 60,
  end: 3 * D,
  scale: "days",
  days_bn: ["৩০ মে", "পরের দিনগুলো", "পরের দিনগুলো", "পরে"],
  ticks: [3 * 60, D, 2 * D, 3 * D],
  steps: [
    {
      at: 3 * 60 + 40,
      when_bn: "৩০ মে · ভোর ৪টার আগে",
      phase: "attack",
      title_bn: "সেনানিবাস থেকে সার্কিট হাউসের দিকে",
      body_bn: "একদল সেনা কর্মকর্তা চট্টগ্রাম সেনানিবাস থেকে সার্কিট হাউসের দিকে যান, যেখানে রাষ্ট্রপতি অবস্থান করছিলেন।",
      from: ZP.ctgCantonment,
      to: ZP.circuit,
      evidence: "documented",
    },
    {
      at: 4 * 60,
      when_bn: "৩০ মে · ভোর ৪টা",
      phase: "attack",
      title_bn: "সার্কিট হাউসে হামলা, রাষ্ট্রপতি নিহত",
      body_bn: "রকেট ছুড়ে হামলা শুরু হয়; কয়েকজন দেহরক্ষী নিহত হন। কক্ষে কক্ষে খোঁজার পর রাষ্ট্রপতি জিয়াউর রহমানকে গুলি করে হত্যা করা হয়। হামলা ২০ মিনিটের কম স্থায়ী ছিল।",
      to: ZP.circuit,
      evidence: "documented",
    },
    {
      at: 4 * 60 + 25,
      when_bn: "৩০ মে · হামলার পর",
      phase: "attack",
      title_bn: "হামলাকারীরা সেনানিবাসে ফেরে",
      body_bn: "হামলাকারীরা চট্টগ্রাম সেনানিবাসে ফিরে যায়। রাষ্ট্রপতি ও দুজন দেহরক্ষীর মরদেহ একটি সামরিক গাড়িতে করে অন্যত্র সরিয়ে নেওয়া হয়।",
      from: ZP.circuit,
      to: ZP.ctgCantonment,
      evidence: "documented",
    },
    {
      at: 10 * 60,
      when_bn: "৩০ মে",
      phase: "revolt",
      title_bn: "চট্টগ্রাম থেকে বেতার ঘোষণা",
      body_bn: "চট্টগ্রামের জিওসি মেজর জেনারেল আবুল মঞ্জুর চট্টগ্রাম থেকে বেতারে একাধিক ভাষণ দেন এবং একটি বিপ্লবী পরিষদ গঠনের ঘোষণা দেন।",
      to: ZP.ctgCantonment,
      evidence: "documented",
    },
    {
      at: D + 6 * 60,
      when_bn: "পরের দিনগুলোতে",
      phase: "revolt",
      title_bn: "অভ্যুত্থান ব্যর্থ, পার্বত্য চট্টগ্রামের দিকে পালানোর চেষ্টা",
      body_bn: "সেনাপ্রধান সরকারের প্রতি অনুগত থাকেন এবং অভ্যুত্থান দমনের নির্দেশ দেন। বেশিরভাগ সৈন্য আত্মসমর্পণ করে; মঞ্জুরসহ নেতৃস্থানীয় কর্মকর্তারা পার্বত্য চট্টগ্রামের দিকে পালানোর চেষ্টা করেন।",
      from: ZP.ctgCantonment,
      to: ZP.fatikchhari,
      evidence: "documented",
    },
    {
      at: 2 * D,
      when_bn: "পরের দিনগুলোতে",
      phase: "revolt",
      title_bn: "ফটিকছড়িতে মঞ্জুর আটক",
      body_bn: "ফটিকছড়ির একটি চা বাগানে পুলিশ ও সেনাবাহিনী মঞ্জুরকে আটক করে; তিনি পুলিশের কাছে আত্মসমর্পণ করেন এবং তাঁকে হাটহাজারী থানায় নেওয়া হয়।",
      from: ZP.fatikchhari,
      to: ZP.hathazari,
      evidence: "documented",
    },
    {
      at: 2 * D + 6 * 60,
      when_bn: "পরের দিনগুলোতে",
      phase: "revolt",
      title_bn: "মঞ্জুরের মৃত্যু",
      body_bn: "থানা থেকে সেনাদল তাঁকে নিয়ে যায়; এরপর কী ঘটেছিল, সরকার তা প্রকাশ করেনি। সরকার জানায় উত্তেজিত সৈন্যরা তাঁকে হত্যা করেছে; ময়নাতদন্তে মাথার পেছনে গুলির চিহ্ন পাওয়া যায়।",
      to: ZP.hathazari,
      evidence: "disputed",
    },
    {
      at: 3 * D - 3 * 60,
      when_bn: "পরে",
      phase: "funeral",
      title_bn: "সংসদ ভবনে জানাজা",
      body_bn: "জাতীয় সংসদ ভবনে তাঁর জানাজায় আনুমানিক বিশ লাখ মানুষ অংশ নেন।",
      to: ZP.sangsad,
      evidence: "documented",
    },
    {
      at: 3 * D - 60,
      when_bn: "পরে",
      phase: "funeral",
      title_bn: "শেরেবাংলা নগরে দাফন",
      body_bn: "তাঁকে শেরেবাংলা নগরে সমাহিত করা হয়; জায়গাটি এখন চন্দ্রিমা উদ্যান (জিয়া উদ্যান) নামে পরিচিত।",
      to: ZP.shereBangla,
      evidence: "documented",
    },
  ],
  sources: [
    { title: "Assassination of Ziaur Rahman — Wikipedia", url: "https://en.wikipedia.org/wiki/Assassination_of_Ziaur_Rahman" },
    { title: "Ziaur Rahman — Wikipedia", url: "https://en.wikipedia.org/wiki/Ziaur_Rahman" },
    { title: "Rahman, Shahid Ziaur — Banglapedia", url: "https://en.banglapedia.org/index.php/Rahman,_Shahid_Ziaur" },
  ],
};

export const EVENTS: DemoEvent[] = [SEARCHLIGHT, ZIA_1981];
