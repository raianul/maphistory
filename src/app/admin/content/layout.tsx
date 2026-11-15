import Link from "next/link";
import { notFound } from "next/navigation";

// The admin reads and writes files on this computer, so it exists only under `pnpm dev`.
export const dynamic = "force-dynamic";

// The file-based editor for the places in content/places/ (until they move into the database).
export default function ContentAdminLayout({ children }: LayoutProps<"/admin/content">) {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <nav className="mb-6 flex items-center gap-4 text-sm">
        <Link href="/admin" className="font-bold">
          ← অ্যাডমিন মানচিত্র
        </Link>
        <Link href="/admin/content" className="font-semibold">
          ফাইলে রাখা জায়গা
        </Link>
        <span className="ms-auto text-muted">শুধু এই কম্পিউটারে চলে · লাইভ সাইটে নেই</span>
      </nav>
      {children}
    </div>
  );
}
