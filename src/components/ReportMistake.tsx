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

  if (state === "sent") return <p className="mt-6 text-sm text-emerald-800">ধন্যবাদ! আপনার বার্তা পৌঁছেছে, আমরা যাচাই করে ঠিক করব।</p>;

  return (
    <div className="mt-6">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-accent underline">
          ভুল দেখেছেন? জানান
        </button>
      ) : (
        <div className="rounded-2xl border border-line bg-card p-3">
          <label className="text-sm font-semibold" htmlFor={`report-${storyId}`}>
            কোন তথ্যটা ভুল, আর সঠিকটা কী?
          </label>
          <textarea
            id={`report-${storyId}`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={1000}
            rows={3}
            className="mt-1.5 w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            placeholder="যেমন: নির্মাণের সাল ১৭০৬ নয়, ১৭১১। সূত্র: …"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={send}
              disabled={state === "sending" || message.trim().length < 3}
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {state === "sending" ? "পাঠানো হচ্ছে…" : "পাঠান"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">
              বাতিল
            </button>
            {state !== "idle" && state !== "sending" && <span className="text-sm text-red-800">{state}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
