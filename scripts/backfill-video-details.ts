/**
 * Fills in the upload date and length of YouTube videos added before these were saved (search
 * engines show them with the video). Reads each video's public YouTube page. Safe to run again.
 *
 *   tsx --env-file=.env.local scripts/backfill-video-details.ts            # preview, nothing saved
 *   tsx --env-file=.env.local scripts/backfill-video-details.ts --write    # save
 */
import { db, refreshPlacePage } from "../src/lib/db";
import { fetchYouTubeDetails } from "../src/lib/sources/video-oembed";

const write = process.argv.includes("--write");

async function main() {
  const { data, error } = await db()
    .from("place_videos")
    .select("id, story_id, provider_video_id, video_title, published_at, duration_seconds")
    .eq("video_provider", "youtube")
    .or("published_at.is.null,duration_seconds.is.null");
  if (error) throw new Error(error.message);
  let saved = 0;
  for (const v of data ?? []) {
    const d = await fetchYouTubeDetails(v.provider_video_id);
    const patch = {
      ...(!v.published_at && d?.publishedAt ? { published_at: d.publishedAt } : {}),
      ...(!v.duration_seconds && d?.durationSeconds ? { duration_seconds: d.durationSeconds } : {}),
    };
    console.log(`  ${v.provider_video_id}  ${JSON.stringify(patch)}  ${v.video_title}`);
    if (!write || !Object.keys(patch).length) continue;
    const { error: e } = await db().from("place_videos").update(patch).eq("id", v.id);
    if (e) throw new Error(`${v.provider_video_id}: ${e.message}`);
    await refreshPlacePage(v.story_id).catch(() => {});
    saved++;
  }
  console.log(write ? `\n${saved} video(s) updated.` : `\n${data?.length ?? 0} video(s) to fill. Preview only: run with --write to save.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
