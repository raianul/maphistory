"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { AdminHome } from "@/lib/admin-home";
import { AMP_PATH, MARK_VIEWBOX, PIN_PATH } from "@/lib/logo";
import { Wordmark } from "../Logo";
import { adminFetch, browserSupabase } from "@/lib/supabase-browser";

/** Home's numbers, shared with the menu (its badge) and reloaded after a change. */
type HomeState = { data: AdminHome | null; error: string | null; reload: () => void };
const HomeContext = createContext<HomeState>({ data: null, error: null, reload: () => {} });
export const useAdminHome = () => useContext(HomeContext);

type Section = "home" | "places" | "events" | "otd";

const SECTIONS: { id: Section; href: string; label: string; icon: string }[] = [
  { id: "home", href: "/admin", label: "Home", icon: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" },
  { id: "places", href: "/admin/places", label: "Places", icon: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" },
  { id: "events", href: "/admin/events", label: "Events", icon: "M4 6h16M4 12h16M4 18h10" },
  { id: "otd", href: "/admin/events/today", label: "On this day", icon: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4" },
];

function sectionOf(path: string): Section {
  if (path.startsWith("/admin/places")) return "places";
  if (path.startsWith("/admin/events/today")) return "otd";
  if (path.startsWith("/admin/events")) return "events";
  return "home";
}

function Icon({ d, className = "size-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function Mark({ className = "size-9 rounded-xl" }: { className?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center bg-accent ${className}`} aria-hidden>
      <svg viewBox={MARK_VIEWBOX} className="h-[62%] w-auto">
        <path d={PIN_PATH} fill="#ffffff" />
        <path d={AMP_PATH} className="fill-accent" />
      </svg>
    </span>
  );
}

/**
 * The admin's frame: a menu on the left (Home · Places · Events · On this day), on phones a tab
 * bar at the bottom. The site's own header steps aside (globals.css, `.admin-shell`).
 */
export function AdminShell({ email, children }: { email?: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = sectionOf(path);
  const [home, setHome] = useState<{ data: AdminHome | null; error: string | null }>({ data: null, error: null });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  // Home's numbers: on load, after a change, and when moving between sections (the badge stays true).
  useEffect(() => {
    let live = true;
    adminFetch("/api/admin/home")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (live) setHome(r.ok ? { data: d as AdminHome, error: null } : { data: null, error: d.error ?? `HTTP ${r.status}` });
      })
      .catch(() => live && setHome((h) => ({ ...h, error: "Can't reach the server" })));
    return () => {
      live = false;
    };
  }, [version, active]);

  const badge = home.data?.counts.total ?? 0;

  return (
    <HomeContext.Provider value={{ ...home, reload }}>
      <div className="admin-shell flex min-h-dvh bg-paper">
        {/* Desktop menu */}
        <nav aria-label="Admin sections" className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 border-e border-line bg-card px-3.5 py-5 md:flex">
          <Link href="/admin" className="mb-4 flex items-center gap-2.5 px-2">
            <Mark />
            <span className="flex flex-col leading-tight">
              <Wordmark className="text-lead" />
              <span className="text-micro text-muted">Admin</span>
            </span>
          </Link>
          {SECTIONS.map((s) => {
            const on = s.id === active;
            return (
              <Link
                key={s.id}
                href={s.href}
                aria-current={on ? "page" : undefined}
                className={`flex h-11 items-center gap-3 rounded-xl px-3 transition-colors ${on ? "bg-accent-soft font-semibold text-accent" : "font-medium text-ink-2 hover:bg-hover hover:text-ink"}`}
              >
                <Icon d={s.icon} />
                {s.label}
                {s.id === "home" && badge > 0 && (
                  <span className="ms-auto grid h-[22px] min-w-[22px] place-items-center rounded-full bg-accent px-1.5 text-micro font-bold text-on-accent">{badge}</span>
                )}
              </Link>
            );
          })}
          <div className="flex-1" />
          <a href="/" target="_blank" rel="noreferrer" className="flex h-11 items-center gap-3 rounded-xl px-3 font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink">
            <Icon d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
            View the site
          </a>
          <Account email={email} />
        </nav>

        <div className="min-w-0 flex-1 pb-[var(--admin-tabbar)]">{children}</div>

        {/* Phone tab bar */}
        <nav aria-label="Admin sections" className="fixed inset-x-0 bottom-0 z-10 grid h-[var(--admin-tabbar)] grid-cols-4 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
          {SECTIONS.map((s) => {
            const on = s.id === active;
            return (
              <Link key={s.id} href={s.href} aria-current={on ? "page" : undefined} className={`relative flex flex-col items-center justify-center gap-0.5 text-micro ${on ? "font-semibold text-accent" : "text-ink-2"}`}>
                <Icon d={s.icon} className="size-[22px]" />
                {s.label}
                {s.id === "home" && badge > 0 && (
                  <span className="absolute top-1.5 start-[calc(50%+6px)] grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-on-accent">{badge}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </HomeContext.Provider>
  );
}

function Account({ email }: { email?: string }) {
  return (
    <div className="mt-2 flex items-center gap-2.5 border-t border-line px-2 pt-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft-hover text-meta font-bold text-accent-active" aria-hidden>
        {(email?.[0] ?? "?").toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate text-meta text-ink-2" title={email}>
        {email}
      </span>
      <button type="button" onClick={() => browserSupabase().auth.signOut()} className="text-meta text-muted underline hover:text-ink">
        Log out
      </button>
    </div>
  );
}
