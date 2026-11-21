import { partPt, type RowPart } from '../../core/view/row-parts'
import { DOT } from '../../core/view/rows'
import { lineMotion } from './tab-line-steps'
import { Sep } from './tab-parted'
import { partAttrs } from './tab-part-gap'

/** The lines above an open row's buttons: its fold's note, its press note and its press error. */
type StatusText = { foldNote: string | null; note: string | null; error: string | null }

/** A row's status block as a stepped line, keyed by the row's id. */
export type StatusLine = { id: string; text: StatusText }

export const statusMotion = (id: string) => `status-${id}`

/** Row `id`'s status block, or none while it has no lines. */
export function statusLinesOf(id: string, text: StatusText): StatusLine[] {
  const isEmpty = text.foldNote === null && text.note === null && text.error === null

  return isEmpty ? [] : [{ id, text }]
}

/**
 * A row's status block over its part `under`. It comes and goes at `data-rest` px, the space the part under it gains
 * once the block is gone, so that part ends where it rests without the block.
 */
export function StatusLines({
  line,
  above,
  under,
}: {
  line: StatusLine
  above: RowPart
  under: Exclude<RowPart, 'title'>
}) {
  const { foldNote, note, error } = line.text

  return (
    <div
      class="status-lines"
      data-rest={partPt(above, under) - partPt('status', under)}
      {...lineMotion(statusMotion(line.id))}
      {...partAttrs(above, 'status')}
    >
      {foldNote ? (
        <div class="muted parted">
          {foldNote.split(DOT).map((part, n) => (
            <span class="part">
              {n > 0 ? <Sep /> : null}
              {part}
            </span>
          ))}
        </div>
      ) : null}
      {note ? <div class="muted">{note}</div> : null}
      {error ? <div class="tone-error">{error}</div> : null}
    </div>
  )
}
