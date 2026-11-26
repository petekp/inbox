import { demoSession } from '../core/view/demo'
import { emptySession } from '../core/view/session-files'
import type { Case, Ev } from './case'
import type { CodexCase } from './look-codex'
import type { ModCase } from './mod-case'
import { openIds } from './agent'
import { START } from './gen'
import type { HostOutcomes } from './host'

const ACCEPTED: HostOutcomes = { deliver: ['accepted'], isHeldUntilRun: false, performFails: [false] }

const herdr = (session: Case['session'], events: Ev[]): Case => ({
  look: 'herdr',
  session,
  outcomes: ACCEPTED,
  takeAfterMs: 80,
  width: 80,
  events,
})

const omp = (events: Ev[]): Case => ({ ...herdr(emptySession(), events), look: 'omp' })

const demo = demoSession(START, 'Claude')
const ESC = String.fromCodePoint(0x1b)
const BEL = String.fromCodePoint(7)

/** Fixed cases from bugs the looks had, which every run includes. A seed whose issue is open is expected to fail. */
/**
 * A seed for an open issue is expected to fail with `rule`, on a failure whose detail holds `detail` when it is given.
 */
export const SEEDS: { name: string; issue: number; isOpen: boolean; rule: string; detail?: string; case: Case }[] = [
  {
    name: 'a row that settles while it opens',
    rule: 'cut',
    issue: 771,
    isOpen: false,
    case: herdr(demo, [
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'row', n: 0, label: 'd13' },
      { is: 'wait', ms: 60 },
      { is: 'close', n: openIds(demo).indexOf('d13'), answer: 'Yes' },
    ]),
  },
  {
    name: 'a second Copy press',
    rule: 'cut',
    detail: 'Copied npm login',
    issue: 811,
    isOpen: false,
    case: herdr(emptySession(), [
      { is: 'record', args: { kind: 'task', ask: 'Log in to the registry', steps: ['npm login'] } },
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'button', n: 0, label: 'Copy' },
      { is: 'wait', ms: 6000 },
      { is: 'click', on: 'button', n: 0, label: 'Copy' },
    ]),
  },
  {
    name: 'Undo bringing a dismissed task back',
    rule: 'cut',
    detail: 'Sending…',
    issue: 827,
    isOpen: false,
    case: herdr(emptySession(), [
      { is: 'record', args: { kind: 'task', ask: 'Run npm login to authenticate with the npm registry' } },
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'button', n: 0, label: 'Dismiss' },
      { is: 'wait', ms: 1000 },
      { is: 'key', key: 'u' },
      { is: 'wait', ms: 450 },
      { is: 'key', key: 'z' },
    ]),
  },
  {
    name: 'opening the Reply field',
    rule: 'cut',
    detail: '"Send"',
    issue: 827,
    isOpen: true,
    case: herdr(demo, [
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'row', n: 0, label: 'd13' },
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'button', n: 0, label: 'Reply' },
    ]),
  },
  {
    name: 'leaving a row just after Explain',
    rule: 'jump',
    issue: 828,
    isOpen: false,
    case: herdr(demo, [
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'row', n: 0, label: 'd13' },
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'button', n: 0, label: 'Explain' },
      { is: 'wait', ms: 300 },
      { is: 'click', on: 'row', n: 0, label: 'd14' },
    ]),
  },
  {
    name: 'the agent closing a row whose Reply field is open',
    rule: 'jump',
    issue: 828,
    isOpen: false,
    case: herdr(demo, [
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'row', n: 0, label: 'd14' },
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'button', n: 0, label: 'Reply' },
      { is: 'wait', ms: 300 },
      { is: 'close', n: openIds(demo).indexOf('d14'), answer: 'No' },
    ]),
  },
  {
    name: 'a finding whose title holds escapes',
    rule: 'raw-escape',
    issue: 830,
    isOpen: false,
    case: omp([
      {
        is: 'record',
        args: {
          kind: 'finding',
          finding_kind: 'issue',
          title: `Red ${ESC}[31mtext${ESC}[0m and ${ESC}]52;c;aGk=${BEL}clipboard`,
          detail: 'd',
        },
      },
      { is: 'key', key: '3' },
    ]),
  },
  {
    name: 'a task in Devanagari',
    rule: 'width',
    issue: 831,
    isOpen: true,
    case: omp([{ is: 'record', args: { kind: 'task', ask: 'नमस्ते क्षत्रिय' } }]),
  },
  {
    name: 'pressing Explain on a task',
    rule: 'cut',
    detail: '"Explaining…"',
    issue: 827,
    isOpen: false,
    case: herdr(emptySession(), [
      { is: 'record', args: { kind: 'task', ask: 'Log in to the registry' } },
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'button', n: 0, label: 'Explain' },
    ]),
  },
  {
    name: 'collapsing a row just after Explain',
    rule: 'cut',
    detail: 'in its box panel d14',
    issue: 832,
    isOpen: false,
    case: herdr(demo, [
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'row', n: 0, label: 'd14' },
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'button', n: 0, label: 'Explain' },
      { is: 'wait', ms: 16 },
      { is: 'key', key: 'z' },
    ]),
  },
  {
    name: 'going back to the Asks tab at once',
    rule: 'cut',
    detail: 'in its box panel i1',
    issue: 898,
    isOpen: false,
    case: herdr(emptySession(), [
      { is: 'record', args: { kind: 'question', ask: 'Show glances while you walk?', options: ['Yes', 'No'] } },
      { is: 'wait', ms: 672 },
      { is: 'click', on: 'tab', n: 0, label: 'overview' },
      { is: 'key', key: 'right' },
    ]),
  },
  {
    name: 'a question that arrives on another tab, first drawn on Asks',
    rule: 'cut',
    detail: 'in its box panel i1',
    issue: 898,
    isOpen: false,
    case: herdr(emptySession(), [
      { is: 'click', on: 'tab', n: 0, label: 'overview' },
      { is: 'wait', ms: 800 },
      { is: 'record', args: { kind: 'question', ask: 'Show glances while you walk?', options: ['Yes', 'No'] } },
      { is: 'wait', ms: 900 },
      { is: 'click', on: 'tab', n: 0, label: 'needsYou' },
    ]),
  },
  {
    name: 'a settled row folding while its answer shows above its Undo',
    rule: 'cut',
    detail: 'in its box status above d10',
    issue: 925,
    isOpen: false,
    case: herdr(demo, [
      { is: 'click', on: 'button', n: 7, label: 'Pinch (recommended)' },
      { is: 'wait', ms: 4287 },
    ]),
  },
  {
    name: 'the agent ordering PRs again while a PR block moves',
    rule: 'motion-id',
    issue: 926,
    isOpen: false,
    case: herdr(demo, [
      { is: 'click', on: 'tab', n: 7, label: 'prs' },
      { is: 'order', picks: [4, 4, 3, 2], label: 'Ship it', why: 'Fix the flaky test' },
      { is: 'click', on: 'button', n: 7, label: 'Discuss' },
      { is: 'order', picks: [], label: 'Yes', why: 'Retry?' },
    ]),
  },
  {
    name: 'a task that comes back after Done',
    rule: 'cut',
    detail: 'in its box panel i1',
    issue: 927,
    isOpen: false,
    case: {
      ...herdr(emptySession(), [
        { is: 'record', args: { kind: 'task', ask: 'Calibrate eye tracking for the new lenses' } },
        { is: 'click', on: 'button', n: 0, label: 'Done' },
        { is: 'wait', ms: 12352 },
      ]),
      takeAfterMs: null,
    },
  },
  {
    name: 'a Reply sent while a settled row folds',
    rule: 'cut',
    detail: '"Not sent',
    issue: 928,
    isOpen: false,
    case: {
      ...herdr(demo, [
        { is: 'click', on: 'button', n: 7, label: 'Pinch (recommended)' },
        { is: 'wait', ms: 5387 },
        { is: 'click', on: 'button', n: 7, label: 'Reply' },
        { is: 'key', key: 'a' },
        { is: 'key', key: 'enter' },
      ]),
      outcomes: { deliver: ['accepted', 'rejected'], isHeldUntilRun: false, performFails: [false] },
    },
  },
  {
    name: 'a task with steps that folds after Done',
    rule: 'cut',
    detail: 'in its box status above i1',
    issue: 931,
    isOpen: true,
    case: herdr(emptySession(), [
      { is: 'record', args: { kind: 'task', ask: '同', steps: ['/repo/x', 'git push', 'https://example.com'] } },
      { is: 'click', on: 'button', n: 0, label: 'Done' },
      { is: 'wait', ms: 5600 },
    ]),
  },
  {
    name: 'a press that waits 15 s, then fails under its buttons',
    rule: 'cut',
    detail: '"Not applied',
    issue: 932,
    isOpen: true,
    case: {
      ...herdr(emptySession(), [
        { is: 'record', args: { kind: 'task', ask: 'Calibrate eye tracking for the new lenses' } },
        { is: 'click', on: 'button', n: 2, label: 'Explain' },
        { is: 'wait', ms: 15200 },
      ]),
      takeAfterMs: null,
    },
  },
  {
    name: 'All 6 options on a question with long options',
    rule: 'cut',
    detail: 'in its box panel i1',
    issue: 933,
    isOpen: true,
    case: herdr(emptySession(), [
      {
        is: 'record',
        args: {
          kind: 'question',
          ask: 'Z',
          options: [
            `https://example.com/${'path/'.repeat(30)}`,
            'هل نعيد المحاولة؟',
            'Fix the flaky test',
            'zero\u200bwidth\u200bspaces',
            '✓ Done · Undo … ↵ ❯',
            '設定画面の名前を変更しますか',
          ],
          context: '',
        },
      },
      { is: 'click', on: 'button', n: 4, label: 'All 6 options' },
    ]),
  },
  {
    name: 'Reply just after Explain',
    rule: 'cut',
    detail: '"Explaining…"',
    issue: 934,
    isOpen: true,
    case: herdr(emptySession(), [
      { is: 'record', args: { kind: 'task', ask: 'Calibrate eye tracking for the new lenses' } },
      { is: 'click', on: 'button', n: 2, label: 'Explain' },
      { is: 'wait', ms: 200 },
      { is: 'click', on: 'button', n: 1, label: 'Reply' },
    ]),
  },
  {
    name: 'folding every fold on the Status tab',
    rule: 'connector-gap',
    issue: 833,
    isOpen: true,
    case: herdr(demo, [
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'tab', n: 0, label: 'overview' },
      { is: 'wait', ms: 1000 },
      { is: 'key', key: 'w' },
    ]),
  },
]

