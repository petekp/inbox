import { emptySession } from '../core/view/session-files'
import type { Case } from './case'
import { UNCONFIRMED, demo, herdr, omp, only } from './seed-cases'

const HOST_ANSWER = "in the draw after the host's answer"

/**
 * Remove on the Status goal, then a Status answer of `line` while its lines still move, with a host that takes presses
 * after 200 ms.
 */
const removeThenStatus = (line: string): Case => ({
  ...herdr(only(['d11', 'd14']), [
    { is: 'click', on: 'tab', n: 4 },
    { is: 'click', on: 'button', n: 5, label: 'Remove' },
    { is: 'wait', ms: 285 },
    { is: 'status', lines: [line] },
  ]),
  outcomes: { deliver: ['accepted'], isHeldUntilRun: true, performFails: [false] },
  takeAfterMs: 200,
  width: 140,
})

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
    isOpen: false,
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
    isOpen: false,
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
    rule: 'connector-gap',
    detail: 'in fit m2',
    issue: 1007,
    isOpen: false,
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
    isOpen: false,
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
    isOpen: false,
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
    isOpen: false,
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
    isOpen: false,
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
    isOpen: false,
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
    name: 'the agent closing the only question',
    rule: 'vanish',
    detail: '" · 1" in group question',
    issue: 1017,
    isOpen: false,
    case: {
      ...herdr(emptySession(), [
        { is: 'record', args: { kind: 'question', ask: 'Ship the beta?', options: ['Ship it', 'No'] } },
        { is: 'wait', ms: 85 },
        { is: 'close', n: 0, reason: 'answered' },
      ]),
      takeAfterMs: 600,
    },
  },
  {
    name: 'o on a check row that is still opening',
    rule: 'press-shows',
    detail: '"✓ Opened the log"',
    issue: 1018,
    isOpen: false,
    case: {
      ...herdr(only([], ['acme/visor#31']), [
        { is: 'click', on: 'tab', n: 3, label: 'prs' },
        { is: 'wait', ms: 16 },
        { is: 'click', on: 'row', n: 1 },
        { is: 'key', key: 'o' },
      ]),
      takeAfterMs: 800,
    },
  },
  {
    name: 'o on a check row whose box still grows',
    rule: 'press-shows',
    detail: '"✓ Opened the log"',
    issue: 1018,
    isOpen: false,
    case: {
      ...herdr(only([], ['acme/visor#31']), [
        { is: 'click', on: 'tab', n: 3, label: 'prs' },
        { is: 'wait', ms: 50 },
        { is: 'click', on: 'row', n: 1 },
        { is: 'key', key: 'o' },
      ]),
      takeAfterMs: 800,
    },
  },
  {
    name: 'Address on a PR thread',
    rule: 'press-shows',
    detail: HOST_ANSWER,
    issue: 1019,
    isOpen: false,
    case: {
      ...herdr(only([], ['acme/visor#31']), [
        { is: 'click', on: 'tab', n: 3, label: 'prs' },
        { is: 'wait', ms: 72 },
        { is: 'click', on: 'button', n: 7, label: 'Address' },
      ]),
      takeAfterMs: 600,
    },
  },
  {
    name: 'Send on a Reply field, drawn when the host takes the press and closes the row',
    rule: 'press-shows',
    detail: HOST_ANSWER,
    issue: 1019,
    isOpen: false,
    case: {
      ...herdr(emptySession(), [
        { is: 'record', args: { kind: 'finding', finding_kind: '', title: 'R', detail: 'D' } },
        { is: 'click', on: 'button', n: 2, label: 'Reply' },
        { is: 'key', key: 'b' },
        { is: 'click', on: 'button', n: 6, label: 'Send' },
      ]),
      takeAfterMs: 2000,
    },
  },
  {
    name: 'Dismiss on a PR, as the host answers the press',
    rule: 'cut',
    detail: '"Undo" shows',
    issue: 1022,
    isOpen: false,
    case: herdr(demo, [
      { is: 'click', on: 'tab', n: 3, label: 'prs' },
      { is: 'wait', ms: 400 },
      { is: 'click', on: 'button', n: 0, label: 'Dismiss' },
      { is: 'wait', ms: 1500 },
    ]),
  },
  {
    name: 'Remove on the Status goal, as its lines change place',
    rule: 'connector-gap',
    detail: '~to ',
    issue: 1007,
    isOpen: false,
    case: herdr(demo, [
      { is: 'key', key: 'left' },
      { is: 'click', on: 'button', n: 7, label: 'Remove' },
    ]),
  },
  {
    name: 'Remove on the Status goal, in a pane as wide as the VM pass drew it',
    rule: 'connector-break',
    detail: 'in fit m2',
    issue: 1055,
    isOpen: false,
    case: {
      ...herdr(demo, [
        { is: 'key', key: 'left' },
        { is: 'click', on: 'button', n: 7, label: 'Remove' },
      ]),
      width: 140,
    },
  },
  {
    name: 'Escape on an open Reply field',
    rule: 'jump',
    detail: 'the highlight of row ',
    issue: 1024,
    isOpen: false,
    case: {
      ...herdr(emptySession(), [
        { is: 'record', args: { kind: 'finding', finding_kind: '', title: 'R', detail: 'D' } },
        { is: 'click', on: 'button', n: 2, label: 'Reply' },
        { is: 'wait', ms: 600 },
        { is: 'key', key: 'escape' },
      ]),
      takeAfterMs: 2000,
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
  {
    name: 'the agent closing the only question, as the Asks count goes',
    rule: 'vanish',
    detail: 'of tab needsYou',
    issue: 1031,
    isOpen: false,
    case: {
      ...herdr(emptySession(), [
        { is: 'record', args: { kind: 'question', ask: 'Ship the beta?', options: ['Ship it', 'No'] } },
        { is: 'wait', ms: 700 },
        { is: 'close', n: 0, reason: 'answered' },
      ]),
      takeAfterMs: 600,
    },
  },
  {
    name: 'Undo pressed 25 ms after Remove on the Status goal, in a narrow pane',
    rule: 'connector-gap',
    detail: 'in fit m4',
    issue: 1034,
    isOpen: false,
    case: {
      ...herdr(only([]), [
        { is: 'click', on: 'tab', n: 4, label: 'overview' },
        { is: 'click', on: 'button', n: 3, label: 'Remove' },
        { is: 'wait', ms: 25 },
        { is: 'click', on: 'button', n: 2, label: 'Undo' },
      ]),
      outcomes: {
        deliver: ['accepted', 'rejected', 'accepted', 'accepted', 'rejected', 'accepted', 'accepted', 'accepted'],
        isHeldUntilRun: false,
        performFails: [true, false, false, false, true, true, false, false],
      },
      takeAfterMs: 20,
      width: 80,
    },
  },
  {
    name: 'Undo pressed 200 ms after Remove on the Status goal, in a narrow pane',
    rule: 'connector-gap',
    detail: 'in space c1',
    issue: 1041,
    isOpen: false,
    case: {
      ...herdr(only([]), [
        { is: 'click', on: 'tab', n: 4, label: 'overview' },
        { is: 'click', on: 'button', n: 3, label: 'Remove' },
        { is: 'wait', ms: 200 },
        { is: 'click', on: 'button', n: 2, label: 'Undo' },
      ]),
      outcomes: {
        deliver: ['accepted', 'rejected', 'accepted', 'accepted', 'rejected', 'accepted', 'accepted', 'accepted'],
        isHeldUntilRun: false,
        performFails: [true, false, false, false, true, true, false, false],
      },
      takeAfterMs: 20,
      width: 80,
    },
  },
  {
    name: 'Undo pressed 220 ms after Remove on the Status goal',
    rule: 'loose-arm',
    detail: 'stroke s1 arm 0',
    issue: 1051,
    isOpen: false,
    case: {
      ...herdr(only([]), [
        { is: 'click', on: 'tab', n: 4, label: 'overview' },
        { is: 'click', on: 'button', n: 3, label: 'Remove' },
        { is: 'wait', ms: 220 },
        { is: 'click', on: 'button', n: 2, label: 'Undo' },
      ]),
      width: 140,
    },
  },
  {
    name: 'a Status answer while Remove on the Status goal moves its lines',
    rule: 'jump',
    detail: 'other moved',
    issue: 1032,
    isOpen: true,
    case: removeThenStatus('GOAL: ├─ └─ │ | working Flaky test: 同步失败时是否重试; queued Flaky test'),
  },
  {
    name: 'a Status answer with a new goal while Remove on the Status goal moves its lines',
    rule: 'vanish',
    detail: '"Undo" in goal heading',
    issue: 1032,
    isOpen: true,
    case: removeThenStatus('GOAL: Ship the beta | working Flaky test: retry on sync failure; queued Flaky test'),
  },
]
