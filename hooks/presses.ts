export { actionId, capitalized, ISSUE_LABEL } from './press-labels'
export { baseName, openTarget } from './open-targets'
export type { PathProbe } from './open-targets'
export { stepIconKind, stepsOf } from './help-steps'
export type { HelpStep } from './help-steps'
export { isAwaitingReply, isFixSent, isFoldingPress, isHandedOff } from './last-actions'
export {
  doneWake,
  isPressConfirmed,
  markSentToAgent,
  noteText,
  refuseDoneNotification,
  withDeliveryId,
  withUnconfirmed,
} from './press-reducer'
export type { Effect } from './press-reducer'
export {
  demoAfterPress,
  demoReplied,
  demoSent,
  finishedResult,
  runLocalEffects,
  runSends,
  withResult,
} from './press-effects'
export type { DemoSent, EffectHost } from './press-effects'
export {
  isRepeatOf,
  isUndoable,
  localLast,
  offersUndo,
  pendingResult,
  recordPress,
  retryOf,
  withLasts,
} from './pressed'
export { COMPARE_PAGE_FILE } from './press-messages'
export type { AnswerMessage } from './press-messages'

export function isPrRowId(id: string): boolean {
  return id.startsWith('pr:') || id.includes(' ')
}

export type RowPress =
  | { action: 'answer'; id: string; option: string }
  | { action: 'type'; id: string; text: string }
  | {
      action: 'explain' | 'compare' | 'done' | 'dismiss' | 'address' | 'issue' | 'discuss' | 'undo' | 'discard'
      id: string
    }
  | { action: 'step'; id: string; step: number; label: string }

export type PrActionId =
  | 'thread-address'
  | 'thread-draft'
  | 'thread-open'
  | 'thread-discuss'
  | 'pr-conflicts'
  | 'pr-address-all'
  | 'pr-merge'
  | 'pr-open'
  | 'pr-refresh'
  | 'pr-dismiss'
  | 'pr-rank-again'
  | 'check-fix'
  | 'log'
