import type { Replay } from '../status-replay'
import { NO_FACTS, overview, piece } from './builders'

/** Sessions with no goal to infer yet: one small fix, a chat about the code, and a coordinator's unrelated items. */
export const noGoalYet: Replay = {
  name: 'no-goal-yet',
  about:
    'No goal is set. One small fix, then a question about the code, then a coordinator reports three unrelated items from its delegates. No goal is set at any step.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 1,
      overview: overview({ head: null, subjects: [], lastLookAt: null }),
    },
    facts: { ...NO_FACTS },
  },
  steps: [
    {
      label: 'The person asks for one small fix',
      at: 0,
      call: {
        kind: 'reply',
        person: 'The date picker shows Monday first even when the system week starts on Sunday. Fix that.',
        activity: ['Edited src/ui/date-picker.tsx', 'Ran: npm test -- date-picker (9 passed)'],
        reply: 'The date picker now reads the first weekday from the system locale.',
      },
      facts: {
        focus: 'fixing the date picker week start',
        focusMatch: 'date|week',
        pieces: [
          piece({
            id: 'picker',
            names: ['Week start'],
            match: 'date|week',
            state: 'done',
            stands: 'reads the locale',
            alsoRight: ['working'],
          }),
        ],
      },
      targets: ['goal-only-when-clear'],
    },
    {
      label: 'The person asks how sync works',
      at: 10,
      call: {
        kind: 'reply',
        person: 'How does sync decide which edit wins when two devices change the same note?',
        activity: ['Read src/sync/merge.ts'],
        reply:
          'The later edit wins by its device clock, and the earlier one is kept as a conflict copy beside the note. Nothing in the code changed.',
      },
      facts: {},
      targets: ['goal-only-when-clear'],
    },
    {
      label: 'A coordinator reports three unrelated items from its delegates',
      at: 30,
      events: [
        { child: 'start', ref: 'herdr:docs', kind: 'delegate', name: 'Update the API docs' },
        { child: 'start', ref: 'herdr:deps', kind: 'delegate', name: 'Bump the image library' },
      ],
      call: {
        kind: 'reply',
        person: 'What are the delegates up to?',
        activity: ['Ran: herdr pane list'],
        reply:
          'docs is updating the API docs for the new tag endpoint. deps is bumping the image library, and two tests fail on the new version. The flaky login test from this morning passed three runs in a row, so I closed that issue.',
      },
      facts: {
        focus: 'updating docs, a library bump and a flaky test',
        focusMatch: 'doc|librar|bump|upkeep|delegate',
        pieces: [
          piece({ id: 'apidocs', names: ['API docs'], match: 'doc', state: 'working', stands: 'tag endpoint' }),
          piece({
            id: 'imagelib',
            names: ['Image library bump'],
            match: 'image|librar|bump',
            state: 'working',
            stands: 'two tests fail',
          }),
          piece({
            id: 'flaky',
            names: ['Flaky login test'],
            match: 'flaky|login',
            state: 'done',
            stands: 'passes, issue closed',
            alsoRight: ['dropped'],
          }),
        ],
        children: [
          { ref: 'herdr:docs', does: 'Update the API docs', serves: 'apidocs' },
          { ref: 'herdr:deps', does: 'Bump the image library', serves: 'imagelib' },
        ],
      },
      targets: ['goal-only-when-clear'],
    },
  ],
}
