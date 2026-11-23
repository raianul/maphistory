"use client";

import { useState } from "react";
import { SidePanel } from "./SidePanel";

/**
 * The panel of a hand-written place opened by its own address (/place/<slug>): over the map, like
 * clicking it. Closing shows the plain map and sets the address to "/" (no reload).
 */
export function PagePanel({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <SidePanel
      title={title}
      onClose={() => {
        setOpen(false);
        window.history.replaceState(window.history.state, "", "/");
      }}
    >
      {children}
    </SidePanel>
  );
}
