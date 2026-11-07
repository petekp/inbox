import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { goal, milestone, NO_FACTS, overview, piece, subject } from './builders'

/** A goal the person typed, with its work queued, holds when the person starts other work with a finish line. */
export const typedGoalKept: Replay = {
  name: 'typed-goal-kept',
  about:
    'The person typed the goal "Import ready to demo", and its work is queued. The person asks for dark mode in 3.1 first, and the typed goal stays.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 5,
      overview: overview({
        head: { title: 'Notes import', description: 'Getting the import ready to demo' },
        subjects: [
          subject('s1', 'working', 'Evernote import', 'notes and tags import', -30),
          subject('s2', 'queued', 'Demo script', 'not started', -30),
        ],
        lastLookAt: minutes(-10),
        goal: goal('Import ready to demo', -60, 'typed'),
        milestones: [
          milestone('m1', 'working', 'Import works', '', -60),
          milestone('m2', 'queued', 'Demo run-through', '', -60),
        ],
        nextMilestoneId: 3,
        serves: { s1: 'm1', s2: 'm2' },
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'getting the import ready to demo',
      focusMatch: 'import|demo',
      goal: {
        text: 'Import ready to demo',
        match: 'import',
        milestones: [
          { id: 'ms-import', name: 'Import works', match: 'import', state: 'working', alsoRight: ['queued'] },
          { id: 'ms-demo', name: 'Demo run-through', match: 'demo', state: 'queued' },
        ],
      },
      pieces: [
        piece({
          id: 'import',
          names: ['Evernote import'],
          match: 'evernote',
          state: 'working',
          stands: 'notes and tags import',
          serves: 'ms-import',
          alsoRight: ['queued'],
        }),
        piece({
          id: 'demo',
          names: ['Demo script'],
          match: 'demo',
          state: 'queued',
          stands: 'not started',
          serves: 'ms-demo',
        }),
      ],
    },
  },
  steps: [
    {
      label: 'The person asks for dark mode in 3.1 first',
      at: 10,
      call: {
        kind: 'reply',
        person:
          'Put the import on hold. First get dark mode into 3.1 for the store: theme colors, then the settings toggle.',
        activity: ['Edited src/theme/colors.ts'],
        reply: 'The import waits. Dark theme colors are drafted for the note list. The settings toggle comes next.',
      },
      facts: {
        focus: 'getting dark mode into 3.1',
        focusMatch: 'dark|3\\.1|theme',
        pieces: [
          { id: 'import', state: 'queued', stands: 'on hold' },
          piece({
            id: 'colors',
            names: ['Dark theme colors'],
            match: 'color',
            state: 'working',
            stands: 'note list drafted',
            serves: 'none',
          }),
          piece({
            id: 'toggle',
            names: ['Dark mode toggle'],
            match: 'toggle',
            state: 'queued',
            stands: 'not started',
            serves: 'none',
          }),
        ],
      },
      targets: ['milestones-true'],
    },
  ],
}
