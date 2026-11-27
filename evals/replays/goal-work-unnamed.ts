import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { goal, milestone, NO_FACTS, overview, piece, subject } from './builders'

/**
 * New work the goal plainly needs, though no milestone names its outcome: a frozen progress bar the person says must
 * work before the demo. It belongs to a milestone of the goal, an old one opened again or a new one, never to Other
 * work, which holds only work the goal does not need (#389).
 */
export const goalWorkUnnamed: Replay = {
  name: 'goal-work-unnamed',
  about:
    'An inferred goal "Import ready to demo", with "CSV import works" done and "Demo script written" working. The person finds that the progress bar freezes on the big sample file, and says it has to work before the demo. The agent starts the fix.',
  hasLedgerCalls: false,
  isShort: true,
  start: {
    ledger: {
      turn: 14,
      items: [],
      overview: overview({
        head: { title: 'Import demo', description: 'Preparing the import demo' },
        subjects: [
          subject('s1', 'done', 'CSV import', 'reads every sample file', -60),
          subject('s2', 'working', 'Demo script', 'outline drafted, steps left', -20),
        ],
        lastLookAt: minutes(-15),
        goal: goal('Import ready to demo', -3 * 60),
        milestones: [
          milestone('m1', 'done', 'CSV import works', 'reads every sample file', -60),
          milestone('m2', 'working', 'Demo script written', 'outline drafted', -20),
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
        match: 'import|demo',
        milestones: [
          { id: 'ms-csv', name: 'CSV import works', match: 'csv', state: 'done' },
          { id: 'ms-script', name: 'Demo script written', match: 'script', state: 'working' },
        ],
      },
      pieces: [
        piece({ id: 'csv', names: ['CSV import'], match: 'csv', state: 'done', stands: 'reads every sample file' }),
        piece({
          id: 'script',
          names: ['Demo script'],
          match: 'script',
          state: 'working',
          stands: 'outline drafted, steps left',
          serves: 'ms-script',
        }),
      ],
    },
  },
  steps: [
    {
      label: 'The person finds the progress bar freezes on the big file, and says it has to work before the demo',
      at: 0,
      call: {
        kind: 'reply',
        person:
          'While rehearsing, the progress bar froze on the big sample file and the import looked dead. That has to work before the demo, so fix it first.',
        activity: ['Read src/import/progress.ts', 'Edited src/import/progress.ts'],
        reply:
          "The bar froze because the import reported progress only once per 10,000 rows, and the big file's chunks are smaller than that. It now reports every 500 rows. I haven't tried it on the big file yet.",
      },
      facts: {
        milestones: [
          { id: 'ms-csv', alsoRight: ['working'] },
          { id: 'ms-script', alsoRight: ['queued'] },
        ],
        pieces: [
          { id: 'script', alsoRight: ['queued'] },
          piece({
            id: 'progress',
            names: ['Import progress bar', 'Progress bar freeze'],
            match: 'progress|freez',
            state: 'working',
            stands: 'reports every 500 rows, not tried on the big file',
            serves: 'ms-progress',
          }),
        ],
      },
      targets: ['serves-linked'],
    },
  ],
}
