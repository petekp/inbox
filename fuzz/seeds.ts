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
    isOpen: true,
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
    isOpen: true,
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
    isOpen: true,
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
    isOpen: true,
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
    name: 'opening a PR comment from its thread',
    rule: 'cut',
    detail: '"Open comment"',
    issue: 834,
    isOpen: true,
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
    isOpen: true,
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
    name: 'a row glide that starts again mid-move, in about 2 of 3 runs',
    rule: 'jump',
    detail: 'height stood still',
    issue: 836,
    isOpen: true,
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
    name: 'Cancel on the Reply field',
    rule: 'cut',
    detail: '"Reply" shows at 1.00',
    issue: 837,
    isOpen: true,
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
]

/** Fixed cases for the mod's terminal and desktop looks, run before each mod pass. */
export const MOD_SEEDS: { name: string; issue: number; isOpen: boolean; rule: string; case: ModCase }[] = [
  {
    name: 'a finding whose title holds escapes, in the terminal',
    rule: 'drawn',
    issue: 830,
    isOpen: true,
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
 * Failures of generated cases that an open issue already describes, by look, rule and a text in the failure's detail.
 * A run that finds only these passes, so a fixed-seed run fails only on something new.
 */
const KNOWN: { issue: number; look: Case['look'] | 'codex' | 'mod'; rule: string; details: string[] }[] = [
  { issue: 811, look: 'herdr', rule: 'cut', details: ['"✓ Copied'] },
  { issue: 827, look: 'herdr', rule: 'cut', details: ['"Send"', '"Cancel"', '"Discard"', 'in its box status '] },
  { issue: 828, look: 'herdr', rule: 'jump', details: ['panel d', ' thread '] },
  { issue: 832, look: 'herdr', rule: 'cut', details: ['in its box panel '] },
  { issue: 833, look: 'herdr', rule: 'connector-gap', details: ['in space '] },
  { issue: 830, look: 'omp', rule: 'raw-escape', details: [''] },
  { issue: 830, look: 'mod', rule: 'drawn', details: ['the pane drew nothing'] },
  { issue: 830, look: 'omp', rule: 'width', details: ['with an escape from the input'] },
  { issue: 831, look: 'omp', rule: 'width', details: ['where cellWidth counts'] },
  { issue: 834, look: 'codex', rule: 'cut', details: [' thread ', '"Holds up ', '…" shows', '"·" shows', '"· '] },
  { issue: 834, look: 'codex', rule: 'jump', details: ['press-'] },
  { issue: 835, look: 'codex', rule: 'jump', details: [' grew '] },
  { issue: 836, look: 'codex', rule: 'jump', details: ['height stood still'] },
  {
    issue: 837,
    look: 'codex',
    rule: 'cut',
    details: ['"Reply" shows at 1.00', '"Explain" shows at 1.00', '"Dismiss" shows at 1.00'],
  },
]

/** The open issue a failure is already filed as, or null when it is new. */
export function knownIssueOf(f: { look: string; rule: string; detail: string }): number | null {
  const open = new Set([...SEEDS, ...CODEX_SEEDS, ...MOD_SEEDS].filter(s => s.isOpen).map(s => s.issue))
  const k = KNOWN.find(
    k => open.has(k.issue) && k.look === f.look && k.rule === f.rule && k.details.some(d => f.detail.includes(d)),
  )
  return k?.issue ?? null
}
