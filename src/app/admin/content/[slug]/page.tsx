import Link from "next/link";
import { PlaceStory } from "@/components/PlaceStory";
import { readPlaceFiles, resolvePlace } from "@/lib/content";
import { PlaceEditor } from "./PlaceEditor";

export default async function EditPlace({ params }: PageProps<"/admin/content/[slug]">) {
  const { slug } = await params;
  const errors: string[] = [];
  const files = await readPlaceFiles(slug, errors);
  if (!files) {
    return (
      <div>
        <h1 className="text-2xl font-bold">{slug}</h1>
        <p className="mt-2 text-red-800">ফাইলগুলো পড়া যায়নি। ঠিক করে আবার চেষ্টা করুন:</p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-card p-3 text-sm">{errors.join("\n")}</pre>
      </div>
    );
  }
  const preview = await resolvePlace(slug, files, (s, f) => `/admin/media/${s}/${f}`);

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_440px]">
      <PlaceEditor slug={slug} initial={files} />
      <aside className="rounded-xl border border-line bg-paper px-5 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
        <div className="flex items-center justify-between border-b border-line py-2 text-sm text-muted">
          <span>প্রিভিউ · সংরক্ষণের পর হালনাগাদ হয়</span>
          <Link href={`/place/${slug}`} className="text-accent underline" target="_blank">
            সাইটে দেখুন ↗
          </Link>
        </div>
        <PlaceStory place={preview} />
      </aside>
    </div>
  );
}
