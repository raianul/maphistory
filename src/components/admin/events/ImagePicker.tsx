"use client";

import { useState } from "react";
import type { CoverImage } from "@/lib/events/schema";
import { adminFetch } from "@/lib/supabase-browser";
import type { z } from "zod";

type Img = z.infer<typeof CoverImage>;
type Result = { file: string; thumbUrl: string; src: string; credit: Img["credit"] & { title?: string }; allowed: boolean; reason?: string };

const field =
  "w-full rounded-control border border-line-strong bg-card px-3 py-2 text-meta outline-none focus:border-accent focus:ring-2 focus:ring-accent-ring";

/**
 * Choose a Wikimedia Commons image (the existing search and licence check): search by words, or
 * photos taken near a point. Images on a licence the site can't use are shown, greyed, with the
 * reason, and can't be picked. The credit is saved with the image.
 */
export function ImagePicker({ value, near, onChange }: { value: Img | null | undefined; near?: { lat: number; lng: number } | null; onChange: (v: Img | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function search(params: string) {
    setBusy(true);
    setError(null);
    const r = await adminFetch(`/api/admin/commons?${params}`);
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(d.error ?? `HTTP ${r.status}`);
    setResults(d.images);
  }

  return (
    <div className="grid gap-2">
      {value ? (
        <figure className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- Commons thumbnail, licence checked */}
          <img src={value.src} alt="" className="h-20 w-28 shrink-0 rounded-control object-cover" />
          <figcaption className="min-w-0 flex-1 text-micro text-muted">
            <span className="block truncate">Image: {value.credit.author}</span>
            <span className="block">{value.credit.license}</span>
            <a href={value.credit.sourceUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              View on Commons ↗
            </a>
          </figcaption>
          <button type="button" onClick={() => onChange(null)} className="text-meta text-danger hover:underline">
            Remove
          </button>
        </figure>
      ) : (
        !open && (
          <button type="button" onClick={() => setOpen(true)} className="h-9 w-fit rounded-full bg-accent-soft px-3 text-meta font-semibold text-accent hover:bg-accent-soft-hover">
            + Image from Wikimedia Commons
          </button>
        )
      )}
      {open && !value && (
        <div className="grid gap-2 rounded-control border border-line p-3">
          <div className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), q.trim().length >= 2 && search(`q=${encodeURIComponent(q.trim())}`))}
              placeholder="Search Commons (works best in English)"
              className={field}
            />
            <button type="button" disabled={busy || q.trim().length < 2} onClick={() => search(`q=${encodeURIComponent(q.trim())}`)} className="h-10 shrink-0 rounded-full bg-accent px-4 text-meta font-semibold text-on-accent disabled:opacity-50">
              Search
            </button>
          </div>
          {near && (
            <button type="button" disabled={busy} onClick={() => search(`lat=${near.lat}&lng=${near.lng}`)} className="w-fit text-meta font-semibold text-accent hover:underline">
              Show photos taken near this place
            </button>
          )}
          {busy && <p className="text-meta text-muted">Searching…</p>}
          {error && <p className="text-meta text-danger">{error}</p>}
          {results && !busy && (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {results.length === 0 && <li className="col-span-full text-meta text-muted">Nothing found</li>}
              {results.map((r) => (
                <li key={r.file}>
                  <button
                    type="button"
                    disabled={!r.allowed}
                    onClick={() => onChange({ src: r.src, credit: { author: r.credit.author.slice(0, 300), license: r.credit.license, licenseUrl: r.credit.licenseUrl, sourceUrl: r.credit.sourceUrl } })}
                    title={r.allowed ? `${r.credit.author} · ${r.credit.license}` : `Can't be used: ${r.reason}`}
                    className="group relative block w-full overflow-hidden rounded-control enabled:hover:ring-2 enabled:hover:ring-accent disabled:cursor-not-allowed"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- Commons thumbnails */}
                    <img src={r.thumbUrl} alt="" loading="lazy" className={`aspect-[4/3] w-full object-cover ${r.allowed ? "" : "opacity-30 grayscale"}`} />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-card/90 px-1.5 text-micro text-ink-2">{r.allowed ? r.credit.license : "Licence not allowed"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setOpen(false)} className="w-fit text-meta text-muted hover:text-ink">
            Close
          </button>
        </div>
      )}
    </div>
  );
}
