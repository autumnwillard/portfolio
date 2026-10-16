// Shared helpers for the fx islands: read design-token colors at draw time and
// hear about theme changes (data-theme on <html>, or the OS color scheme).

let probe: CanvasRenderingContext2D | null = null;

/** A CSS custom property (any CSS color syntax) as [r, g, b] in 0..1. */
export function tokenRGB(name: string, fallback: [number, number, number] = [0, 0, 0]): [number, number, number] {
  let raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  if (/^[\d.]+\s+[\d.]+\s+[\d.]+$/.test(raw)) raw = `rgb(${raw})`; // channel triplets like --shadow
  probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!probe) return fallback;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = raw; // invalid values leave the previous fill in place
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}

export const luminance = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Calls fn whenever the theme may have changed. Returns a cleanup. */
export function onThemeChange(fn: () => void): () => void {
  const mo = new MutationObserver(() => fn());
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', fn);
  return () => {
    mo.disconnect();
    mq.removeEventListener('change', fn);
  };
}

/** Runs fn after first paint, when the browser is idle. */
export function afterPaint(fn: () => void): () => void {
  let cancelled = false;
  let idle = 0;
  const raf = requestAnimationFrame(() => {
    const go = () => !cancelled && fn();
    if ('requestIdleCallback' in window) idle = window.requestIdleCallback(go, { timeout: 900 });
    else idle = window.setTimeout(go, 200);
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
    if ('cancelIdleCallback' in window) window.cancelIdleCallback(idle);
    clearTimeout(idle);
  };
}
