import { ERA_META, readableText } from "@/lib/format";
import type { Era } from "@/lib/schema";

export function EraTag({ era }: { era: Era }) {
  const meta = ERA_META[era];
  return (
    // The dot keeps the era colour; the label uses a shade dark enough to read.
    <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: readableText(meta.hex) }}>
      <span className="size-2 rounded-full" style={{ background: meta.color }} aria-hidden />
      {meta.bn}
    </span>
  );
}
