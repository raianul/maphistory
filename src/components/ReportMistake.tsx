"use client";

import { useState } from "react";

/** "ভুল দেখেছেন?" A short form under a saved story; reports reach the admin's list. */
export function ReportMistake({ storyId }: { storyId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | string>("idle");

  async function send() {
    setState("sending");
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: storyId, message }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setState(res?.ok ? "sent" : (data.error ?? "পাঠানো যায়নি"));
  }

  if (state === "sent") return <p className="mt-8 text-meta text-success">ধন্যবাদ! আপনার বার্তা পৌঁছেছে, আমরা দেখে ঠিক করব।</p>;

  return (
    <div className="mt-8">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-ms-2 h-10 rounded-full px-2 text-meta font-semibold text-accent transition-colors hover:bg-accent-soft hover:text-accent-hover"
        >
          ভুল দেখেছেন? জানান
        </button>
      ) : (
        <div className="animate-[rise_.2s_var(--ease-out)]">
          <label className="text-meta font-semibold" htmlFor={`report-${storyId}`}>
            কোন তথ্যটা ভুল, আর সঠিকটা কী?
          </label>
          <textarea
            id={`report-${storyId}`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={1000}
            rows={3}
            className="mt-2 w-full rounded-control border border-line-strong bg-card px-3 py-2 text-[16px] caret-accent outline-none transition-shadow placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent-ring md:text-meta"
            placeholder="যেমন: নির্মাণের সাল ১৭০৬ নয়, ১৭১১। সূত্র: …"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={send}
              disabled={state === "sending" || message.trim().length < 3}
              className="h-10 rounded-full bg-accent px-4 text-meta font-semibold text-on-accent transition-colors hover:bg-accent-hover active:bg-accent-active disabled:bg-pressed disabled:text-muted"
            >
              {state === "sending" ? "পাঠানো হচ্ছে…" : "পাঠান"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-full px-3 text-meta text-muted hover:text-ink">
              বাতিল
            </button>
            {state !== "idle" && state !== "sending" && <span className="text-meta text-danger">{state}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
