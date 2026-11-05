import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { goal, milestone, NO_FACTS, overview, piece, subject } from './builders'

/** A goal the Status call set, which the person removes, then asks for again in other words. */
export const removedGoal: Replay = {
  name: 'removed-goal',
  about:
    'The Status call set the goal "Import ready to demo". The person presses Remove goal, then asks to get the import demo-ready, and no goal is set.',
  hasLedgerCalls: false,
  isShort: true,
  start: {
    ledger: {
      turn: 4,
      overview: overview({
        head: { title: 'Notes import', description: 'Importing notes from other apps' },
        subjects: [
          subject('s1', 'working', 'Evernote import', 'notes and tags import', -20),
          subject('s2', 'queued', 'Progress bar', 'not started', -20),
        ],
        lastLookAt: minutes(-5),
        goal: goal('Import ready to demo', -30),
        milestones: [
          milestone('m1', 'working', 'Import works', '', -30),
          milestone('m2', 'queued', 'Demo run-through', '', -30),
        ],
        nextMilestoneId: 3,
        serves: { s1: 'm1', s2: 'm1' },
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'importing notes from other apps',
      focusMatch: 'import',
      goal: {
        text: 'Import ready to demo',
        match: 'import',
        milestones: [
          { id: 'ms-import', name: 'Import works', match: 'import', state: 'working' },
          { id: 'ms-demo', name: 'Demo run-through', match: 'demo', state: 'queued' },
        ],
      },
      pieces: [
        piece({
          id: 'evernote',
          names: ['Evernote import'],
          match: 'evernote',
          state: 'working',
          stands: 'notes and tags import',
        }),
        piece({ id: 'progress', names: ['Progress bar'], match: 'progress', state: 'queued', stands: 'not started' }),
      ],
    },
  },
  steps: [
    {
      label: 'The person presses Remove goal, then asks to get the import demo-ready',
      at: 10,
      events: [{ press: 'remove-goal' }],
      call: {
        kind: 'reply',
        person: "Let's get the import demo-ready.",
        activity: ['Edited src/import/attachments.ts', 'Ran: npm test -- import (24 passed)'],
        reply:
          'Attachments now import too. For the demo, the one gap left is a progress bar, since a large import shows nothing for a while.',
      },
      facts: {
        goal: null,
        pieces: [{ id: 'evernote', state: 'done', stands: 'notes, tags and attachments import', alsoRight: ['working'] }],
      },
      targets: ['goal-only-when-clear'],
    },
  ],
}
