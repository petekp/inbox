import type { Replay } from './status-replay'
import { askHoldsTwo } from './replays/ask-holds-two'
import { catchUpFromEmpty } from './replays/catch-up-from-empty'
import { catchUpShipped } from './replays/catch-up-shipped'
import { coordinatorDay } from './replays/coordinator-day'
import { declinedGoal } from './replays/declined-goal'
import { goalAwaitingMilestones } from './replays/goal-awaiting-milestones'
import { goalOnBusyPage } from './replays/goal-on-busy-page'
import { longTurn } from './replays/long-turn'
import { midTurnActivity } from './replays/mid-turn-activity'
import { milestoneDropped } from './replays/milestone-dropped'
import { oneTaskPlan } from './replays/one-task-plan'
import { singleTask } from './replays/single-task'

export const REPLAYS: Replay[] = [
  coordinatorDay,
  singleTask,
  longTurn,
  catchUpFromEmpty,
  declinedGoal,
  goalOnBusyPage,
  midTurnActivity,
  milestoneDropped,
  catchUpShipped,
  goalAwaitingMilestones,
  askHoldsTwo,
  oneTaskPlan,
]
