"use client";

import { useState, useTransition } from "react";
import type { PlaceFiles } from "@/lib/content";
import type { CommonsImage } from "@/lib/sources/commons";
import { addPhoto, findPhotos } from "../actions";

/**
 * Photos from Wikimedia Commons with their licence checked. Disallowed
 * licences are shown greyed out with the reason and can't be picked.
 */
export function PhotoPicker({
  slug,
  files,
  onAdded,
}: {
  slug: string;
  files: PlaceFiles;
  onAdded: (next: PlaceFiles, message: string) => void;
}) {
  const [images, setImages] = useState<CommonsImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  const hero = files.meta.hero ? files.credits[files.meta.hero.image] : undefined;

  function search() {
    setError(null);
    startLoading(async () => {
      const r = await findPhotos(slug);
      if (r.error) setError(r.error);
      setImages(r.images ?? []);
    });
  }

  async function pick(img: CommonsImage) {
    setBusy(img.file);
    setError(null);
    const r = await addPhoto(slug, files, img, true);
    setBusy(null);
    if (r.error || !r.files) setError(r.error ?? "ছবি যোগ করা যায়নি");
    else onAdded(r.files, r.ok ?? "");
  }

  return (
    <div>
      <p className="text-sm">
        প্রধান ছবি:{" "}
        {hero ? (
          <>
            <a href={hero.sourceUrl} target="_blank" rel="noreferrer" className="text-accent underline">
              {hero.title ?? files.meta.hero!.image}
            </a>{" "}
            <span className="text-muted">
              · {hero.author} · {hero.license}
            </span>
          </>
        ) : (
          <span className="text-muted">নেই</span>
        )}
      </p>
      <button
        type="button"
        onClick={search}
        disabled={loading}
        className="mt-2 rounded-full border border-line bg-card px-4 py-1.5 text-sm disabled:opacity-50"
      >
        {loading ? "খুঁজছি…" : images ? "আবার খুঁজুন" : "Commons থেকে ছবি খুঁজুন"}
      </button>
      {error && <p className="mt-2 text-sm text-red-800">{error}</p>}

      {images && (
        <>
          <p className="mt-3 text-xs text-muted">
            {images.filter((i) => i.allowed).length}টি ব্যবহারযোগ্য, {images.filter((i) => !i.allowed).length}টি লাইসেন্সের কারণে বাদ।
            ছবিতে ক্লিক করলে সেটা প্রধান ছবি হবে।
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((img) => (
              <li key={img.file} className={`overflow-hidden rounded-xl border border-line bg-card ${img.allowed ? "" : "opacity-50"}`}>
                <button
                  type="button"
                  disabled={!img.allowed || busy !== null}
                  onClick={() => pick(img)}
                  className="block w-full text-start disabled:cursor-not-allowed"
                  title={img.allowed ? "প্রধান ছবি হিসেবে নিন" : img.reason}
                >
                  {/* Commons thumbnails: a plain img is fine in the local admin. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.thumbUrl} alt={img.file} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  <div className="p-2 text-xs">
                    <span
                      className={`rounded px-1.5 py-0.5 font-semibold ${img.allowed ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`}
                    >
                      {img.credit.license}
                    </span>
                    <p className="mt-1 line-clamp-1 text-muted">{img.credit.author}</p>
                    {!img.allowed && <p className="mt-1 text-red-800">{img.reason}</p>}
                    {img.restrictions && <p className="mt-1 text-amber-800">⚠ {img.restrictions}</p>}
                    {busy === img.file && <p className="mt-1 font-semibold">যোগ হচ্ছে…</p>}
                  </div>
                </button>
                <a href={img.pageUrl} target="_blank" rel="noreferrer" className="block px-2 pb-2 text-xs text-accent underline">
                  Commons-এ দেখুন ↗
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