/** Fixed Codex tab cases, run before each Codex pass. A seed whose issue is open is expected to fail with `rule`. */
export const CODEX_SEEDS: {
  name: string
  issue: number
  isOpen: boolean
  rule: string
  detail?: string
  case: CodexCase
}[] = [
  {
    name: 'an option pressed just after Open previews',
    rule: 'jump',
    detail: 'press-d11',
    issue: 924,
    isOpen: false,
    case: {
      look: 'codex',
      theme: 'dark',
      width: 360,
      isReduced: false,
      events: [
        { is: 'click', on: 'button', n: 2 },
        { is: 'click', on: 'button', n: 0 },
      ],
    },
  },
  {
    name: 'a row clicked after j and r on the PRs tab',
    rule: 'cut',
    detail: '"@review-bot"',
    issue: 936,
    isOpen: true,
    case: {
      look: 'codex',
      theme: 'light',
      width: 360,
      isReduced: false,
      events: [
        { is: 'key', key: '4' },
        { is: 'key', key: 'j' },
        { is: 'key', key: 'r' },
        { is: 'click', on: 'row', n: 1 },
      ],
    },
  },
  {
    name: 'Reply just after Open previews',
    rule: 'jump',
    detail: 'd11 shrank',
    issue: 924,
    isOpen: false,
    case: {
      look: 'codex',
      theme: 'dark',
      width: 360,
      isReduced: false,
      events: [
        { is: 'wait', ms: 300 },
        { is: 'click', on: 'button', n: 2 },
        { is: 'click', on: 'button', n: 3 },
      ],
    },
  },
  {
    name: 'opening a PR comment from its thread',
    rule: 'cut',
    detail: '"Open comment"',
    issue: 834,
    isOpen: false,
    case: {
      look: 'codex',
      theme: 'light',
      width: 360,
      isReduced: false,
      events: [
        { is: 'click', on: 'tab', n: 3 },
        { is: 'click', on: 'button', n: 4 },
      ],
    },
  },
  {
    name: 'Explain on a row that is still opening',
    rule: 'jump',
    detail: ' grew ',
    issue: 835,
    isOpen: false,
    case: {
      look: 'codex',
      theme: 'dark',
      width: 360,
      isReduced: false,
      events: [
        { is: 'click', on: 'row', n: 2 },
        { is: 'key', key: 'e' },
      ],
    },
  },
  {
    name: 'a row glide that starts again mid-move',
    rule: 'jump',
    detail: 'height stood still',
    issue: 836,
    isOpen: false,
    case: {
      look: 'codex',
      theme: 'dark',
      width: 520,
      isReduced: false,
      events: [
        { is: 'click', on: 'row', n: 5 },
        { is: 'click', on: 'row', n: 1 },
        { is: 'wait', ms: 350 },
        { is: 'click', on: 'row', n: 2 },
      ],
    },
  },
  {
    name: 'Explain on a row that is still opening, then opening another row',
    rule: 'cut',
    issue: 834,
    isOpen: false,
    case: {
      look: 'codex',
      theme: 'light',
      width: 520,
      isReduced: false,
      events: [
        { is: 'click', on: 'row', n: 7 },
        { is: 'click', on: 'button', n: 3 },
        { is: 'click', on: 'row', n: 1 },
      ],
    },
  },
  {
    name: 'opening a row again just as its close ends',
    rule: 'cut',
    issue: 863,
    isOpen: false,
    case: {
      look: 'codex',
      theme: 'light',
      width: 520,
      isReduced: false,
      events: [
        { is: 'click', on: 'row', n: 1 },
        { is: 'wait', ms: 300 },
        { is: 'key', key: 'ArrowUp' },
      ],
    },
  },
  {
    name: 'Copy on an open task, whose result shows under its buttons',
    rule: 'jump',
    detail: 'press-',
    issue: 864,
    isOpen: false,
    case: {
      look: 'codex',
      theme: 'light',
      width: 520,
      isReduced: false,
      events: [
        { is: 'click', on: 'row', n: 5 },
        { is: 'click', on: 'button', n: 0 },
      ],
    },
  },
  {
    name: 'Cancel on the Reply field',
    rule: 'cut',
    detail: '"Reply" shows at 1.00',
    issue: 837,
    isOpen: false,
    case: {
      look: 'codex',
      theme: 'light',
      width: 360,
      isReduced: false,
      events: [
        { is: 'click', on: 'row', n: 7 },
        { is: 'click', on: 'button', n: 2 },
        { is: 'wait', ms: 800 },
        { is: 'click', on: 'button', n: 7 },
      ],
    },
  },
  {
    name: 'Compare, then opening another row',
    rule: 'cut',
    detail: '"Holds up Flick option" shows at 1.00',
    issue: 896,
    isOpen: true,
    case: {
      look: 'codex',
      theme: 'dark',
      width: 360,
      isReduced: false,
      events: [
        { is: 'click', on: 'button', n: 4 },
        { is: 'click', on: 'row', n: 8 },
      ],
    },
  },
]

