import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { goal, milestone, NO_FACTS, overview, piece, subject } from './builders'

/** The person types a goal while a Status call that read the met goal before it runs, and the typed goal stays. */
export const goalTypedWhileRunning: Replay = {
  name: 'goal-typed-while-running',
  about:
    'The goal "Notes 2.5 in the store" is met. The person asks for 2.6 with widgets and a dark theme, and while the Status call for that reply runs, types the goal "Widgets and dark mode for every user". The typed goal stays.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 13,
      overview: overview({
        head: { title: '2.5 release', description: 'Notes 2.5 is live in the store' },
        subjects: [
          subject('s1', 'done', 'Sync conflicts', 'merged', -90),
          subject('s2', 'done', 'Store release', 'live in the store', -20),
        ],
        lastLookAt: minutes(-10),
        goal: { ...goal('Notes 2.5 in the store', -120), metAt: minutes(-20) },
        milestones: [
          milestone('m1', 'done', 'Sync fixed', '', -90),
          milestone('m2', 'done', '2.5 published', 'live in the store', -20),
        ],
        nextMilestoneId: 3,
        serves: { s1: 'm1', s2: 'm2' },
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'notes 2.5 is live in the store',
      focusMatch: '2\\.5',
      goal: {
        text: 'Notes 2.5 in the store',
        match: '2\\.5',
        milestones: [
          { id: 'ms-sync', name: 'Sync fixed', match: 'sync', state: 'done' },
          { id: 'ms-pub', name: '2.5 published', match: 'publish|2\\.5', state: 'done' },
        ],
      },
      pieces: [
        piece({ id: 'sync', names: ['Sync conflicts'], match: 'conflict', state: 'done', stands: 'merged' }),
        piece({
          id: 'store',
          names: ['Store release'],
          match: 'store|release',
          state: 'done',
          stands: 'live in the store',
        }),
      ],
    },
  },
  steps: [
    {
      label: 'The person asks for 2.6, and types a goal while the Status call runs',
      at: 10,
      call: {
        kind: 'reply',
        person: 'Next is 2.6: get home screen widgets and a dark theme into the TestFlight beta.',
        activity: ['Read src/widgets/README.md', 'Edited src/widgets/today.tsx'],
        reply:
          'Plan for 2.6: a Notes widget, a dark theme, then a TestFlight build. I started the Notes widget: it lists the three newest notes.',
      },
      eventsDuringCall: [{ press: 'type', text: 'Widgets and dark mode for every user' }],
      facts: {
        focus: 'getting widgets and a dark theme into the 2.6 beta',
        focusMatch: '2\\.6|widget|dark',
        goalClear: { text: 'Widgets and dark mode for every user', match: 'every user' },
        goal: { text: 'Widgets and dark mode for every user', match: 'every user', milestones: [] },
        pieces: [
          piece({
            id: 'widget',
            names: ['Notes widget'],
            match: 'widget',
            state: 'working',
            stands: 'lists newest notes',
          }),
          piece({ id: 'dark', names: ['Dark theme'], match: 'dark|theme', state: 'queued', stands: 'not started' }),
        ],
      },
      targets: ['goal-when-clear'],
    },
  ],
}
