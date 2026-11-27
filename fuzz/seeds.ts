import { demoSession } from '../core/view/demo'
import { emptySession } from '../core/view/session-files'
import type { Case, Ev } from './case'
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
/** The demo session with only the items `ids` and the PRs `prs`, and no findings or closed items. */
const only = (ids: string[], prs: string[] = []): Case['session'] => ({
  ...demo,
  ledger: { ...demo.ledger, items: demo.ledger.items.filter(i => ids.includes(i.id)), findings: [], closed: [] },
  prViews: {
    ...demo.prViews,
    views: Object.fromEntries(Object.entries(demo.prViews.views).filter(([k]) => prs.includes(k))),
  },
})
const ESC = String.fromCodePoint(0x1b)
const BEL = String.fromCodePoint(7)
const LONG_URL = `https://example.com/${'path/'.repeat(30)}`

/**
 * Fixed cases from bugs the looks had, which every run includes. A seed for an open issue is expected to fail with
 * `rule`, on a failure whose detail holds `detail` when it is given.
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
    isOpen: false,
    case: herdr(demo, [
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'row', n: 0, label: 'd13' },
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'button', n: 0, label: 'Reply' },
    ]),
  },
  {
    name: 'selecting another row just after Reply',
    rule: 'cut',
    detail: '"Send"',
    issue: 827,
    isOpen: false,
    case: herdr(demo, [
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'row', n: 0, label: 'd13' },
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'button', n: 0, label: 'Reply' },
      { is: 'wait', ms: 60 },
      { is: 'click', on: 'row', n: 0, label: 'd14' },
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
    isOpen: false,
    case: omp([{ is: 'record', args: { kind: 'task', ask: 'नमस्ते क्षत्रिय' } }]),
  },
  {
    name: 'a combining mark typed just after the key that opened the reply field',
    rule: 'glyph-cut',
    issue: 841,
    isOpen: false,
    case: omp([
      { is: 'record', args: { kind: 'task', ask: 'Log in to the registry' } },
      { is: 'key', key: '2' },
      { is: 'type', text: `t${String.fromCodePoint(0x303)} abc` },
    ]),
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
    isOpen: false,
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
    isOpen: false,
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
    isOpen: false,
    case: herdr(emptySession(), [
      {
        is: 'record',
        args: {
          kind: 'question',
          ask: 'Z',
          options: [
            `https://example.com/${'path/'.repeat(8)}`,
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
    isOpen: false,
    case: herdr(emptySession(), [
      { is: 'record', args: { kind: 'task', ask: 'Calibrate eye tracking for the new lenses' } },
      { is: 'click', on: 'button', n: 2, label: 'Explain' },
      { is: 'wait', ms: 200 },
      { is: 'click', on: 'button', n: 1, label: 'Reply' },
    ]),
  },
  {
    name: 'a press that is not applied after its buttons went',
    rule: 'cut',
    detail: '"Not applied',
    issue: 950,
    isOpen: false,
    case: {
      ...herdr(demo, [
        { is: 'key', key: 'x' },
        { is: 'key', key: 'w' },
        { is: 'wait', ms: 12010 },
      ]),
      takeAfterMs: null,
    },
  },
  {
    name: 'Fix on a PR check whose refresh fails',
    rule: 'cut',
    detail: '"Could not refresh',
    issue: 957,
    isOpen: false,
    case: {
      ...herdr(demo, [
        { is: 'click', on: 'tab', n: 7, label: 'prs' },
        { is: 'key', key: 'j' },
        { is: 'click', on: 'button', n: 6, label: 'Fix' },
      ]),
      outcomes: { deliver: ['accepted'], isHeldUntilRun: false, performFails: [true] },
      takeAfterMs: 2000,
    },
  },
  {
    name: 'a row that opens as the terminal goes back to its shell',
    rule: 'cut',
    detail: 'in its box panel d18',
    issue: 971,
    isOpen: false,
    case: herdr(demo, [{ is: 'click', on: 'row', n: 7, label: 'd18' }, { is: 'wait', ms: 187 }, { is: 'end' }]),
  },
  {
    name: 'the same long question recorded again with a trailing space',
    rule: 'cut',
    detail: 'in its box panel i1',
    issue: 972,
    isOpen: false,
    case: {
      ...herdr(emptySession(), [
        {
          is: 'record',
          args: { kind: 'question', ask: LONG_URL, options: ['Leave it gone', 'Bring it back'], rec: 'Leave it gone' },
        },
        { is: 'wait', ms: 1000 },
        { is: 'record', args: { kind: 'question', ask: `${LONG_URL} `, options: ['Ship it'], context: 'Y' } },
      ]),
      takeAfterMs: 20,
    },
  },
  {
    name: 'Reply pressed just after an option',
    rule: 'cut',
    detail: '"Send"',
    issue: 956,
    isOpen: false,
    case: {
      ...herdr(emptySession(), [
        {
          is: 'record',
          args: {
            kind: 'question',
            ask: 'Show glances while you are walking or driving?',
            options: ['Yes', 'No'],
            rec: 'No',
          },
        },
        { is: 'wait', ms: 400 },
        { is: 'click', on: 'button', n: 0, label: 'No (recommended)' },
        { is: 'click', on: 'button', n: 6, label: 'Reply' },
      ]),
      outcomes: { deliver: ['rejected'], isHeldUntilRun: false, performFails: [false] },
    },
  },
  {
    name: 'a press nobody takes, under a status above the buttons',
    rule: 'cut',
    detail: 'in its box panel d18',
    issue: 967,
    isOpen: false,
    case: {
      ...herdr(demo, [
        { is: 'click', on: 'row', n: 7, label: 'd18' },
        { is: 'key', key: 'x' },
        { is: 'wait', ms: 12010 },
      ]),
      takeAfterMs: null,
    },
  },
  {
    name: 'folding every fold on the Status tab',
    rule: 'connector-gap',
    issue: 833,
    isOpen: false,
    case: herdr(demo, [
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'tab', n: 0, label: 'overview' },
      { is: 'wait', ms: 1000 },
      { is: 'key', key: 'w' },
    ]),
  },
  {
    name: 'a Status milestone that finishes while the Status page draws',
    rule: 'motion-id',
    detail: 'stroke m1 path bottom became stroke m1 path top',
    issue: 980,
    isOpen: false,
    case: herdr(emptySession(), [
      { is: 'key', key: 'left' },
      { is: 'key', key: 'left' },
      {
        is: 'status',
        lines: [
          'NEW: working | Rename the settings page | x',
          'GOAL: Rename the settings page | working Release notes: ; queued Sync retries',
        ],
      },
      { is: 'key', key: 'right' },
      { is: 'status', lines: ['MILESTONE: done | Sync retries | x'] },
    ]),
  },
  {
    name: 'clicking a task whose title is one long word',
    rule: 'vanish',
    detail: 'in d18 went from 1.00 to gone',
    issue: 981,
    isOpen: false,
    case: herdr(
      {
        ...demo,
        ledger: {
          ...demo.ledger,
          items: demo.ledger.items
            .filter(i => i.id === 'd16' || i.id === 'd18')
            .map(i => (i.id === 'd18' ? { ...i, ask: `${ESC}[31mred${ESC}[0m text ${'a'.repeat(240)}` } : i)),
        },
      },
      [{ is: 'click', on: 'row', n: 7, label: 'd18' }],
    ),
  },
  {
    name: 'the right arrow on the Inbox tab, with two findings and no tasks',
    rule: 'jump',
    detail: 'd20 moved',
    issue: 988,
    isOpen: false,
    case: herdr(
      {
        ...demo,
        ledger: {
          ...demo.ledger,
          items: [],
          closed: demo.ledger.closed.filter(c => c.id === 'd10'),
          findings: demo.ledger.findings.flatMap(f =>
            f.id === 'd20'
              ? [{ ...f, title: LONG_URL, detail: 'Rename the settings page' }]
              : f.id === 'd21'
                ? [{ ...f, title: '◆ ◇ ● ○', detail: 'No' }]
                : [],
          ),
        },
        prViews: { ...demo.prViews, views: {} },
      },
      [{ is: 'key', key: 'right' }],
    ),
  },
  {
    name: 'Explain on a task while the host takes presses after 200 ms',
    rule: 'vanish',
    detail: '"Queued: Explain" in d17',
    issue: 991,
    isOpen: false,
    case: {
      ...herdr({ ...demo, ledger: { ...demo.ledger, items: demo.ledger.items.filter(i => i.id === 'd17') } }, [
        { is: 'wait', ms: 3751 },
        { is: 'key', key: 'e' },
      ]),
      takeAfterMs: 200,
    },
  },
  {
    name: 'Explain on a task whose press the host queues',
    rule: 'vanish',
    detail: '"Explaining…" in d17',
    issue: 995,
    isOpen: false,
    case: {
      ...herdr({ ...demo, ledger: { ...demo.ledger, items: demo.ledger.items.filter(i => i.id === 'd17') } }, [
        { is: 'wait', ms: 3751 },
        { is: 'key', key: 'e' },
      ]),
      takeAfterMs: 200,
    },
  },
  {
    name: 'a status after the title whose press the host queues',
    rule: 'vanish',
    detail: 'the status "Explaining…" in d14',
    issue: 997,
    isOpen: true,
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
    name: 'a row the agent settles drops its age',
    rule: 'vanish',
    detail: 'the age "12m" in d13',
    issue: 998,
    isOpen: true,
    case: herdr(demo, [
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'row', n: 0, label: 'd13' },
      { is: 'wait', ms: 60 },
      { is: 'close', n: openIds(demo).indexOf('d13'), answer: 'Yes' },
    ]),
  },
  {
    name: 'a fetch that finds a PR closed',
    rule: 'vanish',
    detail: 'the line "Open PR" in pr:acme/visor#33',
    issue: 999,
    isOpen: true,
    case: herdr(only([], ['acme/visor#33']), [
      { is: 'click', on: 'tab', n: 3, label: 'prs' },
      { is: 'wait', ms: 25 },
      { is: 'prs', n: 2, change: 'closed' },
    ]),
  },
  {
    name: 'a question answered while the Status tab shows',
    rule: 'vanish',
    detail: 'the line "View question" in s3',
    issue: 1000,
    isOpen: true,
    case: {
      ...herdr(only(['d11']), [
        { is: 'click', on: 'button', n: 1, label: 'Flick' },
        { is: 'click', on: 'tab', n: 0, label: 'overview' },
        { is: 'wait', ms: 1500 },
      ]),
      takeAfterMs: 600,
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
