"use client";

import { useState } from "react";
import { slugOf, track } from "@/lib/analytics";
import { formatDuration, PROVIDERS, type PlaceVideo } from "@/lib/video";

const LANGUAGE: Record<string, string> = { bn: "বাংলা", en: "English", hi: "हिन्दी", ur: "اردو" };

/**
 * A place's historical videos, main one first. Lazy: only a thumbnail (a plain
 * image) until the viewer presses play, then the provider's player in a 16:9
 * frame. Nothing plays on its own. Other videos of the place are listed below.
 */
export function VideoPlayer({ videos }: { videos: PlaceVideo[] }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const video = videos[Math.min(index, videos.length - 1)];
  if (!video) return null;
  const spec = PROVIDERS[video.provider];
  const duration = formatDuration(video.durationSeconds);
  const others = videos.map((v, i) => ({ v, i })).filter(({ i }) => i !== index);

  return (
    <section aria-label="ভিডিও" className="mt-5">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-ink/5">
        {playing ? (
          <iframe
            key={video.id}
            src={spec.embedUrl(video.providerVideoId)}
            title={video.title}
            className="absolute inset-0 size-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setPlaying(true);
              track("video_play", { slug: slugOf(window.location.pathname), video_id: video.providerVideoId, video_title: video.title });
            }}
            className="group absolute inset-0 size-full"
            aria-label={`ভিডিও চালান: ${video.title}`}
          >
            <Thumbnail video={video} className="absolute inset-0 size-full object-cover" />
            <span className="absolute inset-0 bg-black/10 transition group-hover:bg-black/20" aria-hidden />
            <span
              className="absolute top-1/2 left-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 shadow-md transition group-hover:scale-105"
              aria-hidden
            >
              <svg viewBox="0 0 24 24" className="ms-0.5 size-6 fill-ink">
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            </span>
            {duration && (
              <span className="absolute end-2 bottom-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-semibold text-white">{duration}</span>
            )}
          </button>
        )}
      </div>

      <h2 className="mt-2.5 leading-snug font-semibold">{video.title}</h2>
      <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
        {duration && <span>{duration}</span>}
        {video.language && <span>{LANGUAGE[video.language] ?? video.language}</span>}
        <a href={video.url} target="_blank" rel="noreferrer" className="underline hover:text-accent">
          YouTube-এ দেখুন ↗
        </a>
      </p>

      {others.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-muted">আরও ভিডিও</p>
          <ul className="mt-1.5 grid gap-1">
            {others.map(({ v, i }) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => {
                    setIndex(i);
                    setPlaying(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg p-1.5 text-start hover:bg-ink/5"
                >
                  <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-ink/5">
                    <Thumbnail video={v} className="absolute inset-0 size-full object-cover" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm leading-snug">{v.title}</span>
                    {formatDuration(v.durationSeconds) && <span className="text-xs text-muted">{formatDuration(v.durationSeconds)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** The stored thumbnail, then the provider's standard one; a plain tile if both fail (removed video). */
function Thumbnail({ video, className }: { video: PlaceVideo; className: string }) {
  const sources = [video.thumbnailUrl, PROVIDERS[video.provider].thumbnailUrl(video.providerVideoId)].filter(
    (s, i, a): s is string => !!s && a.indexOf(s) === i,
  );
  const [attempt, setAttempt] = useState(0);
  if (attempt >= sources.length) {
    return (
      <span className={`${className} grid place-items-center bg-ink/5 text-xs text-muted`} aria-hidden>
        ছবি পাওয়া যায়নি
      </span>
    );
  }
  return (
    // Provider thumbnails: plain <img> (no image optimisation needed, loaded lazily).
    // eslint-disable-next-line @next/next/no-img-element
    <img src={sources[attempt]} alt="" loading="lazy" decoding="async" className={className} onError={() => setAttempt((a) => a + 1)} />
  );
}
