import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { goal, milestone, NO_FACTS, overview, piece, subject } from './builders'

/** A goal's last work finishes and the goal is met, then the next goal is set from the person's next request. */
export const goalMetNext: Replay = {
  name: 'goal-met-next',
  about:
    'The goal "Notes 2.5 in the store" has one milestone left. A reply ships it, and the goal is met with no new goal. The person then asks for 2.6 with widgets and a dark theme, and that goal is set with no press.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 12,
      overview: overview({
        head: { title: '2.5 release', description: 'Getting notes 2.5 into the store' },
        subjects: [
          subject('s1', 'done', 'Sync conflicts', 'merged', -90),
          subject('s2', 'working', 'Store release', 'in review', -30),
        ],
        lastLookAt: minutes(-10),
        goal: goal('Notes 2.5 in the store', -120),
        milestones: [
          milestone('m1', 'done', 'Sync fixed', '', -90),
          milestone('m2', 'working', '2.5 published', 'in review', -30),
        ],
        nextMilestoneId: 3,
        serves: { s1: 'm1', s2: 'm2' },
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'getting notes 2.5 into the store',
      focusMatch: '2\\.5',
      goal: {
        text: 'Notes 2.5 in the store',
        match: '2\\.5',
        milestones: [
          { id: 'ms-sync', name: 'Sync fixed', match: 'sync', state: 'done' },
          { id: 'ms-pub', name: '2.5 published', match: 'publish|2\\.5', state: 'working' },
        ],
      },
      pieces: [
        piece({
          id: 'sync',
          names: ['Sync conflicts'],
          match: 'conflict',
          state: 'done',
          stands: 'merged',
          serves: 'ms-sync',
        }),
        piece({
          id: 'store',
          names: ['Store release'],
          match: 'store|release',
          state: 'working',
          stands: 'in review',
          serves: 'ms-pub',
        }),
      ],
    },
  },
  steps: [
    {
      label: 'Store review passes and 2.5 is live',
      at: 10,
      call: {
        kind: 'reply',
        person: null,
        activity: ['Ran: fastlane release --version 2.5'],
        reply: 'Store review passed. Notes 2.5 is live in the store.',
      },
      facts: {
        milestones: [{ id: 'ms-pub', state: 'done' }],
        pieces: [{ id: 'store', state: 'done', stands: 'live in the store' }],
      },
      targets: ['milestones-true', 'goal-only-when-clear'],
    },
    {
      label: 'The person asks for 2.6 with widgets and a dark theme in the beta',
      at: 30,
      call: {
        kind: 'reply',
        person: 'Next is 2.6: get home screen widgets and a dark theme into the TestFlight beta.',
        activity: ['Read src/widgets/README.md', 'Edited src/widgets/today.tsx'],
        reply:
          'Plan for 2.6: a Notes widget, a dark theme, then a TestFlight build. I started the Notes widget: it lists the three newest notes.',
      },
      facts: {
        focus: 'getting widgets and a dark theme into the 2.6 beta',
        focusMatch: '2\\.6|widget|dark',
        goalClear: { text: 'Widgets and a dark theme in the 2.6 beta', match: '2\\.6' },
        goal: { text: 'Notes 2.6 on TestFlight', match: '2\\.6', milestones: [] },
        pieces: [
          piece({
            id: 'widget',
            names: ['Notes widget'],
            match: 'widget',
            state: 'working',
            stands: 'lists newest notes',
            serves: 'ms-next',
          }),
          piece({
            id: 'dark',
            names: ['Dark theme'],
            match: 'dark|theme',
            state: 'queued',
            stands: 'not started',
            serves: 'ms-next',
          }),
        ],
      },
      targets: ['goal-when-clear', 'milestones-shape', 'serves-linked'],
    },
  ],
}