/** Fixed cases for the mod's terminal and desktop looks, run before each mod pass. */
export const MOD_SEEDS: { name: string; issue: number; isOpen: boolean; rule: string; case: ModCase }[] = [
  {
    name: 'a finding whose title holds escapes, in the terminal',
    rule: 'drawn',
    issue: 830,
    isOpen: false,
    case: {
      look: 'terminal',
      columns: 80,
      records: [
        {
          kind: 'finding',
          finding_kind: 'issue',
          title: `Red ${ESC}[31mtext${ESC}[0m and ${ESC}]52;c;aGk=${BEL}clipboard`,
          detail: 'd',
        },
      ],
    },
  },
]

/**
 * Failures of generated cases that an open issue already describes, by look, rule and what the failure's detail holds:
 * one of `details`, where a list stands for a detail that holds every text in it, as a cut's text and its box. A run
 * that finds only these passes, so a fixed-seed run fails only on something new.
 */
const KNOWN: { issue: number; look: Case['look'] | 'codex' | 'mod'; rule: string; details: (string | string[])[] }[] = [
  { issue: 811, look: 'herdr', rule: 'cut', details: ['"✓ Copied'] },
  {
    issue: 827,
    look: 'herdr',
    rule: 'cut',
    details: [
      ['"Send"', 'in its box panel '],
      ['"Cancel"', 'in its box panel '],
      ['"Discard"', 'in its box panel '],
      ['"Sending…"', 'in its box status '],
    ],
  },
  {
    issue: 927,
    look: 'herdr',
    rule: 'cut',
    details: [
      ['"Reply"', 'in its box panel '],
      ['"Explain"', 'in its box panel '],
    ],
  },
  {
    issue: 931,
    look: 'herdr',
    rule: 'cut',
    details: [
      ['"Done"', 'in its box status above '],
      ['"Undo"', ' undo'],
    ],
  },
  { issue: 932, look: 'herdr', rule: 'cut', details: [['"Not applied', 'in its box status ']] },
  {
    issue: 934,
    look: 'herdr',
    rule: 'cut',
    details: [
      ['"Explaining…"', 'in its box status '],
      ['"Queued: Explain"', 'in its box status '],
    ],
  },
  { issue: 833, look: 'herdr', rule: 'connector-gap', details: ['in space '] },
  { issue: 831, look: 'omp', rule: 'width', details: ['where cellWidth counts'] },
  { issue: 896, look: 'codex', rule: 'cut', details: ['"Holds up ', '"Comparing…"'] },
  { issue: 936, look: 'codex', rule: 'cut', details: ['visor#31 thread DT'] },
]

