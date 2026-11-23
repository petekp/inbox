import { Icon, RowActions } from './row-actions'
import { seenSubjectIds, STATUS_TEXT_LINES, WAS_PREFIX } from '../../core/view/status-page'
import { mergedLine, textLevelOf, WAS_LEVEL } from '../../core/view/status-page-parts'
import { GOAL_KEYS_ID, statusKeyPlan } from '../../core/view/status-keys'
import { COUNTS_GAP, COUNTS_LABEL, countWords, unfoldedRows } from '../../core/view/status-folds'
import { statusRowPads } from '../../core/view/status-gaps'
import type { StatusKey } from '../../core/view/status-keys'
import type { StatusRow } from '../../core/view/status-page'
import { closingFolds, tabState } from './tab-state'
import type { Key } from './tab-state'
import { NameLine, nameClassOf } from './tab-status-name'
import { chevronOf, isParentFolded, ParentName, toggleParentFold } from './tab-status-fold'
import { SUBJECTS_ATTRIBUTE } from './tab-shown'
import { clickFold, foldMotion, toggleStatusFold } from './tab-fold-all'
import { dispatch, pressRow } from './tab-ui'
import { outOn } from './tab-press'
import { pulseInStep, markClassOf, MarkGlyph } from './tab-parts'
import { connectorClass, connectorMotion, lineMotion } from './tab-line-steps'

let measuring: CanvasRenderingContext2D | null | undefined

/** Writes a subject's merged line into `el`, cut at a phrase to the one line `el` has room for. */
export function fitMergedLine(el: HTMLElement | null, merged: string) {
  if (!el) return
  measuring ??= document.createElement('canvas').getContext('2d')
  const measure = measuring
  if (measure) measure.font = getComputedStyle(el).font
  el.textContent = mergedLine(merged, text => !measure || measure.measureText(text).width <= el.clientWidth)
}

/** Opens the goal's field with `text` in it. */
const openGoalField = (text: string) => dispatch([{ type: 'open-field', id: GOAL_KEYS_ID, seed: text }])

/** A Status key as a tab key. Remove goal draws out while the goal's press is on its way. */
function statusKey({ press, label, emphasis, kind }: StatusKey): Key {
  if (press.action === 'show-ask')
    return { label, emphasis, run: by => dispatch([{ type: 'show-ask', id: press.askId, by }]) }
  if (press.action === 'toggle-fold') return { label, emphasis, run: () => toggleStatusFold(press.foldId) }
  if (press.action === 'toggle-collapse') return { label, emphasis, run: () => toggleParentFold(press.id) }
  if (press.action === 'type-goal') return { label, emphasis, run: () => openGoalField(press.text) }

  return {
    label,
    emphasis,
    ...(outOn(GOAL_KEYS_ID) === null ? {} : { isOut: true }),
    run: by => pressRow({ action: press.action, id: GOAL_KEYS_ID }, by, { pending: null, kind }),
  }
}

/** A row's depth, which the Status CSS reads to step the row in and to place its tree line. */
const depthStyle = (row: StatusRow) => ({ '--depth': row.depth })

/** A row's padding as the Status CSS reads it. */
export type RowPad = Record<string, string>

const px = (pt: number) => `${pt}px`

/**
 * Each row's padding: half the gap `statusGaps` sets above it and below it. A part also gets the padding of the rows
 * beside it, which the space above and below its rule counts.
 */
export function rowPads(rows: StatusRow[], pads = statusRowPads(rows)): RowPad[] {
  return pads.map((p, n) => {
    const own = { '--status-row-pad': px(p.above), '--status-row-pad-below': px(p.below) }
    const above = pads[n - 1]
    const below = pads[n + 1]
    if (rows[n]?.kind !== 'part') return own

    return {
      ...own,
      ...(above ? { '--row-above-pad': px(above.below) } : {}),
      ...(below ? { '--row-below-pad': px(below.above) } : {}),
    }
  })
}

/**
 * A subject's tree line runs down while its rows show, and while they leave or enter as the person folds or opens it.
 * `under` is the motion keys of the rows drawn under it, which a done fold's rows, drawn with their list, leave out.
 */
function subjectConnector(row: Extract<StatusRow, { kind: 'subject' }>, under: string[] | undefined): string | null {
  if (!row.hasChildren) return null
  if (under !== undefined && under.length > 0) return connectorClass(connectorMotion(under))

  return isParentFolded(row.id) ? null : ''
}

