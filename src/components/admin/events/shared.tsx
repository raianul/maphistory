import { bnYear } from "@/lib/format";
import { STATUS_BN, type EventStatus, type HistoricalEvent } from "@/lib/events/schema";

const MONTHS_BN = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];

/** An event's date as people say it, at the precision it is known. */
export function dateBn(e: Pick<HistoricalEvent, "date_precision" | "event_year" | "event_month" | "event_day" | "date_label">): string {
  if (e.date_precision === "approximate") return e.date_label ?? "আনুমানিক";
  const y = e.event_year !== null && e.event_year !== undefined ? (e.event_year < 0 ? `খ্রিস্টপূর্ব ${bnYear(-e.event_year)}` : bnYear(e.event_year)) : "";
  if (e.date_precision === "year") return y;
  const m = e.event_month ? MONTHS_BN[e.event_month - 1] : "";
  if (e.date_precision === "month") return `${m} ${y}`;
  return `${e.event_day ? bnYear(e.event_day) : ""} ${m} ${y}`.trim();
}

const STATUS_STYLE: Record<EventStatus, string> = {
  draft: "bg-pressed/60 text-ink-2",
  research: "bg-accent-soft text-accent",
  review: "bg-warning-soft text-warning",
  published: "bg-success-soft text-success",
  archived: "bg-hover text-muted",
};

export function StatusBadge({ status }: { status: EventStatus }) {
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-micro font-semibold ${STATUS_STYLE[status]}`}>{STATUS_BN[status]}</span>;
}
