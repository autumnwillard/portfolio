// Ink that bleeds (components/fx/case-ink-bleed.astro). Watches the case study's coral
// thread arrows and headline underline; once site.ts marks one .is-drawn, a filtered copy of
// its coral strokes is laid underneath and spreads out like marker ink soaking into paper.

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const SVG = 'http://www.w3.org/2000/svg';
const TARGETS = '.case .thread svg, .case .case__underline';

let teardown: (() => void) | null = null;

function bleed(svg: SVGSVGElement, still: boolean, anims: Animation[]) {
  if (svg.querySelector(':scope > .fx-bleed')) return;
  const strokes = [...svg.querySelectorAll<SVGPathElement>('.ink--accent')];
  if (!strokes.length) return;
  const g = document.createElementNS(SVG, 'g');
  g.setAttribute('class', 'fx-bleed');
  g.setAttribute('filter', 'url(#fx-bleed)');
  g.setAttribute('aria-hidden', 'true');
  const base = parseFloat(getComputedStyle(strokes[0]).strokeWidth) || 3;
  // the arrows and the underline sit in different coordinate spaces; size the halo to the stroke
  // kept tight: a wider halo reads as a neon glow rather than ink soaking in
  const spread = base * 3.6;

  strokes.forEach((src, i) => {
    const order = parseFloat(getComputedStyle(src).getPropertyValue('--i')) || 0;
    const delay = 380 + order * 110; // the pen is about halfway along its stroke
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', src.getAttribute('d') || '');
    p.setAttribute('pathLength', '1');
    p.style.strokeDasharray = '1 1';
    g.appendChild(p);
    if (still) {
      p.style.strokeWidth = `${spread}px`;
      p.style.opacity = '0.22';
      p.style.strokeDashoffset = '0';
    } else {
      settle(anims[anims.push(
        p.animate(
          [
            { strokeDashoffset: 1, strokeWidth: `${base * 1.2}px`, opacity: 0.55 },
            { strokeDashoffset: 0, strokeWidth: `${base * 2.4}px`, opacity: 0.42, offset: 0.4 },
            { strokeDashoffset: 0, strokeWidth: `${spread}px`, opacity: 0.22 },
          ],
          { duration: 2600, delay, easing: 'cubic-bezier(0.25, 0.6, 0.3, 1)', fill: 'both' },
        ),
      ) - 1]);
    }
    // pools where the marker touched down and lifted off (shaft only, not the arrowhead)
    if (i === 0) {
      const len = src.getTotalLength();
      [0, len].forEach((at, k) => {
        const pt = src.getPointAtLength(at);
        const c = document.createElementNS(SVG, 'circle');
        c.setAttribute('cx', pt.x.toFixed(1));
        c.setAttribute('cy', pt.y.toFixed(1));
        c.setAttribute('r', (base * 2.1).toFixed(1));
        g.appendChild(c);
        if (still) {
          c.style.opacity = '0.32';
        } else {
          settle(anims[anims.push(
            c.animate(
              [{ transform: 'scale(0)', opacity: 0.6 }, { transform: 'scale(1)', opacity: 0.32 }],
              { duration: 1500, delay: k ? delay + 900 : delay - 200, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'both' },
            ),
          ) - 1]);
        }
      });
    }
  });
  svg.insertBefore(g, svg.firstChild);
}

/** Once a spread has finished, bake its end state in and drop the animation, so the
 *  filtered halo is a still image the browser can cache instead of re-rendering. */
function settle(a: Animation) {
  a.finished.then(() => {
    try { a.commitStyles(); } catch { /* element gone */ }
    a.cancel();
  }, () => {});
}

function init() {
  teardown?.();
  teardown = null;
  if (!document.getElementById('fx-bleed')) return;
  const svgs = [...document.querySelectorAll<SVGSVGElement>(TARGETS)];
  if (!svgs.length) return;
  const anims: Animation[] = [];
  const still = reduce.matches;
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      const el = r.target as SVGSVGElement;
      if (el.classList.contains('is-drawn')) bleed(el, still, anims);
    }
  });
  for (const svg of svgs) {
    if (still) bleed(svg, true, anims);
    else if (svg.classList.contains('is-drawn')) bleed(svg, false, anims);
    else mo.observe(svg, { attributes: true, attributeFilter: ['class'] });
  }
  teardown = () => {
    mo.disconnect();
    anims.forEach((a) => a.cancel());
    document.querySelectorAll('.fx-bleed').forEach((g) => g.remove());
  };
}

document.addEventListener('astro:page-load', init);
document.addEventListener('astro:before-swap', () => {
  teardown?.();
  teardown = null;
});
