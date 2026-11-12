// SPDX-License-Identifier: AGPL-3.0-or-later
export const WIDTH = 1080, HEIGHT = 1350;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Cover geometry in canonical poster coordinates. Never changes the chosen focal point. */
export function fit(width, height, boxWidth, boxHeight, focal) {
  const scale = Math.max(boxWidth / width, boxHeight / height) * focal.zoom;
  const w = width * scale, h = height * scale;
  return { x: clamp(boxWidth / 2 - focal.x * w, boxWidth - w, 0),
    y: clamp(boxHeight / 2 - focal.y * h, boxHeight - h, 0), w, h };
}
export function circleRect(state) {
  const d = WIDTH * state.size / 100;
  return { x: WIDTH * state.x / 100 - d / 2, y: HEIGHT * state.y / 100 - d / 2, w: d, h: d };
}
export function sourcePoint(x, y, rect, source) {
  return { x: (x - rect.x) / rect.w * source.width, y: (y - rect.y) / rect.h * source.height };
}
export function cropTags(state) {
  const b = state.background.focal, c = state.circle.focal;
  const base = f => `${Math.round(f.x * 100)},${Math.round(f.y * 100)},${f.zoom.toFixed(2)}`;
  return { background: `[b:${base(b)}]`, circle: `[c:${base(c)},${state.layout.size},${Math.round(state.layout.x)},${Math.round(state.layout.y)},${+state.pop},${state.popHeight}]` };
}
