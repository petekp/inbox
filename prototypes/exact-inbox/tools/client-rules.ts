import { ROW_COPY } from '../../../core/view/rows'
export { changeFolds } from './fold-rules'
export { helpLegend } from './help-rules'
export { advanceMotion } from './motion-rules'
export { advanceSelection } from './selection-rules'
import { pendingResult } from '../../../core/view/pressed'
import { finishedResult } from '../../../core/runtime/press-effects'
import { feedbackText } from '../../../core/view/feedback'
import type { Effect } from '../../../core/view/press-reducer'
import type { formatLocal as FormatLocal } from '../client-shared'

export const formatLocal: typeof FormatLocal = ([sequence, session, row, version, effects, errors, confirmsOpens]) => {
  const planned: Extract<Effect, { kind: 'copy' | 'open' }>[] = effects.map(effect => {
    if (effect.kind === 'copy')
      return { kind: 'copy', text: effect.value, name: effect.name, isCommand: effect.isCommand }
    if (effect.kind === 'open') return { kind: 'open', target: effect.value, name: effect.name }
    throw new Error('Unsupported local effect.')
  })
  const requested = planned.map((effect, index) => effect.kind === 'open' && !confirmsOpens && !errors[index])
  const confirmed = planned.filter((_effect, index) => !requested[index])
  const result = finishedResult(
    pendingResult(confirmed, 0),
    errors.filter((_error, index) => !requested[index]).map(error => error || null),
    0,
  )
  return {
    sequence,
    session,
    row,
    version,
    text: [
      confirmed.length ? feedbackText({ is: 'local', result }, 'codex') : '',
      ...planned.flatMap((effect, index) => (requested[index] ? [`Requested opening ${effect.name}`] : [])),
    ]
      .filter(Boolean)
      .join(' · '),
    pending: false,
    failed: result.state === 'failed',
  }
}

import { shownTabs } from '../../../core/view/tabs'
import { COLLAPSE_KEY, UNDO_KEY, FOLD_ALL_KEY } from '../../../core/view/help'
import type { Result } from '../app.contract'

export function loadKeys(): Result<'loadKeys'> {
  return {
    sendLabel: ROW_COPY.send,
    discardLabel: ROW_COPY.discard,
    collapse: COLLAPSE_KEY,
    undo: UNDO_KEY,
    foldAll: FOLD_ALL_KEY,
    tabs: shownTabs().map(tab => ({
      key: tab.hotkey,
      tab: tab.id === 'overview' ? 'status' : tab.id === 'needsYou' ? 'asks' : tab.id,
    })),
  }
}