/** The open issue a failure is already filed as, or null when it is new. */
export function knownIssueOf(f: { look: string; rule: string; detail: string }): number | null {
  const open = new Set([...SEEDS, ...CODEX_SEEDS, ...MOD_SEEDS].filter(s => s.isOpen).map(s => s.issue))
  const k = KNOWN.find(
    k =>
      open.has(k.issue) &&
      k.look === f.look &&
      k.rule === f.rule &&
      k.details.some(d => (typeof d === 'string' ? [d] : d).every(part => f.detail.includes(part))),
  )
  return k?.issue ?? null
}

/**
 * A seed's failures, less those that an open issue other than the seed's own already describes, as when a seed's moves
 * also show a cut another issue tracks, and those issues.
 */
export function ownFailures<F extends { rule: string; detail: string }>(
  look: string,
  issue: number,
  failures: F[],
): { own: F[]; others: number[] } {
  const others = new Set<number>()
  const own = failures.filter(f => {
    const known = knownIssueOf({ look, rule: f.rule, detail: f.detail })
    if (known === null || known === issue) return true
    others.add(known)
    return false
  })

  return { own, others: [...others] }
}

/** How a seed's verdict names the open issues its other failures belong to. */
export const apartFrom = (others: number[]): string =>
  others.length === 0 ? '' : `, apart from ${others.map(n => `#${n}`).join(', ')}`
