// Small, CSS-first enhancements. Runs once; re-binds after every page change.
import { loop } from '../lib/ink';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
let observer: IntersectionObserver | null = null;

/** Ink drawings draw themselves when they scroll into view. */
function setupDraw() {
  observer?.disconnect();
  const items = document.querySelectorAll<SVGElement | HTMLElement>('.draw:not(.is-drawn)');
  if (reduce.matches || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-drawn'));
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-drawn');
          observer?.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -60px 0px', threshold: 0.1 },
  );
  items.forEach((el) => observer!.observe(el));
}

/**
 * The sketchbook keeps up with you as you read. A few things get "written in" as they
 * arrive: highlighter swipes, the label beside a case-study arrow, the end-credits
 * sign-off. Only things that start below the fold wait (they get .is-waiting); anything
 * already on screen, and everything without JS or with reduced motion, is simply there.
 */
const WRITE_IN = 'mark.hl, .thread__label, .credits__signoff';
let writer: IntersectionObserver | null = null;
function setupWriteIn() {
  writer?.disconnect();
  if (reduce.matches || !('IntersectionObserver' in window)) return;
  writer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.remove('is-waiting');
          writer?.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.6 },
  );
  const fold = innerHeight;
  document.querySelectorAll<HTMLElement>(WRITE_IN).forEach((el) => {
    if (el.getBoundingClientRect().top < fold) return;
    el.classList.add('is-waiting');
    writer!.observe(el);
  });
}

/**
 * Section numbers in the margin get a quick pencil loop around them as their section
 * arrives, like someone ticking off where they are. Decoration only (and only on
 * screens wide enough to show the margin); the numbers read fine without it.
 */
function setupMarginLoops() {
  document.querySelectorAll<HTMLElement>('.sheet-section > .margin-mark').forEach((mark, i) => {
    if (mark.querySelector('.margin-loop')) return;
    const svg = `<svg class="margin-loop draw" viewBox="0 0 60 40" aria-hidden="true" focusable="false"><path class="ink" pathLength="1" d="${loop(30, 21, 24, 16, 50 + i * 7, 1.12)}"/></svg>`;
    mark.insertAdjacentHTML('beforeend', svg);
  });
}

/** Build mailto links at runtime (the address stays readable as text without JS). */
function setupEmail() {
  document.querySelectorAll<HTMLAnchorElement>('.js-email').forEach((a) => {
    const { u, d } = a.dataset;
    if (u && d) a.href = `mailto:${u}@${d}`;
  });
  document.querySelectorAll<HTMLButtonElement>('.js-copy-email').forEach((btn) => {
    btn.hidden = false;
    btn.addEventListener('click', async () => {
      const { u, d } = btn.dataset;
      try {
        await navigator.clipboard.writeText(`${u}@${d}`);
        const text = btn.querySelector('.btn__text') ?? btn;
        const label = text.textContent;
        text.textContent = 'Copied!';
        setTimeout(() => (text.textContent = label), 2000);
      } catch {
        /* clipboard blocked: the address is on the page as text */
      }
    });
  });
}

/** "Show more work" on phones. Without JS, everything is simply shown. */
function setupMore() {
  document.querySelectorAll<HTMLElement>('[data-more]').forEach((wrap) => {
    const btn = wrap.querySelector<HTMLButtonElement>('.js-more-toggle');
    if (!btn) return;
    wrap.classList.add('is-collapsible', 'is-collapsed');
    btn.hidden = false;
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => {
      const collapsed = wrap.classList.toggle('is-collapsed');
      btn.setAttribute('aria-expanded', String(!collapsed));
      (btn.querySelector('.btn__text') ?? btn).textContent = collapsed ? 'Show more work' : 'Show less';
    });
  });
}

/**
 * Flag buttons that are links flip all the way over on click, like they were used to
 * turn the page. It's one gesture, and nothing waits on anything else:
 *  - pointerdown: the flag squishes flat (CSS :active) and the page starts loading;
 *  - click: the flag starts to lift, and Astro's router turns the page as soon as the
 *    next page is in (usually at once: it was prefetched on hover or press);
 *  - the clicked flag gets its own view-transition name, so it isn't frozen into the
 *    page snapshot: it keeps lifting while it rides the turning page (global.css,
 *    "Flag handoff"), starting from whatever pose the in-page lift had reached.
 * Links Astro doesn't route (PDF, mailto, other sites) flip all the way over, then go. Modified clicks,
 * new-tab links and reduced motion are left alone.
 */
