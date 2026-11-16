import type { Metadata } from "next";
import { EventDemo } from "./EventDemo";

// DEMO: a sample "On this day" event on the map. Not linked from the site, not indexed.
export const metadata: Metadata = { title: "ডেমো: ঘটনা মানচিত্রে", robots: { index: false, follow: false } };

export default function EventDemoPage() {
  return <EventDemo />;
}
