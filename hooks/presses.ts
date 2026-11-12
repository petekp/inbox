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
  /** Removes the Status page's goal. `id` is `GOAL_KEYS_ID`. A typed goal is a `type` press on that id. */
  | { action: 'remove-goal'; id: string }
  /** Undo of Remove goal: brings back the goal the person removed. `id` is `GOAL_KEYS_ID`. */
  | { action: 'restore-goal'; id: string }

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
  | 'pr-clear-finished'
  | 'check-fix'
  | 'check-rerun'
  | 'log'
