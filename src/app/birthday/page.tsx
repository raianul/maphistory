import type { Metadata } from "next";
import Link from "next/link";
import { BirthdayFinder } from "@/components/Birthday";

export const metadata: Metadata = {
  title: "আপনার জন্মদিনে বাংলাদেশে কী ঘটেছিল?",
  description: "শুধু দিন আর মাস দিন: দেখুন আপনার জন্মদিনে বাংলাদেশের ইতিহাসে কী ঘটেছিল, আর বন্ধুদের সঙ্গে শেয়ার করুন।",
  alternates: { canonical: "/birthday" },
  openGraph: { title: "আপনার জন্মদিনে বাংলাদেশে কী ঘটেছিল?", images: [{ url: "/og/birthday/12-16", width: 1200, height: 630 }] },
};

/** The birthday finder on its own page: what the launch posts link to. */
export default function BirthdayPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 md:py-16">
      <BirthdayFinder onDone={undefined} />
      <p className="mt-8 text-center">
        <Link href="/" className="font-semibold text-accent hover:underline">
          মানচিত্রে বাংলাদেশের ইতিহাস দেখুন →
        </Link>
      </p>
    </div>
  );
}
