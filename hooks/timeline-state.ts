export function upgradedTimelineSelection(id: unknown): string | null {
  return typeof id === 'string' && id.length > 0 ? id : null
}

export function upgradedTimelineFolded(folded: unknown): string[] {
  return Array.isArray(folded)
    ? [...new Set(folded.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    : []
}
