"use client";

import { useId, useState } from "react";

export type StoryTab = { id: string; label: string; count?: number; content: React.ReactNode };

const bnNum = (n: number) => n.toLocaleString("bn-BD");

/**
 * A place's story in tabs (গল্প · মূল তারিখ · সূত্র) instead of one long scroll. Every tab is in
 * the page's HTML (search engines read them all); the others are only hidden. Arrow keys move
 * between tabs.
 */
export function StoryTabs({ tabs, resetKey }: { tabs: StoryTab[]; /** A new place starts on the first tab. */ resetKey?: string }) {
  const base = useId();
  const [state, setState] = useState({ key: resetKey, active: tabs[0]?.id });
  const active = state.key === resetKey && tabs.some((t) => t.id === state.active) ? state.active : tabs[0]?.id;
  const pick = (id: string) => setState({ key: resetKey, active: id });
  if (tabs.length === 0) return null;

  function onKey(e: React.KeyboardEvent, i: number) {
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const t = tabs[(to + tabs.length) % tabs.length];
    pick(t.id);
    document.getElementById(`${base}-tab-${t.id}`)?.focus();
  }

  return (
    <div className="mt-6">
      {tabs.length > 1 && (
        // Stays at the top while reading (on a solid ground, so text doesn't show through).
        <div className="sticky top-0 z-10 -mx-1 bg-paper px-1 py-2">
        <div role="tablist" aria-label="গল্পের অংশ" className="flex gap-1 rounded-full bg-hover p-1">
          {tabs.map((t, i) => {
            const on = t.id === active;
            return (
              <button
                key={t.id}
                id={`${base}-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={`${base}-panel-${t.id}`}
                tabIndex={on ? 0 : -1}
                onClick={() => pick(t.id)}
                onKeyDown={(e) => onKey(e, i)}
                className={`h-10 flex-1 rounded-full px-2 text-body transition-colors ${on ? "bg-card font-semibold text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}
              >
                {t.label}
                {t.count !== undefined && <span className="text-muted"> · {bnNum(t.count)}</span>}
              </button>
            );
          })}
        </div>
        </div>
      )}
      {tabs.map((t) => (
        <div key={t.id} id={`${base}-panel-${t.id}`} role={tabs.length > 1 ? "tabpanel" : undefined} aria-labelledby={tabs.length > 1 ? `${base}-tab-${t.id}` : undefined} hidden={t.id !== active}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
