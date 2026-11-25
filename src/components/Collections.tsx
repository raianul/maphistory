"use client";

import { useEffect, useState } from "react";
import type { CollectionCard, PublicCollection } from "@/lib/collections";
import { SidePanel } from "./SidePanel";

const bn = (n: number) => n.toLocaleString("bn-BD", { useGrouping: false });

type Page = { collections: CollectionCard[]; page: number; pages: number; total: number };

/**
 * সংগ্রহ in the side panel (phones: the sheet), like আজকের দিনে: the published collections, five
 * a page; or one collection, its intro and its places in order (each opens like its pin).
 */
export function CollectionsPanel({
  open,
  at,
  loading,
  onPick,
  onPlace,
  onBack,
  onClose,
}: {
  /** The collection shown, or null for the list. */
  open: PublicCollection | null;
  /** Which of its places is open (highlighted), if any. */
  at: number | null;
  /** A collection is on its way (picked from the list or a shared link). */
  loading: boolean;
  onPick: (slug: string) => void;
  onPlace: (i: number) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <SidePanel title={open ? open.title_bn : "সংগ্রহ"} onClose={onClose}>
      {open ? <CollectionView c={open} at={at} onPlace={onPlace} onBack={onBack} /> : <CollectionList loading={loading} onPick={onPick} />}
    </SidePanel>
  );
}

