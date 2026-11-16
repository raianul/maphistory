import { listMapPins } from "@/lib/db";
import { inRegion } from "@/lib/region";
import { isValidTile, PIN_TILE_ZOOM, tileBounds } from "@/lib/tiles";

/**
 * The map pins in one square of the world: /api/pins/10/769/442 (zoom/column/row, the standard web
 * map tile address). The map asks only for the squares on screen, and everyone looking at the same
 * area asks for the same squares, so answers are cached: briefly in the browser, a few minutes at
 * the CDN, and served stale while refreshing so nobody waits. A pin switched on or off in the admin
 * shows up within about a minute.
 */
export async function GET(_req: Request, { params }: RouteContext<"/api/pins/[z]/[x]/[y]">) {
  const p = await params;
  const tile = { z: Number(p.z), x: Number(p.x), y: Number(p.y.replace(/\.json$/, "")) };
  // Only the one zoom pins are cut at: every other address would be a cache miss for nothing.
  if (!isValidTile(tile) || tile.z !== PIN_TILE_ZOOM) {
    return Response.json({ error: `Tiles are zoom ${PIN_TILE_ZOOM} only: /api/pins/${PIN_TILE_ZOOM}/x/y` }, { status: 400 });
  }
  try {
    // Bangladesh-only mode: pins elsewhere stay in the database but aren't shown.
    const pins = (await listMapPins(tileBounds(tile))).filter((p) => inRegion(p.lat, p.lng));
    return Response.json(
      { tile: `${tile.z}/${tile.x}/${tile.y}`, pins },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=600" } },
    );
  } catch (e) {
    console.error(e);
    // Not cached: the next visitor tries again.
    return Response.json({ error: "Pins are unavailable right now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
