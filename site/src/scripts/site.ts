// Small, CSS-first enhancements. Runs once; re-binds after every page change.

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
  setupDraw();
  setupEmail();
  setupMore();
});
