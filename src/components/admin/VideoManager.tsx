"use client";

import { useState } from "react";
import { adminFetch } from "@/lib/supabase-browser";
import { formatDuration, type PlaceVideo } from "@/lib/video";

const input = "w-full rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm outline-none focus:border-accent";

/**
 * A place's videos in the admin: add one by its YouTube link (the title and
 * thumbnail come from YouTube, which also rejects missing or private videos),
 * choose the main one, remove. Duration is optional and only what the editor types.
 */
export function VideoManager({
  storyId,
  videos,
  onChange,
}: {
  storyId: string;
  videos: PlaceVideo[];
  onChange: (videos: PlaceVideo[]) => void;
}) {
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("bn");
  const [duration, setDuration] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(label: string, path: string, init: RequestInit) {
    setBusy(label);
    setError(null);
    const r = await adminFetch(path, init);
    const data = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) {
      setError(data.error ?? `HTTP ${r.status}`);
      return false;
    }
    onChange(data.videos ?? []);
    return true;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const ok = await call("add", `/api/admin/stories/${storyId}/videos`, {
      method: "POST",
      body: JSON.stringify({ url, language, duration }),
    });
    if (ok) {
      setUrl("");
      setDuration("");
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-line bg-card p-3">
      <h3 className="text-sm font-semibold">Videos {videos.length > 0 && <span className="font-normal text-muted">({videos.length})</span>}</h3>

      {videos.length > 0 && (
        <ul className="mt-2 grid gap-2">
          {videos.map((v, i) => (
            <li key={v.id} className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.thumbnailUrl} alt="" className="aspect-video w-20 shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{v.title}</p>
                <p className="text-xs text-muted">
                  {i === 0 && <span className="font-semibold text-accent">Main video · </span>}
                  {v.language}
                  {formatDuration(v.durationSeconds) && ` · ${formatDuration(v.durationSeconds)}`}
                </p>
              </div>
              {i > 0 && (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => call(`main-${v.id}`, `/api/admin/stories/${storyId}/videos/${v.id}`, { method: "PATCH" })}
                  className="shrink-0 text-xs text-accent underline disabled:opacity-50"
                >
                  Make main
                </button>
              )}
              <button
                type="button"
                disabled={!!busy}
                onClick={() => call(`del-${v.id}`, `/api/admin/stories/${storyId}/videos/${v.id}`, { method: "DELETE" })}
                className="shrink-0 text-xs text-red-700 underline disabled:opacity-50"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="mt-3 grid gap-2">
        <input
          className={input}
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="YouTube link, e.g. https://www.youtube.com/watch?v=…"
          aria-label="Video link"
        />
        <div className="flex gap-2">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className={`${input} w-28`} aria-label="Language">
            <option value="bn">Bangla</option>
            <option value="en">English</option>
          </select>
          <input
            className={input}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="Duration (optional), e.g. 12:34"
            aria-label="Duration"
          />
          <button type="submit" disabled={!!busy} className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy === "add" ? "Checking…" : "Add"}
          </button>
        </div>
        <p className="text-xs text-muted">The title and thumbnail come from YouTube. Wrong, deleted or private videos can&rsquo;t be added.</p>
      </form>
      {error && <p className="mt-2 text-sm text-red-800">{error}</p>}
    </section>
  );
}
