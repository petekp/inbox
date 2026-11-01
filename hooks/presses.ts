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
