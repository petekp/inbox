import type { Replay } from './status-replay'
import { catchUpFromEmpty } from './replays/catch-up-from-empty'
import { coordinatorDay } from './replays/coordinator-day'
import { longTurn } from './replays/long-turn'
import { singleTask } from './replays/single-task'

export const REPLAYS: Replay[] = [coordinatorDay, singleTask, longTurn, catchUpFromEmpty]
