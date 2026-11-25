import { placeCard } from "@/lib/og/card";

/** The home page's share card. */
export async function GET() {
  return placeCard({ name: "বাংলাদেশের প্রতিটি জায়গার ইতিহাস, মানচিত্রে", line: "ক্লিক করুন, জানুন ইতিহাস" });
}
