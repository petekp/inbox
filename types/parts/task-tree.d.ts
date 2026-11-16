export type TaskStatus = 'working' | 'queued' | 'waits-on-other' | 'done' | 'dropped'

export type TaskHistoryEvent = {
  at: number
  source: string
  kind: 'created' | 'updated' | 'moved' | 'completed' | 'note' | 'imported'
  detail?: string
}

export type TaskOwner = {
  agent: string
  machine: string
}

export type TaskOwnerState = 'working' | 'idle' | 'blocked' | 'done'

/** The first time this host observed the owner in its current non-working state. */
export type TaskOwnerFact = { state: TaskOwnerState; since: number }

export type TaskOwnerFacts = Record<string, TaskOwnerFact>

export type TaskProgressSegments = {
  total: number
  done: number
  working: number
  stalled: number
  waiting: number
  queued: number
}

export type TaskLinks = {
  pr?: string
  issue?: string
  owner?: TaskOwner
}

export type TaskPrState = 'OPEN' | 'CLOSED' | 'MERGED'

export type TaskFactWarning =
  | { taskId: string; pr: string; message: 'PR merged, task still open' | 'PR closed without merge' }
  | { taskId: string; owner: TaskOwner; message: 'Owner idle 15m+' | 'Owner finished, task open' }

export type TaskNode = {
  id: string
  parentId: string | null
  status: TaskStatus
  weight: number
  title: string
  detail: string
  notes: string[]
  createdAt: number
  updatedAt: number
  history: TaskHistoryEvent[]
  goalId?: string
  streamId?: string
  mergedIntoId?: string
  /** The linked PR whose merge fact completed this task, retained if bounded history rolls over. */
  prMergedApplied?: string
  links?: TaskLinks
}

export type TaskTree = TaskNode[]
