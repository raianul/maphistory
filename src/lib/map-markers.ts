// Client-only: the map's markers, drawn in the shape of the logo's pin (without its "&").

import { PIN_PATH } from "./logo";

/** The logo pin's box (MARK_VIEWBOX) and where its round head's centre is, as a share of its height from the top. */
const PIN_W = 48;
const PIN_H = 60;
export const HEAD_Y = 22 / 60;

/**
 * A pin `width` CSS px wide, as image data for map.addImage (drawn at `ratio` for sharp screens):
 * filled with `fill`, outlined with `stroke`, and a small white dot in its head when `dot`.
 */
export function pinImage({ width, fill, stroke, strokeWidth, dot, ratio = 2 }: { width: number; fill: string; stroke: string; strokeWidth: number; dot?: string; ratio?: number }) {
  const pad = strokeWidth + 2;
  const s = (width / PIN_W) * ratio;
  const w = Math.ceil(PIN_W * s + pad * 2 * ratio);
  const h = Math.ceil(PIN_H * s + pad * 2 * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(pad * ratio, pad * ratio);
  ctx.scale(s, s);
  const pin = new Path2D(PIN_PATH);
  // A soft shadow under it, so pins read on any part of the map.
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 3 / s * ratio;
  ctx.shadowOffsetY = 1 / s * ratio;
  ctx.fillStyle = fill;
  ctx.fill(pin);
  ctx.shadowColor = "transparent";
  ctx.lineWidth = (strokeWidth * ratio) / s;
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke;
  ctx.stroke(pin);
  if (dot) {
    ctx.beginPath();
    ctx.arc(24, 22, 7, 0, Math.PI * 2);
    ctx.fillStyle = dot;
    ctx.fill();
  }
  return { image: ctx.getImageData(0, 0, w, h), pixelRatio: ratio, height: h / ratio };
}

/**
 * A dark rounded label that stretches around its text (icon-text-fit), for an event's year on the
 * map: image data for map.addImage, with its stretchable middle and content box.
 */
export function pillImage({ fill, ratio = 2 }: { fill: string; ratio?: number }) {
  const r = 6 * ratio;
  const size = r * 2 + 4 * ratio;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, r);
  ctx.fill();
  const mid: [number, number] = [r, size - r];
  return {
    image: ctx.getImageData(0, 0, size, size),
    options: { pixelRatio: ratio, stretchX: [mid], stretchY: [mid], content: [r, r, size - r, size - r] as [number, number, number, number] },
  };
}
