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
  // Edge to edge on notched phones; the layout pads itself with env(safe-area-inset-*).
  viewportFit: "cover",
  // The on-screen keyboard overlays the page instead of shrinking it, so the map and sheet don't jump.
  interactiveWidget: "overlays-content",
};

export default function RootLayout({ children, panel }: LayoutProps<"/">) {
  return (
    <html lang="bn" className={`${hind.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="relative z-30 flex h-[calc(var(--header-h)+env(safe-area-inset-top))] shrink-0 items-center border-b border-line bg-paper ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] md:ps-[max(1.25rem,env(safe-area-inset-left))]">
          <Link href="/" className="-mx-1 flex h-10 items-center gap-2 rounded-md px-1">
            <span className="text-lg font-bold tracking-tight">{SITE.name}</span>
            <span className="hidden text-meta text-muted sm:inline">{SITE.nameEn}</span>
          </Link>
        </header>
        <main className="flex-1">{children}</main>
        {panel}
      </body>
    </html>
  );
}
