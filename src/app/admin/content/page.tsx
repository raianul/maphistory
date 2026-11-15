import Link from "next/link";
import { EraTag } from "@/components/EraTag";
import { listSlugs, readPlaceFiles } from "@/lib/content";

const STATUS_STYLE = {
  draft: "bg-stone-200 text-stone-800",
  review: "bg-amber-100 text-amber-900",
  published: "bg-emerald-100 text-emerald-900",
} as const;

export default async function AdminHome() {
  const rows = await Promise.all(
    (await listSlugs()).map(async (slug) => {
      const errors: string[] = [];
      return { slug, files: await readPlaceFiles(slug, errors), errors };
    }),
  );
  return (
    <div>
      <h1 className="text-2xl font-bold">সব জায়গা</h1>
      <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-card">
        {rows.map(({ slug, files, errors }) => {
          const unverified = files?.story.filter((b) => b.evidence && !b.evidence.found).length ?? 0;
          return (
            <li key={slug}>
              <Link href={`/admin/content/${slug}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-paper">
                <span className="font-semibold">{files?.meta.name.bn ?? slug}</span>
                {files && <EraTag era={files.meta.era} />}
                <span className="text-sm text-muted">{slug}</span>
                <span className="ms-auto flex items-center gap-2 text-sm">
                  {errors.length > 0 && <span className="text-red-700">ফাইলে সমস্যা</span>}
                  {unverified > 0 && <span className="text-amber-800">⚠ {unverified}টি দাবি যাচাই বাকি</span>}
                  {files && <span className="text-muted">{files.meta.tier}</span>}
                  {files && (
                    <span className={`rounded-full px-2 py-0.5 ${STATUS_STYLE[files.meta.status]}`}>{files.meta.status}</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
