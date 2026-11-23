import { placeCard } from "@/lib/og/card";

/** The home page's share card. */
export async function GET() {
  return placeCard({ name: "বাংলাদেশের প্রতিটি জায়গার ইতিহাস, মানচিত্রে", line: "মানচিত্রে চাপুন, পড়ুন সেই জায়গার গল্প" });
}
