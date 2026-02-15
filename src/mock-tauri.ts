/**
 * Mock Tauri invoke for browser testing.
 * When running outside Tauri (e.g. in Chrome via localhost:5173),
 * this provides realistic test data so the UI can be verified visually.
 */

import type { VaultEntry, GitCommit } from './types'

const MOCK_CONTENT: Record<string, string> = {
  '/Users/luca/Laputa/project/26q1-laputa-app.md': `---
title: Build Laputa App
is_a: Project
status: Active
owner: Luca Rossi
belongs_to:
  - "[[quarter/q1-2026]]"
related_to:
  - "[[topic/software-development]]"
---

# Build Laputa App

## Overview
Custom desktop app for managing life and knowledge, built with **Tauri** + **React** + **CodeMirror 6**.

The goal is to replace Obsidian with a purpose-built tool that understands the Laputa ontology natively — *projects*, *responsibilities*, *procedures*, and how they all connect.

## Key Results
- [x] Four-panel layout working
- [x] Sidebar navigation with filtering
- [x] Vault scanner reads markdown files
- [ ] CodeMirror 6 editor with live preview
- [ ] Inspector panel with metadata editing

## Architecture
The app reads a vault of markdown files with YAML frontmatter:
\`\`\`
~/Laputa/
  project/
  responsibility/
  procedure/
  note/
  person/
  event/
  topic/
\`\`\`

Each file has frontmatter like:
\`\`\`yaml
title: Some Title
is_a: Project
status: Active
\`\`\`

## Related
See [[Stock Screener — EMA200 Wick Bounce]] for the experiment approach.
Contact [[Matteo Cellini]] for sponsorship data.
`,
  '/Users/luca/Laputa/responsibility/grow-newsletter.md': `---
title: Grow Newsletter
is_a: Responsibility
status: Active
owner: Luca Rossi
---

# Grow Newsletter

## Purpose
Build a sustainable audience through high-quality weekly essays on **engineering leadership**, **AI**, and **personal systems**.

## Key Metrics
- Subscriber count (target: 100k by Q2 2026)
- Open rate (target: > 50%)
- Click-through rate

## Current Strategy
1. Publish one essay per week — Tuesday morning
2. Promote via Twitter/X threads
3. Cross-post to LinkedIn with native formatting
4. Guest posts on other newsletters monthly

## Procedures
- [[Write Weekly Essays]] — the core writing workflow
- Monthly audience analysis and topic planning

## Notes
The newsletter is the *engine* that drives everything else — sponsorships, consulting leads, and brand building.
`,
  '/Users/luca/Laputa/responsibility/manage-sponsorships.md': `---
title: Manage Sponsorships
is_a: Responsibility
status: Active
owner: Matteo Cellini
---

# Manage Sponsorships

## Overview
Revenue stream from newsletter sponsorships. [[Matteo Cellini]] handles day-to-day operations.

## Process
1. Inbound leads via sponsorship page
2. Qualification call
3. Proposal and negotiation
4. Schedule and deliver
5. Report results to sponsor

## Metrics
- Monthly revenue
- Close rate
- Repeat sponsor rate
`,
  '/Users/luca/Laputa/procedure/write-weekly-essays.md': `---
title: Write Weekly Essays
is_a: Procedure
status: Active
owner: Luca Rossi
cadence: Weekly
belongs_to:
  - "[[responsibility/grow-newsletter]]"
---

# Write Weekly Essays

## Schedule
- **Monday**: Pick topic, outline
- **Tuesday**: First draft
- **Wednesday**: Edit and polish
- **Thursday**: Schedule for Tuesday send

## Writing Guidelines
- 1500-2500 words
- One clear takeaway
- Use *real examples* from personal experience
- Include actionable advice, not just theory

### Checklist
- [ ] Pick a topic from the backlog
- [ ] Write outline with 3-5 sections
- [x] Set up newsletter template
- [x] Configure email scheduling
- [ ] Review analytics from last issue

### Nested Topics
- Content strategy for growing the newsletter audience through organic channels, referrals, and high-quality evergreen content that people want to share with their engineering teams
  - Newsletter growth and subscriber acquisition including all the different channels we use to attract new readers to the publication
    - Organic subscribers from search, Twitter, and word of mouth — these are the highest quality subscribers with the best retention rates over time
    - Paid acquisition through Facebook ads and newsletter cross-promotions with other engineering publications in the space
  - Social media cross-posting
- Technical writing
  - Code examples
  - Architecture diagrams
1. First ordered item with a really long description that should definitely wrap to the next line when displayed in the editor, testing the hanging indent behavior for numbered lists
2. Second ordered item — shorter
  1. Nested ordered item that also has quite a long description to verify that the indentation works correctly for nested numbered lists too
`,
  '/Users/luca/Laputa/procedure/run-sponsorships.md': `---
title: Run Sponsorships
is_a: Procedure
status: Active
owner: Matteo Cellini
cadence: Weekly
belongs_to:
  - "[[responsibility/manage-sponsorships]]"
---

# Run Sponsorships

## Weekly Tasks
- Review pipeline in CRM
- Follow up with pending proposals
- Schedule confirmed sponsors
- Send performance reports to completed sponsors

## Templates
- Proposal template: \`/templates/sponsorship-proposal.md\`
- Report template: \`/templates/sponsorship-report.md\`
`,
  '/Users/luca/Laputa/experiment/stock-screener.md': `---
title: Stock Screener — EMA200 Wick Bounce
is_a: Experiment
status: Active
owner: Luca Rossi
related_to:
  - "[[topic/trading]]"
  - "[[topic/algorithmic-trading]]"
---

# Stock Screener — EMA200 Wick Bounce

## Hypothesis
Stocks that wick below the 200-day EMA and close above it show a **statistically significant bounce** in the following 5-10 days.

## Setup
- Scan for daily candles where:
  - Low < EMA200
  - Close > EMA200
  - Volume > 1.5x average
- Filter for mid-cap stocks ($2B-$20B)

## Results So Far
| Date | Ticker | Entry | Exit | Return |
|------|--------|-------|------|--------|
| 2026-01-15 | AAPL | 182.30 | 189.50 | +3.9% |
| 2026-01-22 | MSFT | 410.20 | 418.80 | +2.1% |

## Next Steps
- [ ] Backtest on 10 years of data
- [ ] Add RSI filter for oversold confirmation
- [ ] Build automated alerts via Python script
`,
  '/Users/luca/Laputa/note/facebook-ads-strategy.md': `---
title: Facebook Ads Strategy
is_a: Note
belongs_to:
  - "[[project/26q1-laputa-app]]"
related_to:
  - "[[topic/growth]]"
  - "[[topic/ads]]"
---

# Facebook Ads Strategy

## Key Learnings
- **Lookalike audiences** from newsletter subscribers convert 3x better than interest-based targeting
- Video ads outperform static images by 40% on engagement
- Best performing CTA: "Join 50,000 engineers" (social proof)

## Budget
- Monthly budget: $2,000
- Cost per subscriber: ~$1.50 (down from $3.20 in Q3 2025)

## A/B Tests Running
1. Long-form vs short-form ad copy
2. Testimonial vs data-driven creative
`,
  '/Users/luca/Laputa/note/budget-allocation.md': `---
title: Budget Allocation
is_a: Note
belongs_to:
  - "[[project/26q1-laputa-app]]"
---

# Budget Allocation

## Q1 2026
| Category | Budget | Actual | Delta |
|----------|--------|--------|-------|
| Ads | $6,000 | $5,400 | -$600 |
| Tools | $500 | $480 | -$20 |
| Freelancers | $2,000 | $1,800 | -$200 |

## Notes
- Under budget on ads due to improved targeting efficiency
- Consider reallocating savings to content production
`,
  '/Users/luca/Laputa/person/matteo-cellini.md': `---
title: Matteo Cellini
is_a: Person
aliases:
  - Matteo
---

# Matteo Cellini

## Role
Sponsorship manager — handles all sponsor relationships, proposals, and reporting.

## Contact
- Email: matteo@example.com
- Slack: @matteo

## Responsibilities
- [[Manage Sponsorships]]
- [[Run Sponsorships]]
`,
  '/Users/luca/Laputa/event/2026-02-14-laputa-app-kickoff.md': `---
title: Laputa App Design Session
is_a: Event
related_to:
  - "[[project/26q1-laputa-app]]"
  - "[[person/matteo-cellini]]"
---

# Laputa App Design Session

## Date
2026-02-14

## Attendees
- Luca Rossi
- [[Matteo Cellini]]

## Notes
- Agreed on four-panel layout inspired by Bear Notes
- CodeMirror 6 for the editor — live preview is critical
- MVP by end of Q1: sidebar + note list + editor working
- Inspector panel can wait for M4

## Action Items
- [ ] Luca: finalize ontology mapping
- [x] Luca: set up Tauri v2 project scaffold
- [ ] Matteo: test with real vault data
`,
  '/Users/luca/Laputa/topic/software-development.md': `---
title: Software Development
is_a: Topic
aliases:
  - Dev
  - Coding
---

# Software Development

A broad topic covering everything from frontend to systems programming.

## Subtopics of Interest
- **Frontend**: React, TypeScript, CSS
- **Desktop**: Tauri, Electron alternatives
- **AI/ML**: LLMs, agents, code generation
- **Systems**: Rust, performance optimization
`,
  '/Users/luca/Laputa/topic/trading.md': `---
title: Trading
is_a: Topic
aliases:
  - Algorithmic Trading
---

# Trading

## Focus Areas
- Technical analysis (EMA, RSI, volume patterns)
- Algorithmic screening and alerts
- Risk management and position sizing

## Active Experiments
- [[Stock Screener — EMA200 Wick Bounce]]
`,
}

