import { reportStory } from "@/lib/db";

/** "ভুল জানান": a visitor reports a mistake in a saved story. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { id?: unknown; message?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || message.length < 3) {
    return Response.json({ error: "কী ভুল, একটু লিখে জানান।" }, { status: 400 });
  }
  try {
    await reportStory(id, message);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "পাঠানো যায়নি, একটু পরে আবার চেষ্টা করুন।" }, { status: 500 });
  }
}
