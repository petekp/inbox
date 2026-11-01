import type { Replay } from '../status-replay'
import { NO_FACTS, piece } from './builders'

/** A direction with no finish line, and a goal the agent wrote in its own words. Neither is the person's goal. */
export const notAGoal: Replay = {
  name: 'not-a-goal',
  about:
    "The person asks for a direction with no finish line, and the reply names a goal in the agent's own words. Nothing is proposed.",
  hasLedgerCalls: false,
  isShort: true,
  start: { ledger: {}, facts: NO_FACTS },
  steps: [
    {
      label: 'The person asks that every item on the list earn its place, and the reply states its own goal',
      at: 5,
      call: {
        kind: 'reply',
        person: 'Go through the settings list and make sure every item on the list earns its place.',
        activity: ['Read src/settings/list.ts', 'Ran: npm run usage -- settings'],
        reply:
          'Goal: every item ranked by 2.6. I went through the first half of the settings list: four of its eleven settings have had no users this year, so I marked them to cut.',
      },
      facts: {
        focus: 'pruning the settings list',
        focusMatch: 'setting',
        pieces: [
          piece({
            id: 'review',
            names: ['Settings review'],
            match: 'setting|review',
            state: 'working',
            stands: 'first half reviewed; four settings to cut',
          }),
        ],
      },
      targets: ['proposal-only-when-stated'],
    },
  ],
}
