import type { ComponentChildren } from 'preact'
import { ActionButton, Icon } from './row-actions'
import { cancelledMarkShape } from '../../hooks/marks'
import { CLOSED_MARKS, DOT, markedFeedbackText, rowResultMark, rowFeedbackText, SETTLED_MS } from '../../hooks/view'
import type { BannerView, StatusTone, ResultMark, LegendEntry, RowView } from '../../hooks/view'
import { parseInline } from '../../hooks/inline'
import { isUndoLeft } from './settle'
import { errors, notes, copies } from './tab-state'
import type { Tone, Key, Row } from './tab-state'

/** An Asks or Finds row's mark: its result's, in the mark column. An open row has none. */
export function resultHandle(r: RowView): Pick<Row, 'handle' | 'handleTone' | 'isHandleRunning'> {
  const mark = rowResultMark(r)

  return mark
    ? { handle: mark.text, isHandleRunning: mark.isRunning, ...(mark.tone ? { handleTone: mark.tone } : {}) }
    : { handle: '' }
}

export function KeyButton({ k }: { k: Key }) {
  return <ActionButton action={k} isBlocked={() => false} />
}

export function feedbackLabel(row: Row): string | null {
  const f = row.feedback
  if (!f) return null

  return row.view ? rowFeedbackText(row.view, 'codex') : markedFeedbackText(f, row.isMarkDone ?? false, 'codex')
}

export function noteOf(id: string): string | null {
  const n = notes.get(id)

  return n && Date.now() - n.at < SETTLED_MS ? n.text : null
}

export function isFeedbackShown(row: Row): boolean {
  return !errors.has(row.id) && noteOf(row.id) === null && !copies.has(row.id)
}

/** Starts every running mark's pulse at the page's time origin, so a mark drawn at a later poll moves in step. */
export function pulseInStep(el: HTMLElement | null) {
  for (const a of el?.getAnimations?.() ?? []) a.startTime = 0
}

const TONE_CLASS: Record<NonNullable<StatusTone>, string> = {
  needsYou: 'tone-needsYou',
  done: 'done',
}

export function markClassOf(tone: StatusTone, isRunning: boolean): string {
  return ['mark', tone ? TONE_CLASS[tone] : null, isRunning ? 'running' : null].filter(Boolean).join(' ')
}

/** A mark's text, or its shape where the system font draws it like another mark. */
export function MarkGlyph({ text }: { text: string }) {
  const shape = text === CLOSED_MARKS.lapsed ? cancelledMarkShape(4) : null

  return shape === null ? (
    <>{text}</>
  ) : (
    <svg
      class="mark-shape"
      viewBox="0 0 8 8"
      role="img"
      aria-label={text}
      dangerouslySetInnerHTML={{ __html: shape }}
    />
  )
}

export function ResultMarkView({ mark }: { mark: ResultMark }) {
  return (
    <span class={mark.isRunning ? 'mark running' : 'mark'} ref={mark.isRunning ? pulseInStep : undefined}>
      <MarkGlyph text={mark.text} />
    </span>
  )
}

export function legendMarkClass(m: LegendEntry): string {
  const tone = m.tone === 'needsYou' ? 'tone-needsYou' : m.tone
  return ['mark', tone, m.isRunning ? 'running' : null].filter(Boolean).join(' ')
}

/** A Finds group's title hangs its kind's mark in the mark column, since its rows draw none. */
export function GroupTitle({
  title,
  count,
  mark,
}: {
  title: string
  count: number
  mark?: { mark: string; tone: Tone }
}) {
  return (
    <div class="group-title">
      {mark ? <span class={`group-mark ${mark.tone}`}>{mark.mark}</span> : null}
      <b>{title}</b>
      {count > 0 ? (
        <span class="count">
          {DOT}
          {count}
        </span>
      ) : null}
    </div>
  )
}

/** Preact escapes each span's text, so no HTML gets through. */
export function inlineHtml(text: string) {
  return parseInline(text).map(s => {
    let node: ComponentChildren = s.code ? <code>{s.text}</code> : s.text
    if (s.italic) node = <i>{node}</i>
    if (s.bold) node = <b>{node}</b>
    if (s.strike) node = <s>{node}</s>
    return s.link ? (
      <>
        <u>{node}</u>
        <span class="muted"> {s.link}</span>
      </>
    ) : (
      node
    )
  })
}

/**
 * Undo on a settled row or PR, for `SETTLED_MS` from `start` while `canUndo`, or while its Undo is out. Once Undo
 * ends, a row that offered it keeps Undo's width, unseen, so its title keeps its wrap.
 */
export function UndoPlace({
  start,
  isUndoing,
  canUndo,
  offersUndo,
  onUndo,
}: {
  start: number
  isUndoing: boolean
  canUndo: boolean
  offersUndo: boolean
  onUndo: () => void
}) {
  const isShown = canUndo && (isUndoing || isUndoLeft(start, Date.now()))
  if (!isShown)
    return offersUndo ? (
      <button type="button" class="key undo spent" disabled tabIndex={-1} aria-hidden="true">
        <Icon name="undo" />
        Undo
      </button>
    ) : null

  return (
    <button type="button" class={isUndoing ? 'key undo undoing' : 'key undo'} disabled={isUndoing} onClick={onUndo}>
      {/* The delay is set once, when it is drawn: the animation keeps its own time after that. */}
      <span
        key={start}
        class={isUndoing ? 'time-left paused' : 'time-left'}
        style={{ animationDuration: `${SETTLED_MS}ms` }}
        ref={el => {
          if (el && !el.style.animationDelay) el.style.animationDelay = `-${Math.max(0, Date.now() - start)}ms`
        }}
      />
      <Icon name="undo" />
      Undo
    </button>
  )
}

export function Banner({ banner, label, press }: { banner: BannerView; label?: string; press?: () => void }) {
  return (
    <div class={`banner banner-${banner.tone}`} role={banner.tone === 'notice' ? 'status' : 'alert'}>
      <span>
        <strong class="lead">{banner.lead}</strong>
        {banner.body ? ` ${banner.body}` : null}
      </span>
      {label && press ? (
        <button type="button" class="key" onClick={press}>
          {label}
        </button>
      ) : null}
    </div>
  )
}
