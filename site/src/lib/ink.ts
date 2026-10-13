// Tiny "ink pen" geometry helpers. Everything is deterministic (seeded), so the
// same drawing renders identically on every build. Paths are smoothed with
// Catmull-Rom curves and get a slight wobble so they read as hand-drawn.

type Pt = [number, number];

export function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const f = (n: number) => Math.round(n * 10) / 10;

/** Smooth path through points (Catmull-Rom → cubic Bézier). */
export function smooth(pts: Pt[]): string {
  if (pts.length < 2) return '';
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

/** Points along a slightly bowed, jittered straight stroke. */
function linePts(x1: number, y1: number, x2: number, y2: number, seed = 1, wobble = 1.6): Pt[] {
  const r = rng(seed);
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const n = Math.max(2, Math.round(len / 70));
  const nx = -(y2 - y1) / len;
  const ny = (x2 - x1) / len;
  const bow = (r() - 0.5) * wobble * 2.2;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const end = i === 0 || i === n;
    const j = end ? (r() - 0.5) * wobble * 0.6 : (r() - 0.5) * wobble;
    const o = Math.sin(Math.PI * t) * bow + j;
    pts.push([x1 + (x2 - x1) * t + nx * o, y1 + (y2 - y1) * t + ny * o]);
  }
  return pts;
}

export function line(x1: number, y1: number, x2: number, y2: number, seed = 1, wobble = 1.6) {
  return smooth(linePts(x1, y1, x2, y2, seed, wobble));
}

/** A hand-drawn box: one continuous stroke that overshoots where it closes. */
export function rect(x: number, y: number, w: number, h: number, seed = 1, wobble = 1.8) {
  const r = rng(seed);
  const j = () => (r() - 0.5) * wobble * 2;
  // One continuous stroke (so it draws like a pen), corners slightly loose,
  // finishing with a small overshoot past the starting corner.
  const c: Pt[] = [
    [x + j(), y + j()],
    [x + w + j(), y + j()],
    [x + w + j(), y + h + j()],
    [x + j(), y + h + j()],
  ];
  const pts: Pt[] = [];
  for (let s = 0; s < 4; s++) {
    const a = c[s];
    const b = c[(s + 1) % 4];
    const seg = linePts(a[0], a[1], b[0], b[1], seed + s + 1, wobble);
    pts.push(...(s === 0 ? seg : seg.slice(1)));
  }
  // overshoot along the top edge
  const o = 6 + r() * 8;
  pts.push([c[0][0] + o, c[0][1] + (r() - 0.5) * wobble * 2]);
  return smooth(pts);
}

/** A marker loop: an ellipse that goes round ~1.1 times, like circling something. */
export function loop(cx: number, cy: number, rx: number, ry: number, seed = 1, turns = 1.12) {
  const r = rng(seed);
  const pts: Pt[] = [];
  const steps = 26;
  const start = -Math.PI * 0.85 + (r() - 0.5) * 0.4;
  for (let i = 0; i <= steps; i++) {
    const t = start + (i / steps) * Math.PI * 2 * turns;
    const k = 1 + (r() - 0.5) * 0.07 + (i / steps) * 0.06;
    pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]);
  }
  return smooth(pts);
}

/** Curved arrow through points, with an open two-stroke head at the end. */
export function arrow(pts: Pt[], seed = 1, head = 12) {
  const r = rng(seed);
  const jittered = pts.map((p, i) =>
    i === 0 || i === pts.length - 1 ? p : ([p[0] + (r() - 0.5) * 3, p[1] + (r() - 0.5) * 3] as Pt),
  );
  const shaft = smooth(jittered);
  const [tx, ty] = jittered[jittered.length - 1];
  const [px, py] = jittered[jittered.length - 2];
  const a = Math.atan2(ty - py, tx - px);
  const spread = 0.5 + r() * 0.12;
  const h1: Pt = [tx - Math.cos(a - spread) * head, ty - Math.sin(a - spread) * head];
  const h2: Pt = [tx - Math.cos(a + spread) * head * 0.92, ty - Math.sin(a + spread) * head * 0.92];
  const headPath = `M${f(h1[0])} ${f(h1[1])} L${f(tx)} ${f(ty)} L${f(h2[0])} ${f(h2[1])}`;
  return { shaft, head: headPath };
}

/** Back-and-forth scribble fill (for a "scribbled-in" shape or stamp). */
export function scribble(x: number, y: number, w: number, h: number, seed = 1, gap = 7) {
  const r = rng(seed);
  const pts: Pt[] = [];
  const rows = Math.max(2, Math.floor(h / gap));
  for (let i = 0; i <= rows; i++) {
    const yy = y + (i / rows) * h;
    const left = x + r() * 4;
    const right = x + w - r() * 4;
    pts.push(i % 2 === 0 ? [left, yy] : [right, yy + gap * 0.4]);
  }
  return smooth(pts);
}

/** A wavy underline swoosh. */
export function swoosh(x: number, y: number, w: number, seed = 1, amp = 3) {
  const r = rng(seed);
  const pts: Pt[] = [];
  const n = Math.max(3, Math.round(w / 40));
  for (let i = 0; i <= n; i++) {
    pts.push([x + (w * i) / n, y + Math.sin(i * 1.3 + r()) * amp * (0.6 + r() * 0.5) - (i / n) * amp]);
  }
  return smooth(pts);
}
