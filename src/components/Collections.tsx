"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CollectionCard, PublicCollection } from "@/lib/collections";

const bn = (n: number) => n.toLocaleString("bn-BD", { useGrouping: false });

/**
 * The map's সংগ্রহ list: the published collections (title, how many places, a picture). Phones: a
 * sheet from the bottom; desktop: a card under the top bar. Picking one shows it on the map.
 */
export function CollectionsPicker({ onPick, onClose }: { onPick: (slug: string) => void; onClose: () => void }) {
  const [list, setList] = useState<CollectionCard[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/api/collections")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setList(d.collections))
      .catch(() => setFailed(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <button type="button" aria-label="বন্ধ করুন" onClick={onClose} className="absolute inset-0 bg-black/35 md:bg-transparent" />
      <div
        role="dialog"
        aria-label="সংগ্রহ"
        className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-3xl bg-card px-4 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-float md:inset-x-auto md:start-[max(1rem,env(safe-area-inset-left))] md:top-[5.5rem] md:bottom-auto md:max-h-[min(75dvh,640px)] md:w-[24rem] md:rounded-3xl md:pb-4"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong md:hidden" aria-hidden />
        <p className="px-1 text-body font-semibold">সংগ্রহ</p>
        <p className="mb-3 px-1 text-meta text-muted">বাছাই করা জায়গা, এক সঙ্গে মানচিত্রে।</p>
        {!list && !failed && <p className="px-1 py-6 text-meta text-muted">আনা হচ্ছে…</p>}
        {failed && <p className="px-1 py-6 text-meta text-danger">এখন আনা গেল না। একটু পরে আবার চেষ্টা করুন।</p>}
        {list?.length === 0 && <p className="px-1 py-6 text-meta text-muted">এখনো কোনো সংগ্রহ নেই। শিগগিরই আসছে।</p>}
        <ul className="flex flex-col gap-1">
          {list?.map((c) => (
            <li key={c.slug}>
              <button type="button" onClick={() => onPick(c.slug)} className="flex w-full items-center gap-3 rounded-2xl p-2 text-start transition-colors hover:bg-hover active:bg-pressed">
                {c.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a small Commons/YouTube thumbnail
                  <img src={c.thumb} alt="" loading="lazy" className="size-14 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="size-14 shrink-0 rounded-xl bg-accent-soft" aria-hidden />
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{c.title_bn}</span>
                  <span className="text-meta text-muted">{bn(c.count)}টি জায়গা</span>
                  {c.intro_bn && <span className="line-clamp-1 text-meta text-ink-2">{c.intro_bn}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The open collection, under the search: its title, ‹ n / N › to walk through its places (each
 * opens like a pin), its page, and ✕ to go back to every pin.
 */
export function CollectionBar({ c, at, onStep, onClose }: { c: PublicCollection; at: number | null; onStep: (i: number) => void; onClose: () => void }) {
  const n = c.places.length;
  const arrow = "grid size-10 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-hover disabled:opacity-30";
  return (
    <div className="pointer-events-auto mt-2 flex w-full max-w-md items-center gap-1 rounded-2xl bg-card py-1.5 ps-3.5 pe-1.5 shadow-float">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-micro font-semibold text-accent">সংগ্রহ · {bn(n)}টি জায়গা</span>
        <Link href={`/collection/${c.slug}`} className="truncate font-semibold hover:text-accent">
          {c.title_bn}
        </Link>
      </div>
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
