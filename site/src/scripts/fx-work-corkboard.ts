// Work page corkboard (components/fx/work-corkboard.astro).
// Notes are slapped on one by one (every time the page opens), then can be dragged or flung. Wherever
// you drop or fling a note, it stays: a little friction stops it, it can't leave its own
// section, and only its tilt springs back. A tiny flight simulation drives each note
// through the CSS `translate` and `rotate` properties, which
// compose with the note's own `transform` (its tilt and hover lift), so nothing in
// ProofStrip changes. The loop only runs while something is moving.
//
// Performance: a note that's being moved gets `.is-moving` (its own compositor layer, no
// transitions, a fixed shadow), so each frame is a composite, not a repaint. Nothing is
// measured while moving: geometry is read once when a drag starts (and on resize).

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

type Note = {
  el: HTMLElement;
  x: number; y: number; r: number;
  vx: number; vy: number; vr: number;
  held: boolean;
  moving: boolean; // has .is-moving (layer + frozen effects) until it comes to rest
  flying: number; // seconds of free flight left after a toss
  home: { l: number; t: number; w: number; h: number } | null; // page coords at rest
  samples: { t: number; x: number; y: number }[];
  slap: Animation | null;
  out: { tr: string; rot: string; fly: boolean }; // what's on the element now
};

const FRICTION = 7; // a dropped or nudged note slides to a stop on the cork
const SPIN = { k: 150, c: 10 };
const MAX_V = 3200;
const SUB = 0.008; // simulation substep, seconds

let teardown: (() => void) | null = null;

