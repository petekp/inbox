import type { Replay } from '../status-replay'
import { searchAt12, searchStart } from './long-turn'

/** The long turn's call at 12 minutes on its own, for each model: where the ranking stands, not what the agent does. */
export const midTurnActivity: Replay = {
  name: 'mid-turn-activity',
  about:
    'A mid-turn call whose activity finishes one piece and starts the next, beside the task list. The page says where the work stands, not what the agent is doing.',
  hasLedgerCalls: false,
  isShort: true,
  start: searchStart,
  steps: [
    {
      ...searchAt12,
      checkpoint: true,
      targets: ['where-it-stands', 'text-no-ids'],
      judgeUntil: { 'where-it-stands': 'the mid-turn wording follow-up' },
    },
  ],
}
