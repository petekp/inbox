import type { Replay } from './status-replay'
import { catchUpFromEmpty } from './replays/catch-up-from-empty'
import { coordinatorDay } from './replays/coordinator-day'
import { declinedGoal } from './replays/declined-goal'
import { goalOnBusyPage } from './replays/goal-on-busy-page'
import { longTurn } from './replays/long-turn'
import { midTurnActivity } from './replays/mid-turn-activity'
import { singleTask } from './replays/single-task'

export const REPLAYS: Replay[] = [
  coordinatorDay,
  singleTask,
  longTurn,
  catchUpFromEmpty,
  declinedGoal,
  goalOnBusyPage,
  midTurnActivity,
]