function init() {
  teardown?.();
  teardown = null;
  const board = document.querySelector<HTMLElement>('[data-fx-cork]');
  if (!board) return;
  if (reduce.matches) {
    board.classList.add('is-live');
    return;
  }
  const cascade = board.querySelector<HTMLElement>('.cascade');
  const notes: Note[] = [...board.querySelectorAll<HTMLElement>('.jot')].map((el) => ({
    el, x: 0, y: 0, r: 0, vx: 0, vy: 0, vr: 0, held: false, moving: false, flying: 0, home: null,
    samples: [], slap: null, out: { tr: '', rot: '', fly: false },
  }));
  if (!notes.length) return;

  const timers: number[] = [];
  const anims: Animation[] = [];
  const offs: (() => void)[] = [];
  const on = (t: Window | HTMLElement, type: string, fn: (e: any) => void, opts?: AddEventListenerOptions) => {
    t.addEventListener(type, fn, opts);
    offs.push(() => t.removeEventListener(type, fn, opts));
  };

  /* ---------- simulation ---------- */
  let raf = 0;
  let last = 0; // timestamp of the previous frame (rAF clock); 0 = first frame of a run
  let bounds = { l: 0, r: 0, t: 0, b: 0 };
  let zTop = 10; // the note you touched last sits on top
  const area = board.closest<HTMLElement>('section') ?? board;

  // the note's layout box in page coordinates, ignoring every transform (tilt, hover lift,
  // our own translate/rotate), so it doesn't drift with whatever the note is doing
  const layoutBox = (el: HTMLElement) => {
    let l = 0, t = 0;
    for (let p: HTMLElement | null = el; p; p = p.offsetParent as HTMLElement | null) { l += p.offsetLeft; t += p.offsetTop; }
    return { l, t, w: el.offsetWidth, h: el.offsetHeight };
  };
  const measure = () => {
    // notes stay inside their own section (and on screen)
    const vw = document.documentElement.clientWidth;
    const ar = area.getBoundingClientRect();
    bounds = {
      l: Math.max(4, ar.left + scrollX), r: Math.min(vw - 4, ar.right + scrollX),
      t: ar.top + scrollY + 4, b: ar.bottom + scrollY - 4,
    };
    for (const n of notes) n.home = layoutBox(n.el);
  };

  const setMoving = (n: Note, v: boolean) => {
    if (n.moving === v) return;
    n.moving = v;
    n.el.classList.toggle('is-moving', v);
  };

  // only touch the DOM when the value actually changed
  const write = (n: Note) => {
    const s = n.el.style;
    const rest = Math.abs(n.x) < 0.05 && Math.abs(n.y) < 0.05 && Math.abs(n.r) < 0.02 && !n.held;
    const tr = rest ? '' : `${n.x.toFixed(1)}px ${n.y.toFixed(1)}px`;
    const rot = rest ? '' : `${n.r.toFixed(2)}deg`;
    if (tr !== n.out.tr) { n.out.tr = tr; tr ? (s.translate = tr) : s.removeProperty('translate'); }
    if (rot !== n.out.rot) { n.out.rot = rot; rot ? (s.rotate = rot) : s.removeProperty('rotate'); }
    const fly = !n.held && n.flying > 0;
    if (fly !== n.out.fly) { n.out.fly = fly; n.el.classList.toggle('is-flying', fly); }
  };

  const keepIn = (n: Note, bounce: boolean) => {
    const h = n.home;
    if (!h) return;
    const l = h.l + n.x, r = l + h.w, t = h.t + n.y, b = t + h.h;
    const e = bounce ? 0.55 : 0;
    if (l < bounds.l) { n.x += bounds.l - l; if (n.vx < 0) { n.vx *= -e; n.vr += n.vy * 0.02; } }
    if (r > bounds.r) { n.x -= r - bounds.r; if (n.vx > 0) { n.vx *= -e; n.vr -= n.vy * 0.02; } }
    if (t < bounds.t) { n.y += bounds.t - t; if (n.vy < 0) n.vy *= -e; }
    if (b > bounds.b) { n.y -= b - bounds.b; if (n.vy > 0) n.vy *= -e; }
  };

  // A fast note knocks the ones it passes over: some of its momentum goes into them.
  const collide = (n: Note) => {
    const speed = Math.hypot(n.vx, n.vy);
    if (speed < 260 || !n.home) return;
    const ax = n.home.l + n.x + n.home.w / 2, ay = n.home.t + n.y + n.home.h / 2;
    for (const o of notes) {
      if (o === n || o.held || !o.home) continue;
      const bx = o.home.l + o.x + o.home.w / 2, by = o.home.t + o.y + o.home.h / 2;
      const dx = bx - ax, dy = by - ay;
      const reach = (n.home.w + o.home.w) * 0.42;
      const d = Math.hypot(dx, dy);
      if (d > reach || d < 1) continue;
      const push = (reach - d) / reach;
      const nx = dx / d, ny = dy / d;
      const along = Math.max(0, n.vx * nx + n.vy * ny);
      o.vx += nx * along * 0.55 + nx * push * 300;
      o.vy += ny * along * 0.55 + ny * push * 300;
      o.vr += (n.vx * ny - n.vy * nx) * 0.03;
      o.flying = Math.max(o.flying, 0.18);
      setMoving(o, true);
      n.vx -= nx * along * 0.3;
      n.vy -= ny * along * 0.3;
    }
  };

  // Fixed small substeps, so the feel doesn't change with the frame rate. The frame time
  // comes from rAF's own clock only (an input handler's performance.now() can be later than
  // the frame's timestamp, which used to give a negative step and stop the loop mid-drag).
  const frame = (now: number) => {
    const real = last ? Math.min(0.05, Math.max(0, (now - last) / 1000)) : 1 / 60;
    last = now;
    const steps = Math.max(1, Math.ceil(real / SUB - 1e-6));
    let busy = false;
    for (let k = 0; k < steps; k++) busy = step(real / steps);
    for (const n of notes) {
      write(n);
      // back at rest: drop the layer
      if (n.moving && !n.held && !n.vx && !n.vy && !n.vr && !n.r && n.flying <= 0) setMoving(n, false);
    }
    raf = busy ? requestAnimationFrame(frame) : 0;
  };
  const step = (dt: number) => {
    let busy = false;
    for (const n of notes) {
      if (n.held) {
        busy = true;
        continue;
      }
      if (n.flying > 0) {
        // free flight: paper on cork drags quickly
        const drag = Math.exp(-3.4 * dt);
        n.vx *= drag; n.vy *= drag; n.vr *= Math.exp(-2.5 * dt);
        n.flying -= dt;
        if (Math.hypot(n.vx, n.vy) < 140) n.flying = 0;
      } else {
        // no spring home: friction just stops it where it is
        const f = Math.exp(-FRICTION * dt);
        n.vx *= f; n.vy *= f;
      }
      n.vr += (-SPIN.k * n.r - SPIN.c * n.vr) * dt;
      n.x += n.vx * dt; n.y += n.vy * dt; n.r += n.vr * dt;
      n.r = Math.max(-40, Math.min(40, n.r));
      keepIn(n, true);
      collide(n);
      const moving = n.flying > 0 || Math.abs(n.r) > 0.02 ||
        Math.abs(n.vx) > 2 || Math.abs(n.vy) > 2 || Math.abs(n.vr) > 0.5;
      if (!moving) { n.r = n.vx = n.vy = n.vr = 0; n.flying = 0; }
      busy ||= moving;
    }
    return busy;
  };
  const wake = () => {
    if (raf) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  };

  /* ---------- grabbing ---------- */
  type Grab = { n: Note; id: number; sx: number; sy: number; ox: number; oy: number; dragged: boolean; touch: boolean };
  let active: Grab | null = null;
  let suppressClick = false;
  let suppressTimer = 0;

  const sample = (n: Note, x: number, y: number, t: number) => {
    n.samples.push({ t, x, y });
    while (n.samples.length > 2 && t - n.samples[0].t > 90) n.samples.shift();
  };

  const release = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    active = null;
  };

  const startDrag = (a: Grab, e: PointerEvent) => {
    const { n } = a;
    a.dragged = true;
    // pick the note up from where the finger is now, so it doesn't jump by the threshold
    a.sx = e.clientX; a.sy = e.clientY;
    a.ox = n.x; a.oy = n.y;
    n.slap?.finish(); // grabbed mid slap-in: land it now, so the drag isn't fighting the animation
    board.classList.add('was-dragged');
    n.held = true;
    n.flying = 0;
    n.vx = n.vy = 0;
    n.el.classList.add('is-held');
    setMoving(n, true);
    n.el.style.zIndex = String(++zTop);
    try { n.el.setPointerCapture(a.id); } catch {}
    measure();
    wake();
  };

  const onMove = (e: PointerEvent) => {
    const a = active;
    if (!a || e.pointerId !== a.id) return;
    const { n } = a;
    if (!a.dragged) {
      const dx = e.clientX - a.sx, dy = e.clientY - a.sy;
      const adx = Math.abs(dx), ady = Math.abs(dy);
      if (!a.touch) {
        if (Math.hypot(dx, dy) < 6) return;
      } else {
        // Touch: the note has `touch-action: pan-y`, so the browser owns vertical swipes: it
        // starts scrolling and sends pointercancel. A clearly sideways swipe is ours. If the
        // finger keeps going vertically and the browser still hasn't taken it, it isn't
        // going to scroll, so pick the note up rather than leave the gesture dead.
        const sideways = adx >= 8 && adx > ady;
        if (!sideways && ady < 28) return;
      }
      startDrag(a, e);
      return;
    }
    if (e.cancelable) e.preventDefault();
    // every pointer sample since the last event, for a truer fling speed
    const all = (e.getCoalescedEvents?.() ?? []);
    if (all.length) for (const c of all) sample(n, c.clientX, c.clientY, c.timeStamp || performance.now());
    else sample(n, e.clientX, e.clientY, e.timeStamp || performance.now());
    n.x = a.ox + e.clientX - a.sx;
    n.y = a.oy + e.clientY - a.sy;
    // the note swings a little with the pointer, like it's pinched at the top
    const s = n.samples;
    const vx = s.length > 1 ? (s[s.length - 1].x - s[0].x) / Math.max(16, s[s.length - 1].t - s[0].t) : 0;
    n.r += (Math.max(-16, Math.min(16, vx * 9)) - n.r) * 0.25;
    keepIn(n, false);
  };

  const onUp = (e: PointerEvent) => {
    const a = active;
    if (!a || e.pointerId !== a.id) return;
    const { n, dragged } = a;
    release();
    if (!dragged) return;
    try { n.el.releasePointerCapture(a.id); } catch {}
    // a drag isn't a click: don't open the case study at the end of one
    if (e.type === 'pointerup') {
      suppressClick = true;
      clearTimeout(suppressTimer);
      suppressTimer = window.setTimeout(() => (suppressClick = false), 400);
    }
    n.held = false;
    n.el.classList.remove('is-held');
    // fling speed from the last ~80ms only: if the finger stopped before letting go, it's a drop
    const t = e.timeStamp || performance.now();
    const s = n.samples.filter((p) => t - p.t <= 80);
    if (e.type === 'pointerup' && s.length > 1) {
      const span = Math.max(16, t - s[0].t) / 1000;
      n.vx = Math.max(-MAX_V, Math.min(MAX_V, (s[s.length - 1].x - s[0].x) / span));
      n.vy = Math.max(-MAX_V, Math.min(MAX_V, (s[s.length - 1].y - s[0].y) / span));
      n.vr = n.vx * 0.12;
      if (Math.hypot(n.vx, n.vy) > 400) n.flying = 0.9;
    } else {
      n.vx = n.vy = 0;
    }
    n.samples = [];
    wake();
  };

  for (const n of notes) {
    const link = n.el.querySelector('a');
    link?.setAttribute('draggable', 'false');
    on(n.el, 'dragstart', (e: DragEvent) => e.preventDefault());
    on(n.el, 'pointerdown', (e: PointerEvent) => {
      if (active || !e.isPrimary || e.button !== 0) return;
      // no focus on press: a focused note lifts (the keyboard cue), and on touch that made
      // every note twitch under your finger. The click still opens the link.
      e.preventDefault();
      suppressClick = false;
      active = { n, id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, dragged: false, touch: e.pointerType === 'touch' };
      n.samples = [];
      sample(n, e.clientX, e.clientY, e.timeStamp || performance.now());
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
    on(n.el, 'click', (e: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, { capture: true });
    // a long press while dragging shouldn't pop the link menu
    on(n.el, 'contextmenu', (e: Event) => { if (active?.dragged) e.preventDefault(); });
  }
  // a resize can leave a moved note outside its section: tuck it back in (once per frame at most;
  // phones fire resize while the address bar slides during a scroll)
  let resizeQueued = 0;
  on(window, 'resize', () => {
    if (resizeQueued) return;
    resizeQueued = requestAnimationFrame(() => {
      resizeQueued = 0;
      measure();
      notes.forEach((n) => { keepIn(n, false); write(n); });
    });
  });

  /* ---------- slap-in ---------- */
  let lastSlap = notes.length - 1;
  const slap = (n: Note, i: number) => {
    const DUR = 560;
    const delay = 60 + i * 160;
    const side = i % 2 ? 1 : -1;
    // come in big, but never so big it pokes past the screen edge (phones)
    const box = n.el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const room = Math.max(0, Math.min(box.left, vw - box.right) - 6);
    const big = Math.min(1.42, 1 + (2 * room) / Math.max(1, box.width) - 0.04).toFixed(3);
    const dx = room > 40 ? side * 14 : 0;
    const a = n.el.animate(
      [
        { opacity: 0, translate: `${dx}px -70px`, scale: big, rotate: `${side * -9}deg`, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)' },
        { opacity: 1, translate: '0 0', scale: '0.95', rotate: `${side * 1.5}deg`, offset: 0.5, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
        { scale: '1.025', rotate: `${side * -0.8}deg`, offset: 0.72 },
        { opacity: 1, translate: '0 0', scale: '1', rotate: '0deg' },
      ],
      { duration: DUR, delay, fill: 'backwards' },
    );
    n.slap = a;
    a.finished.then(() => { if (n.slap === a) n.slap = null; }, () => {});
    anims.push(a);
    timers.push(window.setTimeout(() => impact(n, i), delay + DUR * 0.5));
  };

  const impact = (n: Note, i: number) => {
    // the board thumps
    if (cascade) anims.push(cascade.animate([{ translate: '0 0' }, { translate: '0 2.5px' }, { translate: '0 -1px' }, { translate: '0 0' }], { duration: 200, easing: 'ease-out' }));
    // the notes already up there wobble (a little twist; they don't wander off)
    notes.forEach((o, k) => {
      if (k >= i) return;
      const d = Math.abs(k - i);
      o.vr += (k % 2 ? 1 : -1) * (70 / d);
      setMoving(o, true);
    });
    wake();
    // impact lines
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'fx-slap');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML =
      '<path d="M9 74 1 70M9 84 0 86M12 94 5 101"/><path d="M91 74 99 70M91 84 100 86M88 94 95 101"/><path d="M30 4 26 -3M50 2V-6M70 4 74 -3"/>';
    n.el.appendChild(svg);
    const a = svg.animate(
      [{ opacity: 0, scale: '0.8' }, { opacity: 1, scale: '1', offset: 0.25 }, { opacity: 0, scale: '1.12' }],
      { duration: 420, easing: 'ease-out' },
    );
    anims.push(a);
    a.finished.then(() => svg.remove(), () => svg.remove());
    if (i === lastSlap) timers.push(window.setTimeout(() => board.classList.add('is-settled'), 450));
  };

  const io = new IntersectionObserver(
    ([entry]) => {
      io.disconnect();
      board.classList.add('is-live');
      // Slap in the notes you can see, every time the page opens (refresh or navigation).
      // Notes below the fold (phones) are simply already on the board.
      const inView = notes.filter((n) => n.el.getBoundingClientRect().top < innerHeight * 0.92);
      if (entry.isIntersecting && inView.length) {
        lastSlap = inView.length - 1;
        inView.forEach((n, i) => slap(n, i));
      } else board.classList.add('is-settled');
    },
    { threshold: 0 },
  );
  io.observe(board);

  teardown = () => {
    io.disconnect();
    cancelAnimationFrame(raf);
    cancelAnimationFrame(resizeQueued);
    clearTimeout(suppressTimer);
    timers.forEach(clearTimeout);
    anims.forEach((a) => a.cancel());
    offs.forEach((f) => f());
    release();
    for (const n of notes) {
      n.el.style.removeProperty('translate');
      n.el.style.removeProperty('rotate');
      n.el.style.removeProperty('z-index');
      n.el.classList.remove('is-held', 'is-flying', 'is-moving');
    }
  };
}

document.addEventListener('astro:page-load', init);
document.addEventListener('astro:before-swap', () => {
  teardown?.();
  teardown = null;
});
