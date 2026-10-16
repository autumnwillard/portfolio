// Peelable taped portrait (components/fx/PeelPortrait.astro).
// Geometry, in the photo's own (unrotated) box W x H:
//   the grabbed corner C is pulled to P. The fold line is the perpendicular bisector of
//   C-P (through M, normal n). The photo keeps the half-plane dot(X-M, n) <= 0; the other
//   half is mirrored across the fold (a CSS reflection matrix) and shown as the back of
//   the print, shaded like a curl and casting a drop shadow. A spring brings it home.

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
  const fineHover = window.matchMedia('(hover: hover) and (pointer: fine)');

  // ---- build the extra layers (all decorative) ----
  const under = document.createElement('div');
  under.className = 'peel-under';
  under.setAttribute('aria-hidden', 'true');
  under.innerHTML = '<span class="r">hi!</span><span class="l">oh, hello</span>';
  const flap = document.createElement('div');
  flap.className = 'peel-flap';
  flap.setAttribute('aria-hidden', 'true');
  const face = document.createElement('div');
  face.className = 'peel-flap__face';
  flap.append(face);
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
  let mode: 'rest' | 'hover' | 'drag' = 'rest';
  let raf = 0;
  let last = 0;
  let dragId = -1;

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

  const render = () => {
    const c = C();
    const raw = { x: P.x, y: P.y };
    // overshoot past the corner on the spring-back: nothing is folded
    const p = { x: Math.max(0, Math.min(W, raw.x)), y: Math.max(0, Math.min(H, raw.y)) };
    const len = Math.hypot(c.x - p.x, c.y - p.y);
    if (len < 0.8) {
      photo.style.clipPath = '';
      flap.style.visibility = 'hidden';
      return;
    }
    const n = { x: (c.x - p.x) / len, y: (c.y - p.y) / len };
    const M = { x: (c.x + p.x) / 2, y: (c.y + p.y) / 2 };
    const side = (X: Pt) => dot({ x: X.x - M.x, y: X.y - M.y }, n);
    const e = 60;
    photo.style.clipPath = poly(clipHalf([{ x: -e, y: -e }, { x: W + e, y: -e }, { x: W + e, y: H + e }, { x: -e, y: H + e }], side));
    const flapPts = clipHalf([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], (X) => -side(X));
    // mirror across the fold: X' = X - 2((X.n) - k) n
    const k = dot(M, n);
    const a = 1 - 2 * n.x * n.x, b = -2 * n.x * n.y, d = 1 - 2 * n.y * n.y;
    face.style.transform = `matrix(${a},${b},${b},${d},${2 * k * n.x},${2 * k * n.y})`;
    face.style.clipPath = poly(flapPts);
    // the back of the print: a crease shadow at the fold, brightest where it curls up
    const ang = Math.atan2(n.x, -n.y);
    const L = Math.abs(W * Math.sin(ang)) + Math.abs(H * Math.cos(ang));
    const S = { x: W / 2 - (n.x * L) / 2, y: H / 2 - (n.y * L) / 2 };
    const f0 = dot({ x: M.x - S.x, y: M.y - S.y }, n);
    const half = len / 2;
    face.style.background = `linear-gradient(${(ang * 180) / Math.PI}deg,
      color-mix(in srgb, rgb(var(--shadow, 60 50 40)) 30%, var(--card, var(--paper-scrap))) ${f0.toFixed(1)}px,
      color-mix(in srgb, rgb(var(--shadow, 60 50 40)) 10%, var(--card, var(--paper-scrap))) ${(f0 + 3).toFixed(1)}px,
      var(--card, var(--paper-scrap)) ${(f0 + Math.max(8, half * 0.35)).toFixed(1)}px,
      var(--card, var(--paper-scrap)) ${(f0 + half * 0.6).toFixed(1)}px,
      color-mix(in srgb, rgb(var(--shadow, 60 50 40)) 9%, var(--card, var(--paper-scrap))) ${(f0 + half + 2).toFixed(1)}px)`;
    flap.style.visibility = 'visible';
  };

  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min(0.04, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    // drag: stiff and quick; let go: a springy paper flutter back down
    const stiff = mode === 'drag' ? 900 : mode === 'hover' ? 320 : 240;
    const zeta = mode === 'rest' ? 0.32 : 0.85;
    const damp = 2 * zeta * Math.sqrt(stiff);
    P.vx += ((T.x - P.x) * stiff - P.vx * damp) * dt;
    P.vy += ((T.y - P.y) * stiff - P.vy * damp) * dt;
    P.x += P.vx * dt;
    P.y += P.vy * dt;
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
    g.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || mode === 'drag' || reduce.matches) return;
      setCorner(c);
      mode = 'hover';
    }, sig);
    g.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || mode !== 'hover' || c !== corner) return;
      // a teasing lift toward the pointer, a few dozen px at most
      const p = toLocal(e.clientX, e.clientY);
      const cc = C();
      const lifted = limit({ x: cc.x + (p.x - cc.x) * 0.5 + (corner === 'r' ? -14 : 14), y: cc.y + (p.y - cc.y) * 0.5 - 12 }, 0.16);
      T.x = lifted.x;
      T.y = lifted.y;
      kick();
    }, sig);
    g.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && mode === 'hover') home();
    }, sig);
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
      const p = limit(toLocal(e.clientX, e.clientY), 0.62);
      T.x = p.x;
      T.y = p.y;
      kick();
    }, sig);
    g.addEventListener('pointermove', (e) => {
      if (mode !== 'drag' || e.pointerId !== dragId) return;
      const p = limit(toLocal(e.clientX, e.clientY), 0.62);
      T.x = p.x;
      T.y = p.y;
      kick();
    }, sig);
    const end = (e: PointerEvent) => {
      if (e.pointerId !== dragId) return;
      dragId = -1;
      root.classList.remove('is-dragging');
      // flick it: a fast release keeps its speed into the spring-back
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

  // ---- a one-time tease, so people know the corner comes up ----
  let teaseTimer = 0;
  let io: IntersectionObserver | null = null;
  let teased = false;
  try { teased = sessionStorage.getItem('fx-peel-tease') === '1'; } catch {}
  if (!reduce.matches && !teased) {
    io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting || en.intersectionRatio < 0.6) return;
      io?.disconnect();
      teaseTimer = window.setTimeout(() => {
        if (mode !== 'rest' || document.hidden) return;
        try { sessionStorage.setItem('fx-peel-tease', '1'); } catch {}
        corner = 'r';
        mode = 'hover';
        const c = C();
        const s = Math.min(W, H);
        T.x = c.x - s * 0.13;
        T.y = c.y - s * 0.11;
        kick();
        teaseTimer = window.setTimeout(home, 650);
      }, fineHover.matches ? 1500 : 1100);
    }, { threshold: [0.6] });
    io.observe(drift);
  }

  return () => {
    ac.abort();
    ro.disconnect();
    io?.disconnect();
    clearTimeout(teaseTimer);
    cancelAnimationFrame(raf);
    under.remove();
    flap.remove();
    grips.forEach((g) => g.remove());
    photo.style.clipPath = '';
    root.classList.remove('is-live', 'is-dragging');
  };
}
