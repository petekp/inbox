import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { NO_FACTS, overview, piece, subject } from './builders'

/** A goal the person states, declines with Not now, then restates in other words. */
export const declinedGoal: Replay = {
  name: 'declined-goal',
  about:
    'The person states a goal with a date, and the proposal leaves the date out. The person presses Not now, then restates the goal in other words, and nothing is proposed.',
  hasLedgerCalls: false,
  isShort: true,
  start: {
    ledger: {
      turn: 2,
      overview: overview({
        head: { title: 'Notes import', description: 'Importing notes from other apps' },
        subjects: [subject('s1', 'working', 'Evernote import', 'reads the export file', -10)],
        lastLookAt: minutes(-5),
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'importing notes from other apps',
      focusMatch: 'import',
      pieces: [
        piece({
          id: 'evernote',
          names: ['Evernote import'],
          match: 'evernote',
          state: 'working',
          stands: 'reads the export file',
        }),
      ],
    },
  },
  steps: [
    {
      label: 'The person asks for the import ready to demo by the 14th',
      at: 10,
      call: {
        kind: 'reply',
        person: 'Have the import ready to demo by the 14th.',
        activity: ['Edited src/import/evernote.ts', 'Ran: npm test -- import (18 passed)'],
        reply: 'Will do. The Evernote import now brings in notes and their tags. Attachments are next.',
      },
      facts: {
        goalStated: { text: 'Have the import ready to demo by the 14th', match: 'import' },
        pieces: [{ id: 'evernote', stands: 'notes and tags import; attachments next' }],
      },
      targets: ['proposal-when-stated', 'no-time-words'],
    },
    {
      label: 'The person presses Not now, then asks to get the import demo-ready',
      at: 30,
      events: [{ press: 'decline-goal' }],
      call: {
        kind: 'reply',
        person: "Let's get the import demo-ready.",
        activity: ['Edited src/import/attachments.ts', 'Ran: npm test -- import (24 passed)'],
        reply:
          'Attachments now import too. For the demo, the one gap left is a progress bar, since a large import shows nothing for a while.',
      },
      facts: {
        pieces: [{ id: 'evernote', stands: 'notes, tags and attachments import; a progress bar left' }],
      },
      targets: ['proposal-only-when-stated'],
    },
  ],
}
