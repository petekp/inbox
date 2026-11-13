/** The attribute a Status row carries, naming the subjects it stands for, separated by spaces. */
export const SUBJECTS_ATTRIBUTE = 'data-subjects'

/**
 * The subjects of the rows whose first line is on screen: each row's box starts inside the window, which is
 * `viewHeight` tall. `subjects` is the row's `SUBJECTS_ATTRIBUTE`.
 */
export function rowsInView(rows: { subjects: string; top: number }[], viewHeight: number): string[] {
  return rows.filter(r => r.top >= 0 && r.top < viewHeight).flatMap(r => r.subjects.split(' ').filter(Boolean))
}

/** When the tab had each Status subject row on screen since its last view request, by the row's id. */
const shown = new Map<string, number>()

/** The Status subject rows `ids` are on screen at `now`. */
export function noteShownRows(ids: string[], now: number) {
  for (const id of ids) shown.set(id, now)
}

/** The rows the tab had on screen since its last view request, for the next one. The request after starts with none. */
export function takeShownRows(): Record<string, number> {
  const rows = Object.fromEntries(shown)
  shown.clear()

  return rows
}
