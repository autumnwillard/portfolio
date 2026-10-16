// Moving diagrams on case studies (components/fx/case-flow-live.astro).
// Each overlay <svg data-plan> carries invisible route paths, coral "ring" paths around
// boxes, and a plan: how often items are emitted and which routes they take. Items are
// pooled <g> slips moved along the routes with getPointAtLength. The clock only advances
// while the figure is on screen, the tab is visible and nobody pressed Pause.

type Step = { p: string; d: number } | { h: number } | { f: string } | { split: Step[][] } | { c: string };
type Route = { w: number; steps: Step[] };
type Plan = {
  emit: number;
  shape: 'ticket' | 'doc';
  size?: number;
  lanes: Route[][];
  every?: { n: number; events: ({ at: number; f: string } | { at: number; comet: string; d: number })[] };
};
type Item = { steps: Step[]; i: number; t0: number; g: SVGGElement | null; cls: string; seed: number; x: number; y: number };

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const SVG = 'http://www.w3.org/2000/svg';
const narrowMq = window.matchMedia('(max-width: 680px)');
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

class Layer {
  svg: SVGSVGElement;
  plan: Plan;
  paths = new Map<string, { el: SVGPathElement; len: number }>();
  rings = new Map<string, SVGPathElement>();
  comets = new Map<string, SVGPathElement>();
  host: SVGGElement;
  pool: SVGGElement[] = [];
  items: Item[] = [];
  events: { at: number; fn: () => void }[] = [];
  clock = 0;
  nextEmit = 0;
  emitted = 0;
  anims: Animation[] = [];
  draining = false; // finish what's moving, start nothing new

  constructor(svg: SVGSVGElement) {
    this.svg = svg;
    this.plan = JSON.parse(svg.dataset.plan || '{}');
    svg.querySelectorAll<SVGPathElement>('[data-k]').forEach((el) => this.paths.set(el.dataset.k!, { el, len: 0 }));
    svg.querySelectorAll<SVGPathElement>('[data-b]').forEach((el) => this.rings.set(el.dataset.b!, el));
    svg.querySelectorAll<SVGPathElement>('[data-c]').forEach((el) => this.comets.set(el.dataset.c!, el));
    this.host = svg.querySelector('.fx-flow__items')!;
  }

  // which drawing is on screen follows the same breakpoint as .only-wide/.only-narrow
  shown() {
    return this.svg.classList.contains('only-narrow') === narrowMq.matches;
  }

  slip(): SVGGElement {
    const g = this.pool.pop();
    if (g) return g;
    const n = document.createElementNS(SVG, 'g');
    n.setAttribute('class', 'fx-tk');
    n.innerHTML =
      this.plan.shape === 'doc'
        ? '<rect x="-9" y="-11" width="18" height="22" rx="1.5"/><path d="M-5 -5h10M-5 -1h10M-5 3h6"/>'
        : '<rect x="-13" y="-8" width="26" height="16" rx="2"/><path d="M-8 -2.5h14M-8 2.5h9"/>';
    this.host.appendChild(n);
    return n;
  }

  release(it: Item) {
    if (!it.g) return;
    it.g.style.opacity = '0';
    it.g.classList.remove('is-guess');
    this.pool.push(it.g);
    it.g = null;
  }

  flash(key: string) {
    const el = this.rings.get(key);
    if (!el) return;
    el.getAnimations().forEach((a) => a.cancel());
    const soft = el.classList.contains('is-soft');
    this.anims.push(
      el.animate(
        [
          { strokeDasharray: '1 1', strokeDashoffset: 1, opacity: soft ? 0.55 : 1 },
          { strokeDasharray: '1 1', strokeDashoffset: 0, opacity: soft ? 0.55 : 1, offset: 0.35 },
          { strokeDasharray: '1 1', strokeDashoffset: 0, opacity: 0 },
        ],
        { duration: soft ? 620 : 900, easing: 'cubic-bezier(0.4, 0, 0.3, 1)' },
      ),
    );
  }

