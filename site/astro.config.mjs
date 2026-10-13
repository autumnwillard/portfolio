// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import remarkHighlight from './src/lib/remark-highlight.mjs';

// Static output. `==text==` in Markdown/MDX becomes a marker highlight.
export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  integrations: [mdx()],
  markdown: {
    remarkPlugins: [remarkHighlight],
  },
});
