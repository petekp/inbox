export const VIEW_REQUEST_BYTES = 64 * 1024
export const VIEW_ENTRY_LIMIT = 256

type Preferences = { folds: string[]; collapsed: string[]; collapses: { id: string; value: string }[] }

export function viewLimitError(preferences: Preferences): string {
  const ids = [...preferences.folds, ...preferences.collapsed, ...preferences.collapses.map(entry => entry.id)]
  const tooMany = [preferences.folds, preferences.collapsed, preferences.collapses].some(
    list => list.length > VIEW_ENTRY_LIMIT,
  )
  const tooLong =
    ids.some(id => id.length === 0 || id.length > 2048) ||
    preferences.collapses.some(entry => entry.value.length > 16384)
  if (tooMany || tooLong) return 'Too many rows to fold at once.'
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      schema: '2',
      session: 's'.repeat(64),
      viewer: 'v'.repeat(100),
      since: Number.MAX_VALUE,
      folds: preferences.folds,
      collapsed: preferences.collapsed,
      collapses: preferences.collapses,
    }),
  ).byteLength
  return bytes > VIEW_REQUEST_BYTES ? 'These fold settings are too large to save.' : ''
}
