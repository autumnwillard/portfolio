// Taped-in photos lean toward a mouse pointer: the edge nearest the pointer lifts a
// touch more (TapedImage.astro reads --px / --py, each -1..1). Mouse only: touch, pens
// and reduced motion get the CSS-only hover/scroll behavior. One rAF per frame at most.

const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const bound = new WeakSet<Element>();

function bind() {
  if (!fine.matches || reduce.matches) return;
  document.querySelectorAll<HTMLElement>('[data-paper-tilt]').forEach((el) => {
    if (bound.has(el)) return;
    bound.add(el);
    let rect: DOMRect | null = null;
    let at = 0; // scrollY when rect was measured
    const measure = () => ((at = window.scrollY), (rect = el.getBoundingClientRect()));
    let raf = 0;
    let x = 0;
    let y = 0;
    const reset = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      rect = null;
      el.style.removeProperty('--px');
      el.style.removeProperty('--py');
    };
    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') measure();
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || reduce.matches) return;
      if (!rect || at !== window.scrollY) measure();
      if (!rect) return;
      x = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
      y = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1));
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          el.style.setProperty('--px', x.toFixed(3));
          el.style.setProperty('--py', y.toFixed(3));
        });
      }
    });
    el.addEventListener('pointerleave', reset);
  });
}

document.addEventListener('astro:page-load', bind);
