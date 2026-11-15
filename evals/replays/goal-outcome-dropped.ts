import type { Replay } from '../status-replay'
import { STALE_GOAL_START, STALE_GOAL_STEPS } from './stale-goal'

/** The goal once the person dropped its outcome: the page shows no goal, met or not. */
const DROPPED_GOAL = {
  text: 'Notes 2.5 in the store',
  match: '2\\.5',
  milestones: [],
  isLeft: true as const,
  isDropped: true as const,
}

/**
 * The same release goal as `stale-goal`, left behind the same way, until the person drops the store release itself.
 * The goal ends, and no goal is set for 2.6, since the person named no outcome for it.
 */
export const goalOutcomeDropped: Replay = {
  name: 'goal-outcome-dropped',
  about:
    'The inferred goal "Notes 2.5 in the store", left behind as in stale-goal: the person redoes the onboarding tour and queues a share sheet hang while the crash fix merges, and the tour finishes. Then the person says 2.5 is not going to the store, since the crash fix ships inside 2.6. The goal is retired, not shown met, and no goal is set for 2.6.',
  hasLedgerCalls: false,
  start: STALE_GOAL_START,
  steps: [
    ...STALE_GOAL_STEPS,
    {
      label: 'The person drops the store release, and the share sheet work starts',
      at: 95,
      call: {
        kind: 'reply',
        person:
          'Change of plan: 2.5 is not going to the store on its own. The crash fix ships inside 2.6, so drop the 2.5 listing.',
        activity: ['Read src/share/sheet.ts', 'Ran: npm run sim -- ipad'],
        reply:
          'Noted: no 2.5 store release, and the crash fix goes out in 2.6. On the share sheet hang: the sheet waits on a thumbnail that never arrives on iPad.',
      },
      facts: {
        goal: DROPPED_GOAL,
        focus: 'fixing the share sheet hang on iPad',
        focusMatch: 'share',
        pastMatch: 'tour|onboarding',
        pieces: [{ id: 'share', state: 'working', stands: 'waits on a thumbnail on iPad' }],
      },
      targets: ['goal-left', 'goal-only-when-clear'],
    },
  ],
}
