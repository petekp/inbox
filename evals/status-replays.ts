import type { Replay } from './status-replay'
import { askHoldsTwo } from './replays/ask-holds-two'
import { catchUpFromEmpty } from './replays/catch-up-from-empty'
import { catchUpShipped } from './replays/catch-up-shipped'
import { coordinatorDay } from './replays/coordinator-day'
import { removedGoal } from './replays/removed-goal'
import { goalFromWork } from './replays/goal-from-work'
import { goalMetNext } from './replays/goal-met-next'
import { goalWait } from './replays/goal-wait'
import { goalWorkLeft } from './replays/goal-work-left'
import { idleWork } from './replays/idle-work'
import { milestoneWorkDone } from './replays/milestone-work-done'
import { noGoalYet } from './replays/no-goal-yet'
import { typedGoalKept } from './replays/typed-goal-kept'
import { goalAwaitingMilestones } from './replays/goal-awaiting-milestones'
import { goalOnBusyPage } from './replays/goal-on-busy-page'
import { longTurn } from './replays/long-turn'
import { midTurnActivity } from './replays/mid-turn-activity'
import { milestoneDropped } from './replays/milestone-dropped'
import { oneTaskPlan } from './replays/one-task-plan'
import { singleTask } from './replays/single-task'
import { goalOutcomeDropped } from './replays/goal-outcome-dropped'
import { staleGoal } from './replays/stale-goal'
import { nextRelease } from './replays/next-release'

export const REPLAYS: Replay[] = [
  coordinatorDay,
  singleTask,
  longTurn,
  catchUpFromEmpty,
  removedGoal,
  goalOnBusyPage,
  midTurnActivity,
  milestoneDropped,
  catchUpShipped,
  goalAwaitingMilestones,
  askHoldsTwo,
  oneTaskPlan,
  milestoneWorkDone,
  goalMetNext,
  goalWait,
  noGoalYet,
  goalFromWork,
  goalWorkLeft,
  typedGoalKept,
  idleWork,
  staleGoal,
  goalOutcomeDropped,
  nextRelease,
]
