import type { FoldKind } from '../types'
import { FOLD_KINDS } from './pane-selection'
import { readKind } from './reply-parse'

const STATUS_PREFIX = 'status-'

/** A fold a press or a desktop click names: an Asks group's Closed fold, or a Status done fold by its id. */
export type FoldRef = { kind: FoldKind } | { statusId: string }

/** The key a fold's line draws under and its hover is saved by: an Asks fold's kind, or a Status fold's id after `status-`. */
export function foldKey(fold: FoldRef): string {
  return 'kind' in fold ? fold.kind : `${STATUS_PREFIX}${fold.statusId}`
}

/** The fold `key` names, or null for a key no fold draws under. */
export function foldOf(key: string): FoldRef | null {
  if (key.startsWith(STATUS_PREFIX)) return { statusId: key.slice(STATUS_PREFIX.length) }
  const kind = FOLD_KINDS.find(k => k === key)

  return kind === undefined ? null : { kind }
}

/** `list` with `value` in it while `isUnfolded`, and without it otherwise. */
export function withFold<T>(list: T[], value: T, isUnfolded: boolean): T[] {
  return list.includes(value) === isUnfolded ? list : isUnfolded ? [...list, value] : list.filter(k => k !== value)
}

/** Old builds saved the group kinds as `decide` and `do`, and the Finds tab's one fold as `finding`, now one per kind. */
export function upgradedUnfolded(saved: string[]): FoldKind[] {
  return saved.flatMap((k): FoldKind[] =>
    k === 'finding' ? ['issue', 'opportunity'] : k === 'issue' || k === 'opportunity' ? [k] : [readKind(k)],
  )
}