export function StatusLine({
  row,
  motion,
  under,
  pad,
}: {
  row: StatusRow
  motion?: string
  under?: string[]
  pad?: RowPad | undefined
}) {
  const rowStyle = { ...depthStyle(row), ...pad }
  if (row.kind === 'subject') {
    const connector = subjectConnector(row, under)
    const merged = row.merged
    const keys = statusKeyPlan(row).map(statusKey)

    return (
      <div
        class={['row', connector === null ? '' : 'has-children', connector ?? ''].filter(Boolean).join(' ')}
        style={rowStyle}
        {...{ [SUBJECTS_ATTRIBUTE]: row.id }}
        {...lineMotion(motion)}
      >
        <span class={markClassOf(row.tone, row.isRunning)} ref={row.isRunning ? pulseInStep : undefined}>
          <MarkGlyph text={row.mark} />
        </span>
        <div class="content tight">
          <ParentName id={row.id} foldCount={row.foldCount} class={nameClassOf(row, 'plain')}>
            <NameLine name={row.name} stall={row.stall} chevron={chevronOf(row)} />
          </ParentName>
          {row.waitsOn ? (
            <div class="tone-needsYou clamp" style={{ '--lines': STATUS_TEXT_LINES }}>
              {row.waitsOn}
            </div>
          ) : null}
          {row.text ? (
            <div class={`${textLevelOf(row)} clamp`} style={{ '--lines': STATUS_TEXT_LINES }}>
              {row.text}
            </div>
          ) : null}
          {merged ? (
            <div
              class="outcome muted clamp"
              style={{ '--lines': STATUS_TEXT_LINES }}
              ref={el => fitMergedLine(el, merged)}
            />
          ) : null}
          {row.was ? (
            <div class={`${WAS_LEVEL} clamp`} style={{ '--lines': STATUS_TEXT_LINES }}>
              {WAS_PREFIX}
              {row.was}
            </div>
          ) : null}
          {keys.length > 0 ? <RowActions keys={keys} more={[]} reply={null} isBlocked={() => false} /> : null}
        </div>
      </div>
    )
  }
  if (row.kind === 'child')
    return (
      <div class={row.branch ? `row child branch-${row.branch}` : 'row'} style={rowStyle} {...lineMotion(motion)}>
        <span class={markClassOf(row.tone, row.isRunning)} ref={row.isRunning ? pulseInStep : undefined}>
          <MarkGlyph text={row.mark} />
        </span>
        <div class="content tight">
          <div class={nameClassOf(row, 'muted')}>
            <NameLine name={row.name} stall={null} />
          </div>
          {row.text ? (
            <div class={`${textLevelOf(row)} clamp`} style={{ '--lines': STATUS_TEXT_LINES }}>
              {row.text}
            </div>
          ) : null}
        </div>
      </div>
    )
  if (row.kind === 'more')
    return (
      <div class={row.branch ? `row child branch-${row.branch}` : 'row'} style={rowStyle} {...lineMotion(motion)}>
        <span class="mark" />
        <div class="content tight muted">{row.text}</div>
      </div>
    )
  if (row.kind === 'done-fold' || row.kind === 'counts') {
    const isUnfolded = tabState.ui.statusUnfolded.includes(row.id)
    const fold = foldMotion(row.id)
    const chevron = <Icon name={isUnfolded ? 'down' : 'right'} />
    const doneWords = row.kind === 'done-fold' ? row.text.split(' ') : []

    return (
      <>
        <div class="row fold-row" style={rowStyle} {...lineMotion(motion)}>
          <button
            type="button"
            class="fold"
            data-fold={fold}
            onClick={e => clickFold(e, isUnfolded, () => toggleStatusFold(row.id))}
          >
            {row.kind === 'counts' ? (
              row.counts.map((c, n) => {
                const isLast = n === row.counts.length - 1
                const unit = (
                  <>
                    <span class={markClassOf(c.tone, false)}>
                      <MarkGlyph text={c.mark} />
                    </span>
                    {countWords(c)}
                    {isLast ? chevron : null}
                  </>
                )

                return (
                  <span key={n}>
                    {n === 0 ? COUNTS_LABEL : null}
                    <span class={isLast ? 'fold-end' : undefined}>{unit}</span>
                    {isLast ? null : COUNTS_GAP}
                  </span>
                )
              })
            ) : (
              <>
                {doneWords.slice(0, -1).join(' ')}
                {doneWords.length > 1 ? ' ' : null}
                <span class="fold-end">
                  {doneWords.at(-1)}
                  {chevron}
                </span>
              </>
            )}
          </button>
        </div>
        {isUnfolded || closingFolds.has(fold) ? (
          <div class="fold-rows" data-motion={`closed-${fold}`}>
            <FoldRows rows={unfoldedRows(row.rows, () => false, isParentFolded)} />
          </div>
        ) : null}
      </>
    )
  }
  if (row.kind === 'part')
    return (
      <div class="row part-line" style={pad} {...lineMotion(motion)}>
        <div class={row.isTitle ? 'part-rule part-title' : 'part-rule'}>{row.text}</div>
        {row.description ? <div class="muted part-description">{row.description}</div> : null}
      </div>
    )
  const subjects = seenSubjectIds(row)

  return (
    <div
      class="row"
      style={rowStyle}
      {...(subjects.length > 0 ? { [SUBJECTS_ATTRIBUTE]: subjects.join(' ') } : {})}
      {...lineMotion(motion)}
    >
      <span class={markClassOf(row.tone, false)}>
        <MarkGlyph text={row.mark} />
      </span>
      <div class={`content tight ${nameClassOf(row, 'muted')}`}>{row.text}</div>
    </div>
  )
}

/** The rows a done fold opens to, each padded by its neighbors. */
function FoldRows({ rows }: { rows: StatusRow[] }) {
  const pads = rowPads(rows)

  return (
    <>
      {rows.map((r, n) => (
        <StatusLine key={r.id} row={r} pad={pads[n]} />
      ))}
    </>
  )
}

export function Keys({ keys }: { keys: StatusKey[] }) {
  return keys.length > 0 ? (
    <RowActions keys={keys.map(statusKey)} more={[]} reply={null} isBlocked={() => false} />
  ) : null
}
