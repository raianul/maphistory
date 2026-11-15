import { friendlyError, generatePlace } from "@/lib/ai/generate";
import type { StoryTarget } from "@/lib/ai/place-story";
import type { AiPlace } from "@/lib/ai/types";
import { checkLimits, countView, findStory, listVideos, logGeneration, saveStory, visitorId } from "@/lib/db";
import { reverseGeocode } from "@/lib/sources/reverse-geocode";

/*
 * The story of any place clicked on the map. A saved story (Supabase) is
 * served at once; otherwise Gemini writes it, STREAMED to the panel as it is
 * written, and it is saved for every later visitor. New stories are limited
 * per visitor and per day (see checkLimits), so the AI quota can't be drained.
 * The response is newline-delimited JSON events:
 *   {"type":"delta","text":"…"}   a new piece of the story JSON
 *   {"type":"image","image":{…}}  the photo, as soon as it is found
 *   {"type":"done","place":{…}}   the final story (saved: with id and status)
 *   {"type":"error","message":"…"}
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<StoryTarget> | null;
  const name = body?.name?.trim();
  if (!name || typeof body?.lat !== "number" || typeof body?.lng !== "number") {
    return Response.json({ error: "name, lat and lng are required" }, { status: 400 });
  }
  const target: StoryTarget = {
    name,
    lat: body.lat,
    lng: body.lng,
    kind: typeof body.kind === "string" ? body.kind.slice(0, 40) : undefined,
    nearby: Array.isArray(body.nearby) ? body.nearby.filter((n) => typeof n === "string").slice(0, 8) : undefined,
  };
  const encoder = new TextEncoder();
  const visitor = visitorId(req);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // the browser has gone away; nothing to send to
        }
      };
      try {
        // Where is this, really? (country, region, city from the coordinates.) Looked up in
        // parallel with the saved-story check, so a new story doesn't wait for it.
        const context = reverseGeocode(target.lat, target.lng);
        // Already written for an earlier visitor? Serve it. (If the database is down, carry on
        // and generate: the visitor still gets a story, it just isn't saved.)
        const saved = await findStory(target).catch((e) => {
          console.error(e);
          return undefined;
        });
        if (saved) {
          // A request the browser already cancelled (React's dev double-run) is not a view.
          if (req.signal.aborted) return;
          if (saved.status === "hidden") {
            send({ type: "error", message: "এই জায়গার গল্প এখন দেখানো হচ্ছে না।" });
            return;
          }
          // Videos are kept apart from the story: added here for the panel to show first.
          const videos = await listVideos(saved.id);
          send({ type: "done", place: videos.length ? { ...saved, videos } : saved });
          countView(saved.id).catch(() => {});
          return;
        }
        // The browser cancels a request it no longer needs (another click, React's dev double-run).
        if (req.signal.aborted) return;

        const limited = await checkLimits(visitor).catch(() => undefined);
        if (limited) {
          send({ type: "error", message: limited });
          return;
        }

        target.context = await context;
        let place: AiPlace = await generatePlace(target, {
          signal: req.signal,
          onDelta: (text) => send({ type: "delta", text }),
          onImage: (image) => send({ type: "image", image }),
        });
        try {
          place = await saveStory(target, place);
          await logGeneration(visitor, `${name}@${target.lat.toFixed(3)},${target.lng.toFixed(3)}`);
        } catch (e) {
          console.error(e); // shown anyway, just not saved
        }
        send({ type: "done", place });
      } catch (e) {
        if (!req.signal.aborted) send({ type: "error", message: friendlyError(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