function CollectionList({ loading, onPick }: { loading: boolean; onPick: (slug: string) => void }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ page: number; value?: Page; error?: string } | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/collections?page=${page}`, { signal: ctrl.signal })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        setData(r.ok ? { page, value: d } : { page, error: d.error ?? "সংগ্রহ আনা যায়নি" });
      })
      .catch(() => !ctrl.signal.aborted && setData({ page, error: "সংযোগ পাওয়া যায়নি" }));
    return () => ctrl.abort();
  }, [page]);
  const current = data?.page === page ? data : null;
  const v = current?.value;

  return (
    <div className="pb-10">
      <header className="pt-1">
        <p className="text-meta font-semibold text-accent">সংগ্রহ</p>
        <h1 className="text-display font-bold tracking-tight">বাছাই করা জায়গা</h1>
        <p className="mt-1 text-meta text-ink-2">একটি বিষয়ের জায়গাগুলো এক সঙ্গে, ক্রম অনুযায়ী মানচিত্রে।</p>
      </header>

      {(!current || loading) && <Skeleton />}
      {current?.error && <p className="mt-6 rounded-control bg-warning-soft px-3 py-2 text-meta text-warning">{current.error}</p>}
      {v && !loading && (
        <>
          {v.collections.length === 0 ? (
            <p className="mt-8 text-center text-meta text-muted">এখনো কোনো সংগ্রহ নেই। শিগগিরই আসছে।</p>
          ) : (
            <ul className="mt-4 grid gap-2">
              {v.collections.map((c) => (
                <li key={c.slug}>
                  <button type="button" onClick={() => onPick(c.slug)} className="flex w-full gap-3 rounded-2xl p-2 text-start transition-colors hover:bg-hover active:bg-pressed">
                    <span className="size-20 shrink-0 overflow-hidden rounded-control bg-accent-soft">
                      {c.thumb && (
                        // eslint-disable-next-line @next/next/no-img-element -- a small Commons/YouTube thumbnail
                        <img src={c.thumb} alt="" loading="lazy" className="size-full object-cover" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 py-0.5">
                      <span className="block text-meta font-semibold text-accent">{bn(c.count)}টি জায়গা</span>
                      <span className="mt-0.5 block font-semibold leading-snug">{c.title_bn}</span>
                      {c.intro_bn && <span className="mt-0.5 line-clamp-2 text-meta text-ink-2">{c.intro_bn}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {v.pages > 1 && (
            <nav aria-label="পাতা" className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="h-10 rounded-full px-4 text-meta font-semibold text-accent transition-colors hover:bg-accent-soft disabled:opacity-40"
              >
                ‹ আগের
              </button>
              <span className="text-meta text-muted" aria-live="polite">
                পাতা {bn(page)} / {bn(v.pages)}
              </span>
              <button
                type="button"
                disabled={page >= v.pages}
                onClick={() => setPage((p) => p + 1)}
                className="h-10 rounded-full px-4 text-meta font-semibold text-accent transition-colors hover:bg-accent-soft disabled:opacity-40"
              >
                পরের ›
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function CollectionView({ c, at, onPlace, onBack }: { c: PublicCollection; at: number | null; onPlace: (i: number) => void; onBack: () => void }) {
  return (
    <div className="pb-10">
      <button type="button" onClick={onBack} className="-ms-2 flex h-10 items-center rounded-full px-2 text-meta font-semibold text-accent hover:bg-accent-soft">
        ‹ সব সংগ্রহ
      </button>
      <header className="mt-1">
        <p className="text-meta font-semibold text-accent">সংগ্রহ · {bn(c.places.length)}টি জায়গা</p>
        <h1 className="text-display font-bold tracking-tight">{c.title_bn}</h1>
        {c.title_en && <p className="text-meta text-muted">{c.title_en}</p>}
        {c.intro_bn && <p className="mt-3 text-body text-ink-2">{c.intro_bn}</p>}
        <a href={`/collection/${c.slug}`} className="mt-2 inline-block text-meta font-semibold text-accent hover:underline">
          সংগ্রহের পাতা ↗
        </a>
      </header>
      <ol className="mt-5 grid gap-2">
        {c.places.map((p, i) => (
          <li key={p.story_id}>
            <button
              type="button"
              onClick={() => onPlace(i)}
              aria-current={at === i ? "true" : undefined}
              className={`flex w-full items-center gap-3 rounded-2xl p-2 text-start transition-colors hover:bg-hover active:bg-pressed ${at === i ? "bg-accent-soft" : ""}`}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-meta font-bold text-on-accent">{bn(i + 1)}</span>
              <span className="size-14 shrink-0 overflow-hidden rounded-control bg-accent-soft">
                {p.thumb && (
                  // eslint-disable-next-line @next/next/no-img-element -- a small Commons/YouTube thumbnail
                  <img src={p.thumb} alt="" loading="lazy" className="size-full object-cover" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-snug">
                  {p.label} {p.verified && <span className="text-meta text-success">✓</span>}
                </span>
                {p.note_bn ? <span className="line-clamp-2 text-meta text-ink-2">{p.note_bn}</span> : p.line && <span className="line-clamp-1 text-meta text-muted">{p.line}</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Skeleton() {
  return (
    <ul className="mt-4 grid gap-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex gap-3 p-2">
          <span className="skeleton size-20 shrink-0 rounded-control" />
          <span className="grid flex-1 content-start gap-2 pt-1">
            <span className="skeleton h-3 w-20 rounded" />
            <span className="skeleton h-4 w-4/5 rounded" />
            <span className="skeleton h-3 w-3/5 rounded" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * While one of the collection's places is open (the panel shows its story): the collection under
 * the search, ‹ n / N › to walk on, its title to go back to its list, ✕ to show every pin again.
 */
export function CollectionBar({ c, at, onStep, onList, onClose }: { c: PublicCollection; at: number | null; onStep: (i: number) => void; onList: () => void; onClose: () => void }) {
  const n = c.places.length;
  const arrow = "grid size-10 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-hover disabled:opacity-30";
  return (
    <div className="pointer-events-auto mt-2 flex w-full max-w-md items-center gap-1 rounded-2xl bg-card py-1.5 ps-3.5 pe-1.5 shadow-float">
      <button type="button" onClick={onList} className="flex min-w-0 flex-1 flex-col text-start" title="সংগ্রহের তালিকা">
        <span className="text-micro font-semibold text-accent">সংগ্রহ · {bn(n)}টি জায়গা</span>
        <span className="truncate font-semibold hover:text-accent">{c.title_bn}</span>
      </button>
      <button type="button" aria-label="আগের জায়গা" disabled={at === 0} onClick={() => onStep(at === null ? n - 1 : at - 1)} className={arrow}>
        <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m12 5-5 5 5 5" />
        </svg>
      </button>
      <span className="min-w-12 text-center text-meta text-muted" aria-live="polite">
        {at === null ? `${bn(n)}টি` : `${bn(at + 1)} / ${bn(n)}`}
      </span>
      <button type="button" aria-label="পরের জায়গা" disabled={at === n - 1} onClick={() => onStep(at === null ? 0 : at + 1)} className={arrow}>
        <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m8 5 5 5-5 5" />
        </svg>
      </button>
      <button type="button" aria-label="সংগ্রহ বন্ধ করুন" onClick={onClose} className={`${arrow} text-muted hover:text-ink`}>
        <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M5 5l10 10M15 5 5 15" />
        </svg>
      </button>
    </div>
  );
}
