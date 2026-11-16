"use client";

import { useEffect, useState } from "react";
import type { AiPlace, PartialStory } from "@/lib/ai/types";
import { parsePartialJson } from "@/lib/partial-json";
import { AiStory } from "./AiStory";
import { SidePanel } from "./SidePanel";

export type AiTarget = {
  name: string;
  lat: number;
  lng: number;
  /** Map category, e.g. "suburb" or "place_of_worship". */
  kind?: string;
  /** Labels around it, so the AI knows which place of that name is meant. */
  nearby?: string[];
};

type View = {
  key: string;
  story: PartialStory;
  image?: AiPlace["image"];
  model?: string;
  id?: string;
  status?: AiPlace["status"];
  videos?: AiPlace["videos"];
  done: boolean;
  error?: string;
};

/** Errors the visitor can understand; anything technical becomes a plain Bangla message. */
function readableError(e: unknown): string {
  const msg = String((e as Error)?.message ?? e);
  if (/failed to fetch|networkerror|load failed|network/i.test(msg)) return "সংযোগ পাওয়া যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।";
  return msg.startsWith("HTTP ") ? "সার্ভারে সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।" : msg;
}

type Event =
  | { type: "delta"; text: string }
  | { type: "image"; image: NonNullable<AiPlace["image"]> }
  | { type: "done"; place: AiPlace }
  | { type: "error"; message: string };

/** A link that reopens this AI story on the map (see PlaceMap). */
export function aiShareUrl(t: AiTarget): string {
  const params = new URLSearchParams({ place: t.name, at: `${t.lat.toFixed(5)},${t.lng.toFixed(5)}` });
  if (t.kind) params.set("kind", t.kind);
  return `/?${params}`;
}

/** EXPERIMENT: streams a live AI story about a clicked map place and shows it as it is written. */
export function AiPanel({
  target,
  onClose,
  onExplore,
}: {
  target: AiTarget;
  onClose: () => void;
  onExplore?: (name: string) => void;
}) {
  const key = `${target.name}@${target.lat},${target.lng}`;
  const [view, setView] = useState<View | null>(null);
  // Bumped by "আবার চেষ্টা করুন" to run the request again.
  const [attempt, setAttempt] = useState(0);
  const current: View = view?.key === key ? view : { key, story: {}, done: false };

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      let text = "";
      let finished = false;
      const update = (patch: Partial<View>) =>
        setView((prev) => ({ ...(prev?.key === key ? prev : { key, story: {}, done: false }), ...patch }));
      try {
        const res = await fetch("/api/ai-place", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(target),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          return update({ error: data.error ?? readableError(`HTTP ${res.status}`), done: true });
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as Event;
            if (event.type === "delta") {
              text += event.text;
              const story = parsePartialJson<PartialStory>(text);
              if (story) update({ story });
            } else if (event.type === "image") {
              update({ image: event.image });
            } else if (event.type === "done") {
              finished = true;
              update({
                story: event.place.story,
                image: event.place.image,
                model: event.place.model,
                id: event.place.id,
                status: event.place.status,
                videos: event.place.videos,
                done: true,
              });
            } else {
              finished = true;
              update({ error: event.message, done: true });
            }
          }
        }
        // The connection closed without a final event (network drop, server restart): say so,
        // keep what was shown, and offer a retry, instead of "being written" forever.
        if (!finished && !ctrl.signal.aborted) update({ error: "লেখা মাঝপথে থেমে গেছে। আবার চেষ্টা করুন।", done: true });
      } catch (e) {
        if (!ctrl.signal.aborted) update({ error: readableError(e), done: true });
      }
    })();
    return () => ctrl.abort();
  }, [key, target, attempt]);

  const retry = () => {
    setView({ key, story: {}, done: false });
    setAttempt((a) => a + 1);
  };

  const started = Boolean(current.story.name_bn || current.story.summary_bn);

  return (
    <SidePanel title={target.name} onClose={onClose}>
      {current.error && !started ? (
        <FailedEmpty name={target.name} message={current.error} onRetry={retry} />
      ) : (
        <AiStory
          story={current.story}
          image={current.image}
          model={current.model}
          streaming={!current.done}
          fallbackName={target.name}
          at={target}
          shareUrl={aiShareUrl(target)}
          onExplore={onExplore}
          id={current.id}
          status={current.status}
          videos={current.videos}
          // What was already written stays; the notice sits under the header.
          notice={current.error ? <ErrorNotice message={current.error} onRetry={retry} /> : undefined}
        />
      )}
    </SidePanel>
  );
}

const RETRY_ICON = (
  <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9M15.5 3.5v3h-3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** A slim notice under the header when writing stopped midway; the part already shown stays. */
function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="mt-4 flex animate-[rise_.25s_var(--ease-out)] items-center gap-3 rounded-control bg-warning-soft py-1.5 ps-3.5 pe-1.5 text-meta text-warning">
      <p className="flex-1">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 font-semibold transition-colors hover:bg-warning-soft-hover"
      >
        {RETRY_ICON}
        আবার চেষ্টা
      </button>
    </div>
  );
}

/** Nothing could be written at all: the place's name, what went wrong, and one clear way forward. */
function FailedEmpty({ name, message, onRetry }: { name: string; message: string; onRetry: () => void }) {
  return (
    <div className="pt-1 pb-16">
      <h1 className="text-display font-bold tracking-tight">{name}</h1>
      <div role="alert" className="mt-10 flex animate-[rise_.3s_var(--ease-out)] flex-col items-center px-4 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-warning-soft text-warning" aria-hidden>
          <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M10 6.5v4.5M10 14h.01" strokeLinecap="round" />
            <circle cx="10" cy="10" r="7.5" />
          </svg>
        </span>
        <p className="mt-4 font-semibold">গল্পটি এখন আনা গেল না</p>
        <p className="mt-1 max-w-xs text-meta text-muted">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-meta font-semibold text-on-accent transition-colors hover:bg-accent-hover active:bg-accent-active"
        >
          {RETRY_ICON}
          আবার চেষ্টা করুন
        </button>
      </div>
    </div>
  );
}
