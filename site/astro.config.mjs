// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import remarkHighlight from './src/lib/remark-highlight.mjs';

// Static output. `==text==` in Markdown/MDX becomes a marker highlight.
export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  integrations: [mdx()],
  // Fetch pages on hover (and on press, see scripts/site.ts) so a page turn never waits.
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  // About moved to the home page; keep old links working.
  // Local preview over Tailscale: allow extra hostnames from the environment
  // (e.g. PREVIEW_HOSTS=myhost.tailnet.ts.net), so no private hostname lives in the repo.
  server: {
    allowedHosts: (process.env.PREVIEW_HOSTS ?? '').split(',').filter(Boolean),
  },
  redirects: {
    '/about': '/',
  },
  markdown: {
    remarkPlugins: [remarkHighlight],
  },
});
