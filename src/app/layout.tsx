import type { Metadata, Viewport } from "next";
import { Hind_Siliguri } from "next/font/google";
import Link from "next/link";
import { SITE } from "@/lib/places";
import "./globals.css";

const hind = Hind_Siliguri({
  variable: "--font-hind",
  subsets: ["bengali", "latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: "বাংলাদেশের ঐতিহাসিক স্থানের মানচিত্র। প্রতিটি পিনে সেই জায়গার ছবি-সহ গল্প।",
  openGraph: { siteName: SITE.name, locale: "bn_BD", type: "website" },
};

export const viewport: Viewport = {
  themeColor: "#fafaf9",
};

export default function RootLayout({ children, panel }: LayoutProps<"/">) {
  return (
    <html lang="bn" className={`${hind.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4">
            <Link href="/" className="text-xl font-bold">
              {SITE.name}
            </Link>
            <span className="text-sm text-muted">{SITE.nameEn}</span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        {panel}
      </body>
    </html>
  );
}
