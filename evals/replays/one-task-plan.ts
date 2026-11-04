import type { Replay } from '../status-replay'
import { NO_FACTS, piece } from './builders'

/** One small task whose plan has three steps. The steps are not parts the person would name, so it stays one subject. */
export const oneTaskPlan: Replay = {
  name: 'one-task-plan',
  about:
    'The person asks for one small change, and the agent plans it in three steps: make it, test it, note it in the changelog. The page shows one subject.',
  hasLedgerCalls: false,
  start: { ledger: {}, facts: NO_FACTS },
  steps: [
    {
      label: 'The person asks for a tooltip on the Export button. The agent plans three steps and makes the tooltip.',
      at: 0,
      call: {
        kind: 'reply',
        person: 'Add a tooltip to the Export button that says which formats it supports.',
        activity: ['Read src/ui/export-button.tsx', 'Edited src/ui/export-button.tsx'],
        reply:
          'Plan: add the tooltip to the Export button, add a test for it, and note it in the changelog. The tooltip is in: hovering Export now shows "CSV, PDF or Markdown".',
      },
      facts: {
        focus: 'adding a tooltip to the Export button',
        focusMatch: 'tooltip|export',
        pieces: [
          piece({
            id: 'tooltip',
            names: ['Export tooltip'],
            match: 'tooltip|export|test|changelog',
            state: 'working',
            stands: 'shows the formats on hover',
          }),
        ],
      },
      targets: ['piece-once', 'open-pieces-kept'],
    },
  ],
}
