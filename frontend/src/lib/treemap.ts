/** Squarified treemap layout (Bruls, Huizing, van Wijk). */

export interface TreemapItem {
  key: string;
  value: number;
}

export interface TreemapRect {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Sized {
  key: string;
  area: number;
}

function worst(row: Sized[], side: number): number {
  const sum = row.reduce((s, r) => s + r.area, 0);
  const max = Math.max(...row.map((r) => r.area));
  const min = Math.min(...row.map((r) => r.area));
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

function placeRow(row: Sized[], box: Box, out: TreemapRect[]): Box {
  const sum = row.reduce((s, r) => s + r.area, 0);
  if (box.w >= box.h) {
    const colW = sum / box.h;
    let y = box.y;
    for (const r of row) {
      const h = r.area / colW;
      out.push({ key: r.key, x: box.x, y, w: colW, h });
      y += h;
    }
    return { x: box.x + colW, y: box.y, w: box.w - colW, h: box.h };
  }
  const rowH = sum / box.w;
  let x = box.x;
  for (const r of row) {
    const w = r.area / rowH;
    out.push({ key: r.key, x, y: box.y, w, h: rowH });
    x += w;
  }
  return { x: box.x, y: box.y + rowH, w: box.w, h: box.h - rowH };
}

/** Lay items out in a width x height box; returns rects in the same units. */
export function squarify(items: TreemapItem[], width: number, height: number): TreemapRect[] {
  const positive = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = positive.reduce((s, i) => s + i.value, 0);
  if (!total || width <= 0 || height <= 0) return [];
  const scale = (width * height) / total;
  const queue: Sized[] = positive.map((i) => ({ key: i.key, area: i.value * scale }));
  const out: TreemapRect[] = [];
  let box: Box = { x: 0, y: 0, w: width, h: height };
  let row: Sized[] = [];
  while (queue.length) {
    const side = Math.min(box.w, box.h);
    const next = queue[0];
    if (!row.length || worst([...row, next], side) <= worst(row, side)) {
      row.push(next);
      queue.shift();
    } else {
      box = placeRow(row, box, out);
      row = [];
    }
  }
  if (row.length) placeRow(row, box, out);
  return out;
}
