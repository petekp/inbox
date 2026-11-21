import type { Child } from '../../types'

const MIN = 60_000

/** A delegate under no subject that finished `hoursAgo` hours ago, after an hour's work. */
export function finishedDelegate(now: number, id: string, name: string, hoursAgo: number, summary?: string): Child {
  const endedAt = now - hoursAgo * 60 * MIN
  const startedAt = endedAt - 60 * MIN

  return {
    id,
    ref: id,
    kind: 'delegate',
    name,
    subjectId: null,
    startedAt,
    endedAt,
    lastActivityAt: startedAt,
    delegateState: 'finished',
    summary,
  }
}