const FLIP_LAND_MS = 210; // the flag is past edge-on and landing (global.css flag-flip)
const pulls = new WeakSet<Element>(); // routed flags being pulled up

function isRoutedPage(url: URL) {
  return url.origin === location.origin && !/\.[a-z0-9]+$/i.test(url.pathname);
}

document.addEventListener(
  'click',
  (e) => {
    const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a.btn[href]');
    if (!a || e.defaultPrevented || e.button !== 0) return;
    if (a.matches('.is-flipping, .is-pulling')) {
      // a second click mid-flip: already on its way
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (reduce.matches) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    const url = new URL(a.href, location.href);
    if (url.origin === location.origin && url.pathname === location.pathname) return;

    a.classList.remove('is-unflipping');

    if (isRoutedPage(url)) {
      // Let Astro's router handle the click (it fetches now). The flag starts lifting on
      // the page; the turn picks it up from wherever it got to (handoff below).
      pulls.add(a);
      a.classList.add('is-pulling');
      return;
    }
    a.classList.add('is-flipping');
    const landed = new Promise<void>((r) => window.setTimeout(r, FLIP_LAND_MS));
    e.preventDefault();
    e.stopImmediatePropagation();
    landed.then(() => {
      location.assign(url.href);
      // mailto: and the like don't leave the page, so flip the flag back
      window.setTimeout(() => {
        a.classList.replace('is-flipping', 'is-unflipping');
        a.addEventListener('animationend', () => a.classList.remove('is-unflipping'), { once: true });
      }, 500);
    });
  },
  true,
);

/** The flag's layout box in the viewport, ignoring its own (animated) transform. */
function layoutBox(el: HTMLElement) {
  let x = 0;
  let y = 0;
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x: x - scrollX, y: y - scrollY };
}

/**
 * Hand the flag over to the page turn. Right before the old page is captured, name the
 * clicked flag and tell the CSS where it sits relative to the turn's vanishing point,
 * how wide the sheet is (the spine is its left edge), and how far the in-page lift got,
 * so the transition carries on from that exact pose instead of freezing it.
 * Forward turns only: on a back turn the new page falls over the old one, and a flag
 * floating above both would show through it, so it stays in the snapshot as before.
 */
document.addEventListener('astro:before-preparation', (e) => {
  const a = e.sourceElement as HTMLElement | undefined;
  if (!a || !pulls.has(a)) return;

  const load = e.loader;
  e.loader = async () => {
    await load();
    if (e.direction === 'back' || !a.isConnected) return;
    // Stop the in-page lift where it is, so the snapshot and the transition's first
    // frame show the same pose, then hand that exact pose over.
    a.getAnimations().forEach((anim) => anim.pause());
    const pose = getComputedStyle(a).transform;
    const sheet = document.querySelector('.sheet')?.getBoundingClientRect();
    const ox = sheet ? sheet.left + sheet.width / 2 : innerWidth / 2;
    const f = layoutBox(a);
    const vars: Record<string, string> = {
      '--hand-hw': `${(sheet?.width ?? innerWidth) / 2}px`,
      '--hand-ox': `${ox}px`,
      '--hand-oy': `${innerHeight / 2}px`,
      '--hand-fx': `${f.x - ox}px`,
      '--hand-fy': `${f.y - innerHeight / 2}px`,
      '--hand-pose': pose === 'none' ? 'matrix(1, 0, 0, 1, 0, 0)' : pose,
      '--hand-tilt': getComputedStyle(a).getPropertyValue('--flag-tilt').trim() || '0deg',
    };
    handoff = vars;
    setHandoffVars();
    a.style.viewTransitionName = 'flag';
  };
});
// Set before the capture (the flag's pseudos show while the turn is set up) and again
// after the swap, which replaces <html>'s attributes.
let handoff: Record<string, string> | null = null;
function setHandoffVars() {
  if (!handoff) return;
  for (const [name, v] of Object.entries(handoff)) document.documentElement.style.setProperty(name, v);
}
document.addEventListener('astro:after-swap', () => {
  setHandoffVars();
  handoff = null;
});

