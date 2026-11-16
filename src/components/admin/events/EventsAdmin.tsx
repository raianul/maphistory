"use client";

import { AdminApp } from "../AdminApp";
import { EventEditor } from "./EventEditor";
import { EventList } from "./EventList";

/** The events admin behind the usual login: the list, or one event's editor. */
export function EventsAdmin({ id }: { id?: string }) {
  return <AdminApp>{(email) => (id ? <EventEditor id={id} /> : <EventList email={email} />)}</AdminApp>;
}
