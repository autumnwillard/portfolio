// Taped-in photos under a mouse pointer: the print lifts off the page under its tape and
// its gloss catches the light. TapedImage.astro reads three numbers kept on the <figure>:
//   --px, --py  where the pointer is over the print, each -1..1 (eased, so the glint trails
//               the mouse a touch instead of being glued to it)
//   --lk        how lifted the print is, 0..1: rises as the pointer arrives, falls back with a
//               small settle when it leaves. Lift, shadow and gloss all scale with it.
// One spring per figure, run on rAF only while something is still moving.
// Mouse only: touch and pens get the CSS scroll behavior, and reduced motion gets nothing.

const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const bound = new WeakSet<Element>();

// pointer tracking: quick and critically damped (no wobble while you move)
const TRACK = { k: 260, c: 2 * Math.sqrt(260) };
// lift: a little under-damped, so letting go settles with one soft dip
const LIFT = { k: 170, c: 2 * 0.62 * Math.sqrt(170) };

function bind() {
  if (!fine.matches || reduce.matches) return;
  document.querySelectorAll<HTMLElement>('[data-paper-tilt]').forEach((el) => {
    if (bound.has(el)) return;
    bound.add(el);
    let rect: DOMRect | null = null;
    let at = 0; // scrollY when rect was measured
    const measure = () => ((at = window.scrollY), (rect = el.getBoundingClientRect()));
    const s = { x: 0, y: 0, l: 0, vx: 0, vy: 0, vl: 0 }; // state
    const t = { x: 0, y: 0, l: 0 }; // target
    let raf = 0;
    let last = 0;

    const write = () => {
      el.style.setProperty('--px', s.x.toFixed(3));
      el.style.setProperty('--py', s.y.toFixed(3));
      el.style.setProperty('--lk', s.l.toFixed(3));
    };
    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(0.034, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      s.vx += ((t.x - s.x) * TRACK.k - s.vx * TRACK.c) * dt;
      s.vy += ((t.y - s.y) * TRACK.k - s.vy * TRACK.c) * dt;
      s.vl += ((t.l - s.l) * LIFT.k - s.vl * LIFT.c) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.l += s.vl * dt;
      const busy =
        Math.abs(t.x - s.x) + Math.abs(t.y - s.y) + Math.abs(t.l - s.l) > 0.002 ||
        Math.abs(s.vx) + Math.abs(s.vy) + Math.abs(s.vl) > 0.01;
      if (busy) {
        write();
        raf = requestAnimationFrame(frame);
      } else if (t.l === 0) {
        // at rest and flat: hand the print back to the stylesheet
        last = 0;
        s.x = s.y = s.l = s.vx = s.vy = s.vl = 0;
        el.style.removeProperty('--px');
        el.style.removeProperty('--py');
        el.style.removeProperty('--lk');
        el.classList.remove('is-lit');
      } else {
        last = 0;
        Object.assign(s, { x: t.x, y: t.y, l: t.l });
        write();
      }
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const aim = (e: PointerEvent) => {
      if (!rect || at !== window.scrollY) measure();
      if (!rect) return;
      t.x = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
      t.y = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1));
    };

    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || reduce.matches) return;
      measure();
      aim(e);
      // start the light from where the pointer came in, not from the middle
      if (s.l < 0.05) { s.x = t.x; s.y = t.y; }
      t.l = 1;
      el.classList.add('is-lit');
      kick();
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || reduce.matches) return;
      aim(e);
      kick();
    });
    el.addEventListener('pointerleave', () => {
      rect = null;
      t.l = 0;
      // the light slides off the side the pointer left by, rather than snapping to centre
      t.x *= 1.25;
      t.y *= 1.25;
      kick();
    });
  });
}

document.addEventListener('astro:page-load', bind);