// Start loading on press, not on release: on touch screens there's no hover prefetch.
document.addEventListener(
  'pointerdown',
  (e) => {
    if (e.button !== 0) return;
    const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href]');
    if (!a || a.target || !isRoutedPage(new URL(a.href, location.href))) return;
    import('astro:prefetch').then(({ prefetch }) => prefetch(a.href, { ignoreSlowConnection: true }));
  },
  { passive: true },
);

// Coming back via the back button (bfcache) shouldn't leave a flag flipped.
window.addEventListener('pageshow', () => {
  document.querySelectorAll<HTMLElement>('.btn.is-flipping, .btn.is-unflipping, .btn.is-pulling').forEach((el) => {
    el.classList.remove('is-flipping', 'is-unflipping', 'is-pulling');
    el.style.viewTransitionName = '';
  });
});

/**
 * The page turns around its left spine, with the vanishing point in the middle of
 * whatever is on screen. The sheet snapshot is the whole (long) page, so tell the CSS
 * where the visible middle is on the old page and on the new one, and how far the old
 * page sat from the new one (it keeps its scroll position while it turns).
 */
let oldTop = 0;
let oldClip = 'none';
function sheetBox() {
  const r = document.querySelector('.sheet')?.getBoundingClientRect();
  const top = r ? r.top : -scrollY;
  // Only what's on screen turns: cheaper to draw, and nothing from far down the page
  // swings into view. The bottom edge is relative to the snapshot's own height (it can
  // still change as images settle), so the clip can never swallow the whole page.
  const from = Math.max(0, Math.round(-top));
  const clip = `inset(${from}px 0 max(0px, calc(100% - ${from + innerHeight}px)) 0)`;
  return { top, clip };
}
document.addEventListener('astro:before-swap', (e) => {
  ({ top: oldTop, clip: oldClip } = sheetBox());
  e.viewTransition.finished.finally(() => document.documentElement.removeAttribute('data-turn-whole'));
});

/**
 * The wavy underline under the active tab slides to the new tab above the turning
 * page, but only when the tabs are on screen before and after. Scrolled down (or
 * coming back to a scrolled spot), it would fly in from off screen, so it just turns
 * with the page instead.
 */
let circleSlides = false;
document.addEventListener('astro:before-preparation', (e) => {
  const tabs = document.querySelector('.tabs');
  const visibleNow = !!tabs && tabs.getBoundingClientRect().bottom > 0;
  const targetY = e.navigationType === 'traverse' ? Number(history.state?.scrollY ?? 0) : 0;
  circleSlides = visibleNow && targetY < 80;
  document.documentElement.toggleAttribute('data-turn-whole', !circleSlides);
});
document.addEventListener('astro:after-swap', () => {
  document.documentElement.toggleAttribute('data-turn-whole', !circleSlides);
  const { top: newTop, clip: newClip } = sheetBox();
  const root = document.documentElement.style;
  root.setProperty('--turn-clip-old', oldClip);
  root.setProperty('--turn-clip-new', newClip);
  root.setProperty('--turn-y-old', `${Math.round(innerHeight / 2 - oldTop)}px`);
  root.setProperty('--turn-y-new', `${Math.round(innerHeight / 2 - newTop)}px`);
  root.setProperty('--turn-dy', `${Math.round(oldTop - newTop)}px`);
});

/**
 * Page-turn direction follows the tab order (About · Work · Contact · Side Projects):
 * moving right turns the page forward, moving left turns it back. A case study sits
 * just after Work, so "← All work" turns back. Browser back/forward keeps Astro's
 * own history-based direction.
 */
function pagePosition(path: string): number {
  const p = path.endsWith('/') ? path : `${path}/`;
  if (p === '/') return 0;
  if (p === '/work/') return 1;
  if (p.startsWith('/work/')) return 1.5;
  if (p.startsWith('/contact/')) return 2;
  if (p.startsWith('/side-projects/')) return 3;
  return 1;
}

document.addEventListener('astro:before-preparation', (e) => {
  if (e.navigationType === 'traverse') return;
  const from = pagePosition(e.from.pathname);
  const to = pagePosition(e.to.pathname);
  if (to < from) e.direction = 'back';
  else if (to > from) e.direction = 'forward';
});

document.addEventListener('astro:page-load', () => {
  setupMarginLoops();
  setupDraw();
  setupWriteIn();
  setupEmail();
  setupMore();
});