const MOCK_ENTRIES: VaultEntry[] = [
  {
    path: '/Users/luca/Laputa/project/26q1-laputa-app.md',
    filename: '26q1-laputa-app.md',
    title: 'Build Laputa App',
    isA: 'Project',
    aliases: ['Laputa App'],
    belongsTo: ['[[quarter/q1-2026]]'],
    relatedTo: ['[[topic/software-development]]'],
    status: 'Active',
    owner: 'Luca Rossi',
    cadence: null,
    modifiedAt: Date.now() / 1000,
    createdAt: null,
    fileSize: 2048,
  },
  {
    path: '/Users/luca/Laputa/responsibility/grow-newsletter.md',
    filename: 'grow-newsletter.md',
    title: 'Grow Newsletter',
    isA: 'Responsibility',
    aliases: [],
    belongsTo: [],
    relatedTo: ['[[topic/growth]]'],
    status: 'Active',
    owner: 'Luca Rossi',
    cadence: null,
    modifiedAt: Date.now() / 1000 - 3600,
    createdAt: null,
    fileSize: 1024,
  },
  {
    path: '/Users/luca/Laputa/responsibility/manage-sponsorships.md',
    filename: 'manage-sponsorships.md',
    title: 'Manage Sponsorships',
    isA: 'Responsibility',
    aliases: [],
    belongsTo: [],
    relatedTo: [],
    status: 'Active',
    owner: 'Matteo Cellini',
    cadence: null,
    modifiedAt: Date.now() / 1000 - 7200,
    createdAt: null,
    fileSize: 890,
  },
  {
    path: '/Users/luca/Laputa/procedure/write-weekly-essays.md',
    filename: 'write-weekly-essays.md',
    title: 'Write Weekly Essays',
    isA: 'Procedure',
    aliases: [],
    belongsTo: ['[[responsibility/grow-newsletter]]'],
    relatedTo: [],
    status: 'Active',
    owner: 'Luca Rossi',
    cadence: 'Weekly',
    modifiedAt: Date.now() / 1000 - 86400,
    createdAt: null,
    fileSize: 512,
  },
  {
    path: '/Users/luca/Laputa/procedure/run-sponsorships.md',
    filename: 'run-sponsorships.md',
    title: 'Run Sponsorships',
    isA: 'Procedure',
    aliases: [],
    belongsTo: ['[[responsibility/manage-sponsorships]]'],
    relatedTo: [],
    status: 'Active',
    owner: 'Matteo Cellini',
    cadence: 'Weekly',
    modifiedAt: Date.now() / 1000 - 86400 * 2,
    createdAt: null,
    fileSize: 640,
  },
  {
    path: '/Users/luca/Laputa/experiment/stock-screener.md',
    filename: 'stock-screener.md',
    title: 'Stock Screener — EMA200 Wick Bounce',
    isA: 'Experiment',
    aliases: ['Trading Screener'],
    belongsTo: [],
    relatedTo: ['[[topic/trading]]', '[[topic/algorithmic-trading]]'],
    status: 'Active',
    owner: 'Luca Rossi',
    cadence: null,
    modifiedAt: Date.now() / 1000 - 86400,
    createdAt: null,
    fileSize: 3200,
  },
  {
    path: '/Users/luca/Laputa/note/facebook-ads-strategy.md',
    filename: 'facebook-ads-strategy.md',
    title: 'Facebook Ads Strategy',
    isA: 'Note',
    aliases: [],
    belongsTo: ['[[project/26q1-laputa-app]]'],
    relatedTo: ['[[topic/growth]]', '[[topic/ads]]'],
    status: null,
    owner: null,
    cadence: null,
    modifiedAt: Date.now() / 1000 - 3600 * 5,
    createdAt: null,
    fileSize: 847,
  },
  {
    path: '/Users/luca/Laputa/note/budget-allocation.md',
    filename: 'budget-allocation.md',
    title: 'Budget Allocation',
    isA: 'Note',
    aliases: [],
    belongsTo: ['[[project/26q1-laputa-app]]'],
    relatedTo: [],
    status: null,
    owner: null,
    cadence: null,
    modifiedAt: Date.now() / 1000 - 86400,
    createdAt: null,
    fileSize: 560,
  },
  {
    path: '/Users/luca/Laputa/person/matteo-cellini.md',
    filename: 'matteo-cellini.md',
    title: 'Matteo Cellini',
    isA: 'Person',
    aliases: ['Matteo'],
    belongsTo: [],
    relatedTo: [],
    status: null,
    owner: null,
    cadence: null,
    modifiedAt: Date.now() / 1000 - 86400 * 7,
    createdAt: null,
    fileSize: 320,
  },
  {
    path: '/Users/luca/Laputa/event/2026-02-14-laputa-app-kickoff.md',
    filename: '2026-02-14-laputa-app-kickoff.md',
    title: 'Laputa App Design Session',
    isA: 'Event',
    aliases: [],
    belongsTo: [],
    relatedTo: ['[[project/26q1-laputa-app]]', '[[person/matteo-cellini]]'],
    status: null,
    owner: null,
    cadence: null,
    modifiedAt: Date.now() / 1000 - 3600 * 2,
    createdAt: null,
    fileSize: 1200,
  },
  {
    path: '/Users/luca/Laputa/topic/software-development.md',
    filename: 'software-development.md',
    title: 'Software Development',
    isA: 'Topic',
    aliases: ['Dev', 'Coding'],
    belongsTo: [],
    relatedTo: [],
    status: null,
    owner: null,
    cadence: null,
    modifiedAt: Date.now() / 1000 - 86400 * 30,
    createdAt: null,
    fileSize: 256,
  },
  {
    path: '/Users/luca/Laputa/topic/trading.md',
    filename: 'trading.md',
    title: 'Trading',
    isA: 'Topic',
    aliases: ['Algorithmic Trading'],
    belongsTo: [],
    relatedTo: [],
    status: null,
    owner: null,
    cadence: null,
    modifiedAt: Date.now() / 1000 - 86400 * 14,
    createdAt: null,
    fileSize: 180,
  },
]

