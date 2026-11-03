import type { SubjectStatus } from '../../types'
import type { Piece } from '../status-facts'
import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { goal, NO_FACTS, overview, subject } from './builders'

type Row = [id: string, status: SubjectStatus, name: string, text: string, match: string]

/** The page's work: fourteen open pieces, none linked to the goal yet, then four finished ones. */
const ROWS: Row[] = [
  ['backlog', 'working', 'Backlog sort', 'down to 30 open', 'backlog'],
  ['branch', 'working', 'Release branch', 'two merges left', 'branch'],
  ['toolbar', 'waits-on-other', 'Toolbar fix', 'in review', 'toolbar'],
  ['sidebar', 'working', 'Sidebar width', 'two layouts to pick from', 'sidebar'],
  ['turns', 'queued', 'Page turns', 'set aside for now', 'page turn'],
  ['spell', 'waits-on-other', 'Spell check', 'waits on CI', 'spell'],
  ['flaky', 'working', 'Flaky UI test', 'cause found', 'flaky'],
  ['review', 'working', 'Review fixes', 'three of five done', 'review fix'],
  ['empty', 'waits-on-other', 'Empty-state text', 'in review', 'empty'],
  ['menu', 'waits-on-other', 'Menu crash', 'fix in review', 'menu'],
  ['banner', 'waits-on-other', 'Import banner', 'in review', 'banner'],
  ['shots', 'queued', 'Store screenshots', 'not started', 'screenshot'],
  ['filed', 'queued', 'Filed bugs', 'six bugs filed', 'filed'],
  ['login', 'waits-on-other', 'Login loop', 'waits on a server change', 'login'],
  ['icons', 'done', 'Tab icons', 'redrawn', 'icon'],
  ['scroll', 'done', 'Scroll jump', 'fixed', 'scroll'],
  ['fonts', 'done', 'Font fallback', 'fixed', 'font'],
  ['dates', 'done', 'Date labels', 'fixed', 'date'],
]

const pieceOf = ([id, status, name, text, match]: Row): Piece => ({
  id,
  names: [name],
  match,
  state: status === 'queued' || status === 'working' || status === 'done' ? status : 'waits-on-other',
  stands: text,
})

/**
 * A busy page whose goal the person just typed, with no milestones yet, as an unreadable answer leaves it. The next
 * call writes MILESTONE lines for it, not a GOAL line that restates it.
 */
export const goalAwaitingMilestones: Replay = {
  name: 'goal-awaiting-milestones',
  about:
    'A busy page with 14 open subjects and a goal the person typed, which an unreadable answer left with no milestones. One reply, and the call writes the goal its milestones.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 9,
      overview: overview({
        head: { title: '4.1 polish', description: 'Fixing small bugs before the 4.1 build' },
        subjects: ROWS.map(([, status, name, text], n) => subject(`s${n + 1}`, status, name, text, -90 + n)),
        lastLookAt: minutes(-20),
        goal: { ...goal('Polish bugs fixed in the 4.1 build', -6), isAwaitingMilestones: true },
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'fixing small bugs before the 4.1 build',
      focusMatch: '4\\.1|polish',
      goal: { text: 'Polish bugs fixed in the 4.1 build', match: '4\\.1', milestones: [] },
      pieces: ROWS.map(pieceOf),
    },
  },
  steps: [
    {
      label: 'One reply merges the toolbar fix and picks the sidebar layout',
      at: 5,
      call: {
        kind: 'reply',
        person: 'Merge the toolbar fix once review passes, and go with the wider sidebar.',
        activity: ['Ran: gh pr merge 412', 'Edited src/layout/sidebar.ts', 'Ran: npm test -- layout (31 passed)'],
        reply:
          'The toolbar fix passed review and is merged. The sidebar now uses the wider layout, and the narrow one is gone.',
      },
      facts: {
        pieces: [
          { id: 'toolbar', state: 'done', stands: 'merged' },
          { id: 'sidebar', state: 'done', stands: 'wider layout in', alsoRight: ['working'] },
        ],
      },
      targets: ['milestones-true', 'milestones-shape'],
    },
  ],
}
