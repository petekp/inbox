export function isPrRowId(id: string): boolean {
  return id.startsWith('pr:') || id.includes(' ')
}

export type RowPress =
  | { action: 'answer'; id: string; option: string }
  | { action: 'type'; id: string; text: string }
  | {
      action:
        | 'explain'
        | 'show-explanation'
        | 'compare'
        | 'done'
        | 'dismiss'
        | 'address'
        | 'issue'
        | 'discuss'
        | 'undo'
        | 'discard'
      id: string
    }
  | { action: 'step'; id: string; step: number; label: string }
  /** Opens the page its host wrote with every option's preview side by side. */
  | { action: 'previews'; id: string }
  /** Removes the Status page's goal. `id` is `GOAL_KEYS_ID`. A typed goal is a `type` press on that id. */
  | { action: 'remove-goal'; id: string }
  /** Undo of Remove goal: brings back the goal the person removed. `id` is `GOAL_KEYS_ID`. */
  | { action: 'restore-goal'; id: string }
  /** Set on the suggested goal: makes it the goal. `id` is `GOAL_KEYS_ID`. */
  | { action: 'take-goal'; id: string }

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
