import { STATUS_EN, type EventStatus, type HistoricalEvent } from "@/lib/events/schema";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** An event's date for the admin (English), at the precision it is known: "16 November 1971", "March 1971", "500 BC". */
export function dateBn(e: Pick<HistoricalEvent, "date_precision" | "event_year" | "event_month" | "event_day" | "date_label">): string {
  if (e.date_precision === "approximate") return e.date_label ?? "Approximate";
  const y = e.event_year !== null && e.event_year !== undefined ? (e.event_year < 0 ? `${-e.event_year} BC` : String(e.event_year)) : "";
  if (e.date_precision === "year") return y;
  const m = e.event_month ? MONTHS[e.event_month - 1] : "";
  if (e.date_precision === "month") return `${m} ${y}`.trim();
  return `${e.event_day ?? ""} ${m} ${y}`.trim();
}

const STATUS_STYLE: Record<EventStatus, string> = {
  draft: "bg-pressed/60 text-ink-2",
  research: "bg-accent-soft text-accent",
  review: "bg-warning-soft text-warning",
  published: "bg-success-soft text-success",
  archived: "bg-hover text-muted",
};

export function StatusBadge({ status }: { status: EventStatus }) {
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-micro font-semibold ${STATUS_STYLE[status]}`}>{STATUS_EN[status]}</span>;
}
