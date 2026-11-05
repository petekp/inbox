import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { goal, milestone, NO_FACTS, overview, piece, subject } from './builders'

/** A met goal, and small unrelated asks that make no next goal clear: no goal is set, and the met goal stays. */
export const goalWait: Replay = {
  name: 'goal-wait',
  about:
    'The goal "Notes 2.5 in the store" is met. The person asks for a small fix and a look at a slow share sheet, which are unrelated, and no next goal is set.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 14,
      overview: {
        ...overview({
          head: { title: '2.5 release', description: 'Notes 2.5 is in the store' },
          subjects: [
            subject('s1', 'done', 'Sync conflicts', 'merged', -90),
            subject('s2', 'done', 'Store release', 'live in the store', -20),
          ],
          lastLookAt: minutes(-10),
          goal: goal('Notes 2.5 in the store', -120),
          milestones: [
            milestone('m1', 'done', 'Sync fixed', '', -90),
            milestone('m2', 'done', '2.5 published', 'live in the store', -20),
          ],
          nextMilestoneId: 3,
          serves: { s1: 'm1', s2: 'm2' },
        }),
      },
    },
    facts: {
      ...NO_FACTS,
      focus: 'notes 2.5, now in the store',
      focusMatch: '2\\.5|store',
      goal: {
        text: 'Notes 2.5 in the store',
        match: '2\\.5',
        milestones: [
          { id: 'ms-sync', name: 'Sync fixed', match: 'sync', state: 'done' },
          { id: 'ms-pub', name: '2.5 published', match: 'publish|2\\.5', state: 'done' },
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
          state: 'done',
          stands: 'live in the store',
          serves: 'ms-pub',
        }),
      ],
    },
  },
  steps: [
    {
      label: 'The person asks for a typo fix and a look at the slow share sheet',
      at: 10,
      call: {
        kind: 'reply',
        person: 'Fix the typo in the settings footer. Also, why is the share sheet so slow to open?',
        activity: ['Edited src/settings/footer.tsx', 'Read src/share/sheet.ts'],
        reply:
          'Fixed "Setings" in the footer. The share sheet loads every attachment before it opens. I am changing it to load them as they scroll into view.',
      },
      facts: {
        pieces: [
          piece({
            id: 'typo',
            names: ['Footer typo'],
            match: 'typo|footer',
            state: 'done',
            stands: 'fixed',
            alsoRight: ['working'],
          }),
          piece({
            id: 'share',
            names: ['Slow share sheet'],
            match: 'share',
            state: 'working',
            stands: 'loading attachments lazily',
          }),
        ],
      },
      targets: ['goal-only-when-clear', 'milestones-true'],
    },
  ],
}
