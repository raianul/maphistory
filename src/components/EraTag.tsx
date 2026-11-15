import { ERA_META } from "@/lib/format";
import type { Era } from "@/lib/schema";

export function EraTag({ era }: { era: Era }) {
  const meta = ERA_META[era];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm"
      style={{ borderColor: meta.color, color: meta.color }}
    >
      <span className="size-2 rounded-full" style={{ background: meta.color }} aria-hidden />
      {meta.bn}
    </span>
  );
}
