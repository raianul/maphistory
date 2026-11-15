import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CONTENT_DIR } from "@/lib/content";

// Serves images straight from content/ so drafts show their photos before a build.
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", svg: "image/svg+xml" };

export async function GET(_: Request, { params }: RouteContext<"/admin/media/[slug]/[file]">) {
  if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });
  const { slug, file } = await params;
  if (!/^[a-z0-9-]+$/.test(slug) || !/^[\w.-]+$/.test(file)) return new Response("Bad request", { status: 400 });
  const path = join(CONTENT_DIR, slug, "images", file);
  if (!existsSync(path)) return new Response("Not found", { status: 404 });
  const type = TYPES[file.split(".").pop()!.toLowerCase()] ?? "application/octet-stream";
  return new Response(new Uint8Array(await readFile(path)), { headers: { "Content-Type": type } });
}
