import { onThemeChange, tokenRGB } from '../components/fx/theme';

// Peelable taped portrait (components/fx/PeelPortrait.astro).
// A photo print is stiff, glossy card, so a pulled corner doesn't crease flat or ripple:
// it rolls up in ONE smooth cylinder, axis along the lift line, and the rest of the lifted
// part rides on top of the roll as a flat, plain off-white back. The standard page-curl
// mapping (cylinder of radius R from the lift line):
//   s = distance of a point past the lift line L, measured toward the pulled corner
//   s in [0, πR]   wraps the roll; seen from above it sits at R·sin(s/R) past L.
//                  Only s >= πR/2 (the back, turned up) is visible; it's drawn as thin
//                  shaded facets lit by the desk lamp (top left), brightest along the crest.
//   s > πR         the flat back, lying back over the photo at πR − s.
// The corner tip lands under the pointer, which fixes L and R. Shadows: a tight contact
// shadow where the print leaves the page, and a softer, offset one under the raised back.
// The taped top edge never moves (the drag is limited well short of it). Let go and it
// snaps back down with one small, stiff settle. All in an SVG overlay + one clip-path.

type Pt = { x: number; y: number };
type Corner = 'r' | 'l';

const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;

/** Clip a convex polygon to the half-plane side(X) <= 0 (Sutherland-Hodgman, one edge). */
function clipHalf(poly: Pt[], side: (p: Pt) => number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}
const poly = (pts: Pt[]) => `polygon(${pts.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(',')})`;

