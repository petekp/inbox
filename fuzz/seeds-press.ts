import { emptySession } from '../core/view/session-files'
import type { Case } from './case'
import { UNCONFIRMED, demo, herdr, omp, only } from './seed-cases'

const HOST_ANSWER = "in the draw after the host's answer"

/** Seeds for presses that do not show what they did at once, and for what the press rules first reached. */
export const PRESS_SEEDS: {
  name: string
  issue: number
  isOpen: boolean
  rule: string
  detail?: string
  case: Case
}[] = [
  {
    name: 'Dismiss on a PR, drawn when the host takes the press',
    rule: 'press-shows',
    detail: HOST_ANSWER,
    issue: 1005,
    isOpen: true,
    case: herdr(demo, [
      { is: 'click', on: 'tab', n: 3, label: 'prs' },
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'button', n: 0, label: 'Dismiss' },
      { is: 'wait', ms: 1500 },
    ]),
  },
  {
    name: 'opening a question step with its key',
    rule: 'press-shows',
    detail: '"✓ Opened README.md"',
    issue: 1006,
    isOpen: true,
    case: {
      ...herdr(only([]), [
        {
          is: 'record',
          args: {
            kind: 'question',
            ask: 'M',
            options: ['Rename the settings page - a list item', 'soft\u{ad}hyphen'],
            steps: ['https://example.com/a', '/repo/README.md'],
          },
        },
        { is: 'key', key: 'f' },
        { is: 'turn', to: 'end' },
      ]),
      takeAfterMs: 600,
    },
  },
  {
    name: 'Remove on the Status goal',
    rule: 'cut',
    detail: '"No goal yet.',
    issue: 1007,
    isOpen: true,
    case: {
      ...herdr(only([]), [
        { is: 'click', on: 'tab', n: 4, label: 'overview' },
        { is: 'click', on: 'button', n: 5, label: 'Remove' },
      ]),
      outcomes: { ...UNCONFIRMED, performFails: [true] },
      takeAfterMs: 600,
    },
  },
  {
    name: 'Edit on the Status goal',
    rule: 'cut',
    detail: '"text field: ',
    issue: 1013,
    isOpen: true,
    case: {
      ...herdr(only([]), [
        { is: 'click', on: 'tab', n: 4, label: 'overview' },
        { is: 'wait', ms: 50 },
        { is: 'click', on: 'button', n: 4, label: 'Edit' },
      ]),
      takeAfterMs: 600,
    },
  },
  {
    name: 'Resolve conflicts on a PR whose refresh fails',
    rule: 'cut',
    detail: '"Could not refresh PR',
    issue: 1015,
    isOpen: true,
    case: {
      ...herdr(only([], ['acme/visor#31']), [
        { is: 'click', on: 'tab', n: 3, label: 'prs' },
        { is: 'click', on: 'button', n: 4, label: 'Resolve conflicts' },
      ]),
      outcomes: {
        deliver: ['accepted', 'rejected', 'accepted', 'rejected', 'accepted', 'unconfirmed', 'unconfirmed', 'accepted'],
        isHeldUntilRun: false,
        performFails: [false, false, false, false, false, false, false, true],
      },
      takeAfterMs: 80,
    },
  },
  {
    name: 'Undo on a dismissed task',
    rule: 'vanish',
    detail: '"Sending…" in d14',
    issue: 1008,
    isOpen: true,
    case: {
      ...herdr(only(['d14']), [
        { is: 'click', on: 'button', n: 4, label: 'Dismiss' },
        { is: 'wait', ms: 1200 },
        { is: 'click', on: 'button', n: 3, label: 'Undo' },
      ]),
      takeAfterMs: 600,
    },
  },
  {
    name: 'the first Status while the goal field is open on the empty Status page',
    rule: 'vanish',
    detail: 'in empty overview',
    issue: 1009,
    isOpen: true,
    case: {
      ...herdr(emptySession(), [
        { is: 'click', on: 'tab', n: 4, label: 'overview' },
        { is: 'click', on: 'button', n: 2, label: 'New' },
        { is: 'wait', ms: 25 },
        { is: 'status', lines: ['HEAD: Fix the flaky test | Ship it'] },
      ]),
      takeAfterMs: 2000,
    },
  },
  {
    name: 'a thread press while a merged PR shows its Undo',
    rule: 'cut',
    detail: '"Undo" shows',
    issue: 1010,
    isOpen: true,
    case: {
      ...herdr(only([], ['acme/visor#31', 'acme/visor#29']), [
        { is: 'click', on: 'tab', n: 3, label: 'prs' },
        { is: 'wait', ms: 72 },
        { is: 'prs', n: 3, change: 'merged' },
        { is: 'click', on: 'button', n: 7, label: 'Address' },
      ]),
      takeAfterMs: 200,
    },
  },
  {
    name: 'Dismiss on a task in the omp panel',
    rule: 'press-shows',
    detail: 'the key "x"',
    issue: 1011,
    isOpen: false,
    case: {
      ...omp([
        { is: 'record', args: { kind: 'task', ask: 'S', steps: [] } },
        { is: 'key', key: 'x' },
      ]),
      outcomes: UNCONFIRMED,
    },
  },
]
