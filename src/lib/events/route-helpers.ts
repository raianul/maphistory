/**
 * Shared steps for the admin event routes: load the event, refuse edits that would break a
 * published one, clear the public cache when visitors could be affected. Server-side only.
 */
import { invalidatePublicEvents } from "./cache";
import { getEvent, withProblems, type EventBundle } from "./db";
import { publishProblems } from "./schema";

export const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
export const notFound = () => Response.json({ error: "পাওয়া যায়নি" }, { status: 404 });
export const badRequest = (error: string, issues?: unknown) => Response.json({ error, issues }, { status: 400 });

/**
 * Runs a change and answers with the fresh event. If the event is published, the change must keep
 * it publishable (else it is refused before anything is written, by `check`), and the public cache
 * is cleared afterwards.
 */
export async function applyChange(
  id: string,
  change: (current: EventBundle) => Promise<void>,
  check?: (current: EventBundle) => EventBundle,
): Promise<Response> {
  if (!isId(id)) return notFound();
  try {
    const current = await getEvent(id);
    if (!current) return notFound();
    if (current.event.status === "published" && check) {
      const after = check(current);
      const problems = publishProblems(after.event, after.sources, after.steps);
      if (problems.length) return Response.json({ error: "প্রকাশিত ঘটনায় এই পরিবর্তন করা যায় না; আগে অপ্রকাশিত করুন", problems }, { status: 409 });
    }
    await change(current);
    if (current.event.status === "published") invalidatePublicEvents();
    return Response.json(withProblems((await getEvent(id))!));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
