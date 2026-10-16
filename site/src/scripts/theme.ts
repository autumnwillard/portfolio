// The theme switch (components/ThemeToggle.astro). The choice itself is applied before
// first paint by the inline script in BaseLayout's head, which also exposes
// window.__setTheme. This module only handles clicks and keeps the buttons in sync.
// It's a module, so it runs once; the switch persists across page changes.
type Choice = 'system' | 'light' | 'dark';

declare global {
  interface Window { __setTheme?: (choice: Choice) => void }
}

function current(): Choice {
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'light' || t === 'dark' ? t : 'system';
}

function sync() {
  const now = current();
  document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]').forEach((b) => {
    const on = b.dataset.themeChoice === now;
    if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
  });
}

document.addEventListener('click', (e) => {
  const btn = (e.target as Element | null)?.closest<HTMLButtonElement>('[data-theme-choice]');
  if (!btn) return;
  const choice = btn.dataset.themeChoice as Choice;
  window.__setTheme?.(choice);
  sync();
});

// another tab changed it
window.addEventListener('storage', (e) => {
  if (e.key !== 'theme') return;
  const v = e.newValue;
  window.__setTheme?.(v === 'light' || v === 'dark' ? v : 'system');
  sync();
});

document.addEventListener('astro:page-load', sync);
sync();

export {};