  comet(key: string, d: number) {
    const el = this.comets.get(key);
    if (!el) return;
    this.anims.push(
      el.animate(
        [
          { strokeDashoffset: 0.07, opacity: 0 },
          { opacity: 1, offset: 0.08 },
          { opacity: 1, offset: 0.9 },
          { strokeDashoffset: -0.97, opacity: 0 },
        ],
        { duration: d, easing: 'cubic-bezier(0.45, 0.05, 0.4, 1)' },
      ),
    );
  }

  pick(routes: Route[]) {
    const total = routes.reduce((s, r) => s + r.w, 0);
    let x = Math.random() * total;
    for (const r of routes) if ((x -= r.w) <= 0) return r;
    return routes[routes.length - 1];
  }

  spawn(steps: Step[], from?: Item) {
    this.items.push({ steps, i: 0, t0: this.clock, g: null, cls: from?.cls ?? '', seed: Math.random() * 6.28, x: from?.x ?? 0, y: from?.y ?? 0 });
  }

  /** Advance the plan's clock by dt ms. */
  tick(dt: number) {
    this.clock += dt;
    const { plan } = this;
    if (!this.draining && this.clock >= this.nextEmit) {
      this.nextEmit = this.clock + plan.emit;
      plan.lanes.forEach((lane) => this.spawn(this.pick(lane).steps));
      this.emitted++;
      if (plan.every && this.emitted % plan.every.n === 0) {
        for (const ev of plan.every.events) {
          const at = this.clock + ev.at;
          this.events.push({ at, fn: 'comet' in ev ? () => this.comet(ev.comet, ev.d) : () => this.flash(ev.f) });
        }
      }
    }
    this.events = this.events.filter((ev) => (this.clock >= ev.at ? (ev.fn(), false) : true));

    const born: Item[] = [];
    const next: Item[] = [];
    for (const it of this.items) {
      let alive = true;
      // run instant steps, and finished timed ones, until something takes time
      for (let guard = 0; guard < 12; guard++) {
        const st = it.steps[it.i];
        if (!st) { this.release(it); alive = false; break; }
        if ('f' in st) { this.flash(st.f); it.i++; continue; }
        if ('c' in st) { it.cls = st.c; it.i++; continue; }
        if ('split' in st) {
          for (const b of st.split) {
            const child: Item = { steps: b, i: 0, t0: this.clock, g: null, cls: it.cls, seed: Math.random() * 6.28, x: it.x, y: it.y };
            born.push(child);
          }
          this.release(it);
          alive = false;
          break;
        }
        const dur = 'p' in st ? st.d : st.h;
        if (this.clock - it.t0 >= dur) { it.t0 += dur; it.i++; continue; }
        break;
      }
      if (!alive) continue;
      const st = it.steps[it.i];
      if ('h' in st) {
        if (it.g) { it.g.style.opacity = '0'; }
      } else if ('p' in st) {
        const path = this.paths.get(st.p);
        if (!path) { it.i++; next.push(it); continue; }
        if (!path.len) path.len = path.el.getTotalLength();
        if (!it.g) {
          it.g = this.slip();
          it.g.classList.toggle('is-guess', it.cls === 'guess');
        }
        const t = Math.min(1, (this.clock - it.t0) / st.d);
        const pt = path.el.getPointAtLength(ease(t) * path.len);
        it.x = pt.x;
        it.y = pt.y;
        // fade in from the box it left, shrink into the box it's going to
        const prev = it.steps[it.i - 1];
        const after = it.steps.slice(it.i + 1).find((s) => !('f' in s) && !('c' in s));
        const fadeIn = !prev || 'h' in prev || 'f' in prev || 'c' in prev;
        const fadeOut = !after || 'h' in after || 'split' in after;
        let k = 1;
        if (fadeIn) k = Math.min(k, t / 0.18);
        if (fadeOut) k = Math.min(k, (1 - t) / 0.2);
        k = Math.max(0, Math.min(1, k));
        const sc = (0.55 + 0.45 * k) * (this.plan.size ?? 1);
        const rot = Math.sin(this.clock / 260 + it.seed) * 5;
        it.g.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${sc.toFixed(3)})`);
        it.g.style.opacity = k.toFixed(3);
      }
      next.push(it);
    }
    this.items = next.concat(born);
  }

  reset() {
    this.anims.forEach((a) => a.cancel());
    this.anims = [];
    this.items.forEach((it) => this.release(it));
    this.items = [];
    this.events = [];
    this.nextEmit = this.clock;
  }
}

let teardowns: (() => void)[] = [];

function setup(root: HTMLElement) {
  if (reduce.matches) return;
  const layers = [...root.querySelectorAll<SVGSVGElement>('.fx-flow__layer')];
  const bar = root.querySelector<HTMLElement>('.fx-flow__bar');
  const btn = root.querySelector<HTMLButtonElement>('.fx-flow__toggle');
  const label = root.querySelector<HTMLElement>('.fx-flow__label');
  if (!layers.length) return;
  root.classList.add('is-live');
  if (bar) bar.hidden = false;
  const live = layers.map((s) => new Layer(s));

  let visible = false;
  let paused = false;
  let ready = false; // the drawing has inked itself in
  let raf = 0;
  let last = 0;
  let readyTimer = 0;

  // A few rounds is enough to get the idea; after that it would only pull the eye away
  // from the text. It stops by itself (the button then says Play) and plays again on request.
  const RUN_MS = 16000;
  let ran = 0;
  const loop = (now: number) => {
    const real = now - last;
    const dt = Math.min(48, real);
    last = now;
    for (const l of live) if (l.shown()) l.tick(dt);
    ran += Math.min(real, 250); // wall-clock time on screen (slow frames still count)
    if (ran >= RUN_MS) {
      // stop sending new items in, let the ones on the arrows arrive, then rest
      live.forEach((l) => (l.draining = true));
      if (live.every((l) => !l.shown() || l.items.length === 0)) {
        raf = 0;
        live.forEach((l) => (l.events = [])); // the last box's coral flash finishes on its own
        setPaused(true);
        return;
      }
    }
    raf = requestAnimationFrame(loop);
  };
  const sync = () => {
    const run = visible && ready && !paused && !document.hidden;
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const io = new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      if (visible && !ready && !readyTimer) {
        // let the diagram finish drawing itself before anything moves on it
        const drawn = root.querySelector('.ink-svg.is-drawn');
        readyTimer = window.setTimeout(() => { ready = true; sync(); }, drawn ? 900 : 2600);
      }
      sync();
    },
    { threshold: 0.2 },
  );
  io.observe(root);

  const onVis = () => sync();
  document.addEventListener('visibilitychange', onVis);

  function setPaused(p: boolean) {
    paused = p;
    if (!p) {
      ran = 0;
      live.forEach((l) => (l.draining = false));
    }
    btn?.setAttribute('aria-pressed', String(paused));
    if (label) label.textContent = paused ? 'Play' : 'Pause';
    sync();
  }
  const onToggle = () => setPaused(!paused);
  btn?.addEventListener('click', onToggle);

  // crossing the wide/narrow breakpoint swaps drawings: start the new one clean
  const onMq = () => live.forEach((l) => l.reset());
  narrowMq.addEventListener('change', onMq);

  teardowns.push(() => {
    io.disconnect();
    cancelAnimationFrame(raf);
    clearTimeout(readyTimer);
    document.removeEventListener('visibilitychange', onVis);
    btn?.removeEventListener('click', onToggle);
    narrowMq.removeEventListener('change', onMq);
    live.forEach((l) => l.reset());
  });
}

function init() {
  teardowns.forEach((f) => f());
  teardowns = [];
  document.querySelectorAll<HTMLElement>('[data-fx-flow]').forEach(setup);
}

document.addEventListener('astro:page-load', init);
document.addEventListener('astro:before-swap', () => {
  teardowns.forEach((f) => f());
  teardowns = [];
});
