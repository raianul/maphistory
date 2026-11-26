import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BirthdayFinder } from "@/components/Birthday";
import { dayLabel } from "@/lib/og/birthday-card";
import { birthdayDay, parseMonthDay } from "@/lib/birthday";

/*
 * A shared birthday: /birthday/12-16. Its preview (Facebook, WhatsApp) is the day's card; the page
 * shows the day's events, and a way to look up your own.
 */
export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/birthday/[md]">): Promise<Metadata> {
  const { md } = await params;
  const date = parseMonthDay(md);
  if (!date) return {};
  const saved = await birthdayDay(date.month, date.day, { search: false }).catch(() => null);
  const title = `${dayLabel(date.month, date.day)}-এ জন্ম? সেই দিনে বাংলাদেশে যা ঘটেছিল`;
  const description = saved?.events.length
    ? saved.events.slice(0, 3).map((e) => `${e.year.toLocaleString("bn-BD", { useGrouping: false })}: ${e.title_bn}`).join(" · ")
    : "আপনার জন্মদিনে বাংলাদেশে কী ঘটেছিল? দেখুন আর শেয়ার করুন।";
  const image = { url: `/og/birthday/${md}`, width: 1200, height: 630, alt: title };
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/birthday/${md}` },
    openGraph: { type: "website", locale: "bn_BD", url: `/birthday/${md}`, title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default async function BirthdayDayPage({ params }: PageProps<"/birthday/[md]">) {
  const { md } = await params;
  const date = parseMonthDay(md);
  if (!date) notFound();
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 md:py-16">
      <BirthdayFinder initial={date} />
      <p className="mt-8 text-center">
        <Link href="/" className="font-semibold text-accent hover:underline">
          মানচিত্রে বাংলাদেশের ইতিহাস দেখুন →
        </Link>
      </p>
    </div>
  );
}