function mockGitHistory(path: string): GitCommit[] {
  const filename = path.split('/').pop()?.replace('.md', '') ?? 'unknown'
  const now = Math.floor(Date.now() / 1000)
  return [
    {
      hash: 'a1b2c3d',
      message: `Update ${filename} with latest changes`,
      author: 'Luca Rossi',
      date: now - 86400 * 2,
    },
    {
      hash: 'e4f5g6h',
      message: `Add new section to ${filename}`,
      author: 'Luca Rossi',
      date: now - 86400 * 5,
    },
    {
      hash: 'i7j8k9l',
      message: `Fix formatting in ${filename}`,
      author: 'Luca Rossi',
      date: now - 86400 * 12,
    },
    {
      hash: 'm0n1o2p',
      message: `Create ${filename}`,
      author: 'Luca Rossi',
      date: now - 86400 * 30,
    },
  ]
}

const mockHandlers: Record<string, (args: any) => any> = {
  list_vault: () => MOCK_ENTRIES,
  get_note_content: (args: { path: string }) => MOCK_CONTENT[args.path] ?? '',
  get_all_content: () => MOCK_CONTENT,
  get_git_history: (args: { path: string }) => mockGitHistory(args.path),
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)
}

// Initialize window.__mockContent for browser testing
if (typeof window !== 'undefined') {
  window.__mockContent = MOCK_CONTENT
}

/** Register content for a new entry in mock mode (for get_note_content calls) */
export function addMockEntry(_entry: VaultEntry, content: string) {
  MOCK_CONTENT[_entry.path] = content
  if (typeof window !== 'undefined') {
    window.__mockContent = MOCK_CONTENT
  }
}

/** Update content for an existing entry in mock mode */
export function updateMockContent(path: string, content: string) {
  MOCK_CONTENT[path] = content
  if (typeof window !== 'undefined') {
    window.__mockContent = MOCK_CONTENT
  }
}

export async function mockInvoke<T>(cmd: string, args?: any): Promise<T> {
  const handler = mockHandlers[cmd]
  if (handler) {
    // Simulate async delay
    await new Promise((r) => setTimeout(r, 100))
    return handler(args) as T
  }
  throw new Error(`No mock handler for command: ${cmd}`)
}
