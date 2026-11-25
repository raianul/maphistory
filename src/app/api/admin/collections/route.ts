import { requireAdmin } from "@/lib/admin-auth";
import { adminCollections, CollectionInput, saveCollection } from "@/lib/collections";

/** Every collection (drafts too). `missing: true` until the collections migration has been run. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const list = await adminCollections();
  return Response.json({ collections: list ?? [], missing: list === null });
}

/** A new collection: { slug, title_bn, title_en?, intro_bn?, status, places: [{ story_id, note_bn? }] }. */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const parsed = CollectionInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid collection" }, { status: 400 });
  try {
    return Response.json({ id: await saveCollection(null, parsed.data) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
