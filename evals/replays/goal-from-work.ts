import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { NO_FACTS, overview, piece, subject } from './builders'

/** No goal, and the person names none, but the agent's plan for the work leads to one outcome with a finish line. */
export const goalFromWork: Replay = {
  name: 'goal-from-work',
  about:
    'No goal is set. The person says to keep going, and the agent plans PDF export and an export settings screen to ship export in 3.2. A goal is set from the work.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 3,
      overview: overview({
        head: { title: 'Export', description: 'Exporting notes to other formats' },
        subjects: [subject('s1', 'working', 'CSV export', 'tags and dates export', -15)],
        lastLookAt: minutes(-5),
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'exporting notes to other formats',
      focusMatch: 'export',
      pieces: [
        piece({ id: 'csv', names: ['CSV export'], match: 'csv', state: 'working', stands: 'tags and dates export' }),
      ],
    },
  },
  steps: [
    {
      label: 'The person says keep going, and the agent plans the rest of export for 3.2',
      at: 10,
      call: {
        kind: 'reply',
        person: 'Keep going.',
        activity: ['Edited src/export/csv.ts', 'Ran: npm test -- export (14 passed)'],
        reply:
          'CSV export is done. To ship export in 3.2, two pieces are left: PDF export, and a settings screen to pick the format. I started PDF export: one note renders to a page.',
      },
      facts: {
        goalClear: { text: 'Export shipped in 3.2', match: 'export|3\\.2' },
        goal: { text: 'Export shipped in 3.2', match: 'export|3\\.2', milestones: [] },
        pieces: [
          { id: 'csv', state: 'done', stands: 'tags and dates export', serves: 'ms-export' },
          piece({
            id: 'pdf',
            names: ['PDF export'],
            match: 'pdf',
            state: 'working',
            stands: 'one note per page',
            serves: 'ms-export',
          }),
          piece({
            id: 'settings',
            names: ['Export settings'],
            match: 'setting|format',
            state: 'queued',
            stands: 'not started',
            serves: 'ms-export',
          }),
        ],
      },
      targets: ['goal-when-clear', 'milestones-shape', 'serves-linked'],
    },
  ],
}
