// Work page data. Card text is copied exactly from each case file’s header.
export type ThumbKind = 'hotfix' | 'routing' | 'toolkit' | 'review-system' | 'intake';

export interface FeaturedCard {
  hook: string;
  blurb: string;
  badge: string;
  numbers: string[];
  /** The number the Work page’s "Quick highlights" strip already shows; the Work card skips it. */
  strip?: string;
  href: string;
  thumb: ThumbKind;
  size: 'large' | 'small';
}

export const featured: FeaturedCard[] = [
  {
    hook: 'Four hotfixes a week is not a release schedule.',
    blurb: 'Severe defects kept shipping because nobody knew exactly what was in a release. I started tracking it, then built an AI risk review that runs on rules I wrote. Severe defects fell ~85%.',
    badge: 'In use',
    numbers: ['~85% fewer severe defects', 'Off-cycle hotfix releases: 4+ per week → 0–1'],
    strip: '~85% fewer severe defects',
    href: '/work/release-risk-review/',
    thumb: 'hotfix',
    size: 'large',
  },
  {
    hook: 'Everything gets reviewed twice. Does it need to?',
    blurb: "Slow reviews were the lab’s top complaint. The real cause was a screening form nobody could trust: every item got two reviews by default, and a third hinged on answers that were often wrong. I designed the lab’s first AI review product to answer it, and got it approved for build.",
    badge: 'Approved · in build when I left',
    numbers: ['~70–80% fewer manual reviews (projected)', '95% accuracy gate before anyone relies on it'],
    strip: '~70–80% fewer manual reviews (projected)',
    href: '/work/ai-review-routing/',
    thumb: 'routing',
    size: 'large',
  },
  {
    hook: 'Ten workflows, seven dashboards, zero copy-paste.',
    blurb: 'Four engineering teams ran on hand-copied status numbers and one-by-one ticket reviews. I built them an AI toolkit, and it started turning up problems nobody had spotted yet.',
    badge: 'In use',
    numbers: ['10 workflows · 7 dashboards for four engineering teams and their managers', '75% less sprint reporting time', '114 items reviewed → 16 recommended for acceptance testing'],
    strip: '10 workflows · 7 dashboards for four engineering teams and their managers',
    href: '/work/ai-toolkit/',
    thumb: 'toolkit',
    size: 'large',
  },
  {
    hook: 'What do you mean it was never submitted?',
    blurb: "People thought they’d submitted records they never had. With a strict budget and borrowed developers, I ranked two apps’ backlog by user pain and shipped the smallest fix for each, starting with that one.",
    badge: 'Shipped',
    numbers: ['2,000+ users', 'Abandoned records: hundreds per year → nearly zero', 'Questions down approximately 50%'],
    strip: 'Abandoned records: hundreds per year → nearly zero',
    href: '/work/lab-review-system/',
    thumb: 'review-system',
    size: 'small',
  },
  {
    hook: 'You get an email, you get an email, everyone gets an email!',
    blurb: 'Our highest-priority requests lived in messy email chains. I swapped them for a structured form with automated routing, and it handled 1,000+ requests by the time I left.',
    badge: 'Shipped',
    numbers: ['1,000+ requests'],
    href: '/work/expedite-intake/',
    thumb: 'intake',
    size: 'small',
  },
];

export const pattern = [
  { said: '“Another hotfix this week?”', wrong: 'Nobody had a clear picture of what was going into each release, or what risk each ticket carried.', bet: 'Track it. Then an AI review that runs on my rules, with people making the calls.', link: 'Release Risk Review →', href: '/work/release-risk-review/' },
  { said: '“Reviews take forever.” (the #1 complaint in a lab-wide survey)', wrong: 'Screening answers were too unreliable to use, so every item got two reviews by default, and the third was hit or miss.', bet: 'An AI that answers the screening questions, trusted only after it clears a 95% accuracy gate.', link: 'AI Review Routing →', href: '/work/ai-review-routing/' },
  { said: '“Which team has room?”', wrong: 'The answer lived in hundreds of tickets. My first fix, a spreadsheet, needed four manual data pulls every refresh.', bet: 'Read the sources people already keep up to date instead of adding a new one.', link: 'AI Toolkit →', href: '/work/ai-toolkit/' },
  { said: '“My record was submitted, right?”', wrong: 'A hidden button and a “New” status that looked like success.', bet: 'Three small UI changes, not a redesign.', link: 'Lab Review System →', href: '/work/lab-review-system/' },
  { said: '“Can you expedite this?” (by email, missing key details)', wrong: 'No standard intake and no tracking for urgent work.', bet: 'Structured intake with automated routing.', link: 'Expedite Request Intake →', href: '/work/expedite-intake/' },
  { said: '“Our clients can’t afford us.” (about three paid late or stopped paying)', wrong: 'Small clients took just as much work as bigger ones (brand talks, iteration, outlining, building) for a fraction of the pay.', bet: 'Fewer, bigger clients: mid-size firms with budget but no in-house design or dev team.', link: 'Tech Handoff Market Pivot →', href: '/work/tech-handoff/' },
];

export interface MoreCard { hook: string; tag: string; body: string; extra?: boolean }

export const analyses: MoreCard[] = [
  { hook: '“Done” isn’t done.', tag: 'Analysis · current role', body: 'I audited the tracker against the actual code and found 3 features marked complete that had never been built. The plan changed from “verify and close” to “build.”' },
  { hook: 'The cost of changing your mind mid-project.', tag: 'Analysis · current role', body: "I found 20% of work items were sent backward in the workflow at least once, and reworked items spent up to 9 times longer than normal in testing. UI-heavy work kept bouncing back. Now devs and I work through the design from the start, so small fixes happen before code review, while they’re cheap." },
  { hook: 'Why the outage happened.', tag: 'Analysis · current role', body: 'I traced a production outage to two changes that shipped before a service they depended on. We got a quick hotfix out and held a retrospective.', extra: true },
];

export const tools: MoreCard[] = [
  { hook: "What’s actually stuck?", tag: 'Internal product · current role', body: "A blocker map that groups every flagged item by what’s blocking it (another task, a product decision or an outside vendor) and highlights flags that have gone stale.", extra: true },
  { hook: 'Which number is right?', tag: 'Internal product · current role', body: 'Status numbers kept drifting between the leadership slide, the wiki and the tracking sheet. Now one workflow updates the slide and the wiki from the sheet, then checks that all three agree. Used across 5 initiatives.', extra: true },
  { hook: 'Never the person who built it.', tag: 'Internal product · current role', body: "Picking who presented at sprint demos wasn’t consistently fair. Now a workflow picks the work worth demoing and rotates presenters. The team sees it as fair.", extra: true },
  { hook: 'Gut feel, now with weights.', tag: 'Hiring · current role', body: 'Interview panels needed a consistent way to score candidates. I built a weighted rubric, plus scenario questions drawn from the skills that matter most, so every panelist scores against the same yardstick.', extra: true },
];