export function initPeel(root: HTMLElement): () => void {
  const fig = root.querySelector<HTMLElement>('.taped');
  const drift = root.querySelector<HTMLElement>('.taped__drift');
  const photo = root.querySelector<HTMLElement>('.taped__photo');
  if (!fig || !drift || !photo) return () => {};
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---- build the extra layers (all decorative) ----
  const under = document.createElement('div');
  under.className = 'peel-under';
  under.setAttribute('aria-hidden', 'true');
  under.innerHTML = '<span class="r">hi!</span><span class="l">oh, hello</span>';
  const NS = 'http://www.w3.org/2000/svg';
  const flap = document.createElementNS(NS, 'svg');
  flap.setAttribute('class', 'peel-flap');
  flap.setAttribute('aria-hidden', 'true');
  flap.innerHTML =
    '<defs><filter id="peel-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>' +
    '<filter id="peel-tight" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.2"/></filter>' +
    '<linearGradient id="peel-roll-g" gradientUnits="userSpaceOnUse"></linearGradient></defs>' +
    '<path class="peel-shade-soft" filter="url(#peel-soft)"/><path class="peel-shade-tight" filter="url(#peel-tight)"/>' +
    '<g class="peel-mouth"></g><g class="peel-roll" fill="url(#peel-roll-g)"></g><path class="peel-back"/>';
  const softShade = flap.querySelector<SVGPathElement>('.peel-shade-soft')!;
  const tightShade = flap.querySelector<SVGPathElement>('.peel-shade-tight')!;
  const backEl = flap.querySelector<SVGPathElement>('.peel-back')!;
  const rollG = flap.querySelector<SVGGElement>('.peel-roll')!;
  const mouthG = flap.querySelector<SVGGElement>('.peel-mouth')!;
  const grad = flap.querySelector<SVGLinearGradientElement>('#peel-roll-g')!;
  // the roll's shape is drawn as thin slices (the s → R·sin(s/R) squash isn't linear);
  // one gradient paints all of them, so there are no bands
  const SLICES = 12;
  const facets = Array.from({ length: SLICES }, () => rollG.appendChild(document.createElementNS(NS, 'path')));
  const mouths = Array.from({ length: 6 }, () => mouthG.appendChild(document.createElementNS(NS, 'path')));
  const STOPS = [0, 0.15, 0.3, 0.45, 0.6, 0.72, 0.84, 0.93, 1];
  const stopEls = STOPS.map((t) => {
    const st = document.createElementNS(NS, 'stop');
    st.setAttribute('offset', String(t));
    grad.appendChild(st);
    return st;
  });
  // back of the print: the print's own paper colour (dimmed in dark mode), read from the tokens
  let paper: [number, number, number] = [0.97, 0.96, 0.93];
  const readPaper = () => { paper = tokenRGB('--card', paper); };
  readPaper();
  const offTheme = onThemeChange(() => { readPaper(); render(); });
  const grips = (['r', 'l'] as Corner[]).map((c) => {
    const g = document.createElement('div');
    g.className = `peel-grip ${c}`;
    g.dataset.corner = c;
    g.setAttribute('aria-hidden', 'true');
    return g;
  });
  drift.prepend(under);
  drift.append(flap, ...grips);
  root.classList.add('is-live');

  // ---- state ----
  let W = drift.offsetWidth;
  let H = drift.offsetHeight;
  let corner: Corner = 'r';
  const C = () => ({ x: corner === 'r' ? W : 0, y: H });
  const P = { x: W, y: H, vx: 0, vy: 0 };
  const T = { x: W, y: H };
  let mode: 'rest' | 'drag' = 'rest';
  let raf = 0;
  let last = 0;
  let dragId = -1;
  let grab: Pt = { x: 0, y: 0 };

  const toLocal = (cx: number, cy: number): Pt => {
    const r = drift.getBoundingClientRect();
    const tilt = (parseFloat(getComputedStyle(fig).getPropertyValue('--tilt')) || 0) * (Math.PI / 180);
    const vx = cx - (r.left + r.width / 2);
    const vy = cy - (r.top + r.height / 2);
    const cos = Math.cos(tilt), sin = Math.sin(tilt);
    return { x: vx * cos + vy * sin + W / 2, y: -vx * sin + vy * cos + H / 2 };
  };

  /** Where the corner may go: inside the print, at most ~60% of its short side away, with a rubber band. */
  const limit = (p: Pt, soft: number): Pt => {
    const c = C();
    let x = Math.max(0, Math.min(W, p.x));
    let y = Math.max(0, Math.min(H, p.y));
    let dx = x - c.x, dy = y - c.y;
    const d = Math.hypot(dx, dy);
    const max = Math.min(W, H) * soft;
    if (d > max * 0.6) {
      const k = (max * 0.6 + (max * 0.4) * (1 - Math.exp(-(d - max * 0.6) / (max * 0.4)))) / d;
      dx *= k;
      dy *= k;
    }
    return { x: c.x + dx, y: c.y + dy };
  };

  const pathOf = (pts: Pt[]) => (pts.length < 3 ? '' : `M${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')}Z`);
  // the lamp: up and to the left of the desk, fairly high
  const LIGHT = (() => { const v = { x: -0.42, y: -0.5, z: 0.76 }; const l = Math.hypot(v.x, v.y, v.z); return { x: v.x / l, y: v.y / l, z: v.z / l }; })();
  const rgb = (k: number, spec: number) =>
    `rgb(${paper.map((c) => Math.round(Math.min(1, c * k + spec) * 255)).join(' ')})`;

  const render = () => {
    const c = C();
    // overshoot past the corner on the spring-back: nothing is lifted
    const p = { x: Math.max(0, Math.min(W, P.x)), y: Math.max(0, Math.min(H, P.y)) };
    const D = Math.hypot(c.x - p.x, c.y - p.y);
    if (D < 0.8) {
      photo.style.clipPath = '';
      flap.style.visibility = 'hidden';
      root.classList.remove('is-peeling');
      return;
    }
    root.classList.add('is-peeling');
    const n = { x: (c.x - p.x) / D, y: (c.y - p.y) / D }; // from the tip toward the corner's home
    // stiff card: one smooth roll. The radius grows with the pull, but stays small enough
    // that most of the lifted corner lies flat on top (a big roll reads as a tube).
    const R = Math.min(Math.min(W, H) * 0.07, D * 0.15);
    const piR = Math.PI * R;
    const sc = (D + piR) / 2; // how far the corner is (along the paper) past the lift line
    const L0 = { x: c.x - sc * n.x, y: c.y - sc * n.y };
    const sOf = (X: Pt) => dot({ x: X.x - L0.x, y: X.y - L0.y }, n);
    const rect: Pt[] = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
    const e = 60;
    photo.style.clipPath = poly(clipHalf([{ x: -e, y: -e }, { x: W + e, y: -e }, { x: W + e, y: H + e }, { x: -e, y: H + e }], sOf));
    const lifted = clipHalf(rect, (X) => -sOf(X)); // s >= 0
    const band = (a: number, b: number) => clipHalf(clipHalf(lifted, (X) => a - sOf(X)), (X) => sOf(X) - b);
    const move = (pts: Pt[], f: (s: number) => number) =>
      pts.map((X) => { const sv = sOf(X); const d = f(sv) - sv; return { x: X.x + d * n.x, y: X.y + d * n.y }; });
    const onRoll = (sv: number) => R * Math.sin(Math.min(sv, piR) / R);

    // the flat back, lying over the photo: plain paper, lit from above
    const back = move(band(piR, Infinity), (sv) => piR - sv);
    backEl.setAttribute('d', pathOf(back));
    backEl.setAttribute('fill', rgb(0.94, 0.02));

    // the roll's top (its back, turned up): one gradient from the top of the roll (at the
    // lift line, facing up) out to the crest (edge-on), lit by the lamp, with a specular
    // line where the curve faces between lamp and eye
    const ln = LIGHT.x * n.x + LIGHT.y * n.y;
    const hn = ln, hz = LIGHT.z + 1;
    const hl = Math.hypot(hn, hz);
    STOPS.forEach((t, i) => {
      const phi = Math.PI - Math.asin(Math.min(1, t)); // t = distance from the lift line / R
      const nx = Math.sin(phi), nz = -Math.cos(phi);
      const diff = Math.max(0, nx * ln + nz * LIGHT.z);
      const spec = Math.pow(Math.max(0, (nx * hn + nz * hz) / hl), 60) * 0.4;
      stopEls[i].setAttribute('stop-color', rgb(0.74 + 0.26 * diff, spec));
    });
    grad.setAttribute('x1', L0.x.toFixed(1));
    grad.setAttribute('y1', L0.y.toFixed(1));
    grad.setAttribute('x2', (L0.x + R * n.x).toFixed(1));
    grad.setAttribute('y2', (L0.y + R * n.y).toFixed(1));
    for (let k = 0; k < SLICES; k++) {
      const a = piR / 2 + (k * piR) / 2 / SLICES;
      const b = piR / 2 + ((k + 1) * piR) / 2 / SLICES + 0.5;
      facets[k].setAttribute('d', pathOf(move(band(a, b), onRoll)));
    }
    // where the roll's top is narrower than its foot you look into the curl: shadowed inside
    for (let k = 0; k < mouths.length; k++) {
      const a = (k * piR) / 2 / mouths.length;
      const b = ((k + 1) * piR) / 2 / mouths.length + 0.5;
      mouths[k].setAttribute('d', pathOf(move(band(a, b), onRoll)));
    }
    // shadows: tight along the lift line (the print is still touching there), soft and
    // offset under the raised back, which sits a roll's height above the page
    tightShade.setAttribute('d', pathOf(move(band(0, piR), (sv) => Math.min(R * 1.15, onRoll(sv) + 2))));
    softShade.setAttribute('d', pathOf(back));
    softShade.setAttribute('transform', `translate(${(1 + R * 0.15).toFixed(1)} ${(2 + R * 0.3).toFixed(1)})`);
    flap.style.visibility = 'visible';
  };

  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min(0.04, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    // drag: stiff and quick; let go: card snaps back down with one small, stiff settle
    const stiff = mode === 'drag' ? 900 : 720;
    const zeta = mode === 'rest' ? 0.62 : 0.85;
    const damp = 2 * zeta * Math.sqrt(stiff);
    // small fixed substeps: a stiff spring stays stable however slow the frames are
    const steps = Math.ceil(dt / 0.008);
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      P.vx += ((T.x - P.x) * stiff - P.vx * damp) * h;
      P.vy += ((T.y - P.y) * stiff - P.vy * damp) * h;
      P.x += P.vx * h;
      P.y += P.vy * h;
    }
    render();
    const moving = Math.abs(T.x - P.x) + Math.abs(T.y - P.y) > 0.3 || Math.abs(P.vx) + Math.abs(P.vy) > 2;
    if (moving) raf = requestAnimationFrame(frame);
    else {
      P.x = T.x; P.y = T.y; P.vx = P.vy = 0;
      render();
      last = 0;
    }
  };
  const kick = () => {
    if (reduce.matches) {
      P.x = T.x; P.y = T.y; P.vx = P.vy = 0;
      render();
      return;
    }
    if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
  };
  const home = () => {
    mode = 'rest';
    const c = C();
    T.x = c.x;
    T.y = c.y;
    kick();
  };
  const setCorner = (c: Corner) => {
    if (c === corner) return;
    // only switch corners while the print is flat
    if (Math.hypot(P.x - C().x, P.y - C().y) > 1) return;
    corner = c;
    const cc = C();
    P.x = T.x = cc.x;
    P.y = T.y = cc.y;
  };

  // ---- input ----
  const ac = new AbortController();
  const sig = { signal: ac.signal };
  grips.forEach((g) => {
    const c = g.dataset.corner as Corner;
    g.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setCorner(c);
      if (c !== corner) return;
      W = drift.offsetWidth;
      H = drift.offsetHeight;
      mode = 'drag';
      dragId = e.pointerId;
      g.setPointerCapture(e.pointerId);
      root.classList.add('is-dragging');
      // the corner follows the pull, not the press: grabbing it doesn't make it jump
      grab = toLocal(e.clientX, e.clientY);
    }, sig);
    g.addEventListener('pointermove', (e) => {
      if (mode !== 'drag' || e.pointerId !== dragId) return;
      const now = toLocal(e.clientX, e.clientY);
      const cc = C();
      const p = limit({ x: cc.x + now.x - grab.x, y: cc.y + now.y - grab.y }, 0.62);
      T.x = p.x;
      T.y = p.y;
      kick();
    }, sig);
    const end = (e: PointerEvent) => {
      if (e.pointerId !== dragId) return;
      dragId = -1;
      root.classList.remove('is-dragging');
      home();
    };
    g.addEventListener('pointerup', end, sig);
    g.addEventListener('pointercancel', end, sig);
    g.addEventListener('lostpointercapture', end, sig);
  });

  const ro = new ResizeObserver(() => {
    W = drift.offsetWidth;
    H = drift.offsetHeight;
    if (mode !== 'drag') { const c = C(); P.x = T.x = c.x; P.y = T.y = c.y; render(); }
  });
  ro.observe(drift);

  return () => {
    ac.abort();
    offTheme();
    ro.disconnect();
    cancelAnimationFrame(raf);
    under.remove();
    flap.remove();
    grips.forEach((g) => g.remove());
    photo.style.clipPath = '';
    root.classList.remove('is-live', 'is-dragging', 'is-peeling');
  };
}
