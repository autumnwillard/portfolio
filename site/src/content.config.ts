import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Case studies. The schema enforces the AGENTS.md template header:
// hook title, so-what, at-a-glance (role, team, timeframe, status, numbers).
const work = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/work' }),
  schema: z.object({
    title: z.string(),
    short_title: z.string(),
    order: z.number(),
    so_what: z.string(),
    card_blurb: z.string(),
    card_metrics: z.array(z.string()).min(1),
    status: z.string(),
    glance: z.object({
      role: z.string(),
      team: z.string(),
      timeframe: z.string(),
      status: z.string(),
      numbers: z.string(),
    }),
    metrics: z.array(z.object({ value: z.string(), label: z.string() })),
    description: z.string().max(160),
    next: z.object({ title: z.string(), href: z.string() }).optional(),
  }),
});

export const collections = { work };
