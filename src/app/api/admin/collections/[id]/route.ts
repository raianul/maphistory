import { requireAdmin } from "@/lib/admin-auth";
import { CollectionInput, deleteCollection, saveCollection } from "@/lib/collections";

/** Saves a collection: the same body as creating one; its places are replaced in the order given. */
export async function PUT(req: Request, { params }: RouteContext<"/api/admin/collections/[id]">) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const parsed = CollectionInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid collection" }, { status: 400 });
  try {
    return Response.json({ id: await saveCollection(id, parsed.data) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: RouteContext<"/api/admin/collections/[id]">) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { id } = await params;
  try {
    await deleteCollection(id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
