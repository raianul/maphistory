"use client";

import { AdminApp } from "./AdminApp";
import { AdminMap } from "./AdminMap";

/** /admin/places behind the usual login: every saved place, its pin and its tools. */
export function PlacesAdmin() {
  return <AdminApp>{() => <AdminMap />}</AdminApp>;
}
