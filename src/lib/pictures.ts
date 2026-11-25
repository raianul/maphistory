// Client-safe: picture addresses at the size a small card needs.

/**
 * A hover-preview-sized picture: Commons at 500 px (a standard thumbnail width; originals can be
 * many MB), YouTube's medium still. Commons tracking parameters are dropped.
 */
export function smallPicture(src: string | null | undefined): string | undefined {
  if (!src) return undefined;
  const url = src.split("?")[0];
  const commons = url.match(/^https:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/(\w+)\/(?:thumb\/)?([0-9a-f]\/[0-9a-f]{2})\/([^/]+)/);
  if (commons) {
    const [, wiki, dir, file] = commons;
    // Only photos have a same-format thumbnail; anything else stays as it was.
    if (!/\.(jpe?g|png|webp)$/i.test(file)) return url;
    return `https://upload.wikimedia.org/wikipedia/${wiki}/thumb/${dir}/${file}/500px-${file}`;
  }
  if (/(ytimg|youtube)\.com\/vi\//.test(url)) return url.replace(/\/(hq|sd|maxres)default\.jpg$/, "/mqdefault.jpg");
  return url;
}
