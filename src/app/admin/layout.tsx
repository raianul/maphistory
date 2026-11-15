import type { Metadata } from "next";

// The admin is never shown in search results.
export const metadata: Metadata = { title: "অ্যাডমিন", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
