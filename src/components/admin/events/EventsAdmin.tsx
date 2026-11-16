"use client";

import { AdminApp } from "../AdminApp";
import { EventEditor } from "./EventEditor";
import { EventList } from "./EventList";
import { EventPreview } from "./EventPreview";
import { OnThisDayAdmin } from "./OnThisDayAdmin";

type View = { kind: "list" } | { kind: "today" } | { kind: "edit"; id: string } | { kind: "preview"; id: string };

/** The events admin behind the usual login: the list, "On this day", one event's preview or editor. */
export function EventsAdmin({ id, view }: { id?: string; view?: "today" | "preview" }) {
  const v: View = view === "today" ? { kind: "today" } : id ? (view === "preview" ? { kind: "preview", id } : { kind: "edit", id }) : { kind: "list" };
  return (
    <AdminApp>
      {(email) =>
        v.kind === "today" ? <OnThisDayAdmin /> : v.kind === "preview" ? <EventPreview id={v.id} /> : v.kind === "edit" ? <EventEditor id={v.id} /> : <EventList email={email} />
      }
    </AdminApp>
  );
}
