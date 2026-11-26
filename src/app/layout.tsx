import type { Metadata, Viewport } from "next";
import { Fraunces, Hind_Siliguri } from "next/font/google";
import Link from "next/link";
import { Analytics } from "@/components/Analytics";
import { LogoMark, Wordmark } from "@/components/Logo";
import { SocialLinks } from "@/components/SocialLinks";
import { SITE } from "@/lib/places";
import "./globals.css";

const hind = Hind_Siliguri({
  variable: "--font-hind",
  subsets: ["bengali", "latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

// Only for the wordmark (Latin letters).
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["600"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: "বাংলাদেশের ঐতিহাসিক স্থানের মানচিত্র। প্রতিটি পিনে সেই জায়গার ইতিহাস, ছবি ও ভিডিও।",
  openGraph: {
    siteName: SITE.name,
    locale: "bn_BD",
    type: "website",
    images: [{ url: "/og/home", width: 1200, height: 630, alt: "বাংলাদেশের প্রতিটি জায়গার ইতিহাস, মানচিত্রে" }],
  },
  twitter: { card: "summary_large_image", images: ["/og/home"] },
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
    <html lang="bn" className={`${hind.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="site-header relative z-30 flex h-[calc(var(--header-h)+env(safe-area-inset-top))] shrink-0 items-center border-b border-line bg-paper ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] md:ps-[max(1.25rem,env(safe-area-inset-left))]">
          <Link href="/" aria-label={SITE.name} className="-mx-1 flex h-10 items-center gap-2 rounded-md px-1">
            <LogoMark className="h-6 w-auto" />
            <Wordmark className="text-lg" />
            <span className="hidden text-meta text-muted sm:inline">{SITE.tagline}</span>
          </Link>
          {/* Menu (English). "AI" marks the About link: this site's content is written by AI. */}
          <nav aria-label="Site" className="ms-auto flex items-center gap-1 text-meta">
            <Link
              href="/about"
              title="This site's content is written by AI (Google Gemini)"
              className="flex h-8 items-center gap-1.5 rounded-full px-2.5 font-semibold text-ink-2 transition-colors hover:bg-hover hover:text-ink"
            >
              <span className="rounded-full border border-accent/40 bg-accent-soft px-1.5 text-micro font-semibold text-accent">✦ AI</span>
              About Us
            </Link>
            <span className="text-line-strong" aria-hidden>
              |
            </span>
            <Link href="/privacy" className="flex h-8 items-center rounded-full px-2.5 text-ink-2 transition-colors hover:bg-hover hover:text-ink">
              Privacy Policy
            </Link>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        {/* Plain pages only (About, Privacy, collections): the map and the admin hide it (globals.css). */}
        <footer className="site-footer border-t border-line bg-paper ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 py-4 text-meta text-muted">
            <Link href="/" className="flex items-center gap-1.5 text-ink">
              <LogoMark className="h-5 w-auto" />
              <Wordmark className="text-body" />
            </Link>
            <Link href="/about" className="hover:text-ink">
              আমাদের কথা
            </Link>
            <Link href="/privacy" className="hover:text-ink">
              গোপনীয়তা নীতি
            </Link>
            <SocialLinks className="ms-auto" />
          </div>
        </footer>
        {panel}
      </body>
      <Analytics />
    </html>
  );
}
