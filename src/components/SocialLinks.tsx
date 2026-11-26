import { FACEBOOK_URL, YOUTUBE_URL } from "@/lib/links";

/** Place & Past on Facebook and YouTube, as small icon links (the footer, the place panel). */
export function SocialLinks({ className = "", size = "size-5" }: { className?: string; size?: string }) {
  const link = "grid size-10 place-items-center rounded-full text-ink-2 transition-colors hover:bg-hover hover:text-accent";
  return (
    <span className={`flex items-center gap-1 ${className}`}>
      <a href={FACEBOOK_URL} target="_blank" rel="noreferrer" aria-label="Facebook-এ Place & Past" title="Facebook" className={link}>
        <FacebookIcon className={size} />
      </a>
      <a href={YOUTUBE_URL} target="_blank" rel="noreferrer" aria-label="YouTube-এ Place & Past" title="YouTube" className={link}>
        <YoutubeIcon className={size} />
      </a>
    </span>
  );
}

export function FacebookIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M13.5 21v-7.5H16l.4-3H13.5V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21z" />
    </svg>
  );
}

export function YoutubeIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3z" />
    </svg>
  );
}
