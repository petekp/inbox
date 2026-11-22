import { inputOf, RowActions } from './row-actions'
import type { RowPart } from '../../core/view/row-parts'
import { partAttrs } from './tab-part-gap'
import { closedTitleTone, DOT, settledMark, fieldExit, settledLabel, shortAgo } from '../../core/view/rows'
import { entryId } from '../../core/view/action-plan'
import { isRowTab } from '../../core/view/tabs'
import { feedbackText, feedbackTone, hasAge, isStatusUnderActions, type FeedbackTone } from '../../core/view/feedback'
import type { RowView } from '../../core/view/rows'
import { TAB_OF } from './arrivals'
import { closedTitleClock, newRowIn } from '../../core/view/arrivals'
import { newRowsOf } from '../../core/view/ui-controller-tabs'
import type { InputKind } from '../../core/view/ui-controller-types'
import type { Group } from './arrivals'
import type { TabView as View } from './core'
import { drawsPanel, stepRow } from '../../core/view/row-motion'
import type { RowTarget, RowTrack } from '../../core/view/row-motion'
import { tabState, SENDING, copies, entering, drawnRows } from './tab-state'
import type { Key, Row, Entry, Lists } from './tab-state'
import { reducedMotion } from './tab-motion'
import { dispatch, drawnTab, errorOf, isGuarded, openRowId, pressRow } from './tab-ui'
import { isUndoing, outOn, outPending } from './tab-press'
import { listsOf, pressTitle, shownSettled } from './tab-rows'
import { stepPrs } from './tab-pr-steps'
import type { DrawnPrs } from './tab-pr-steps'
import { stepStatus } from './tab-status-steps'
import { bannerMotion, lineMotion, stepLines } from './tab-line-steps'
import type { BannerLine, TextLine } from './tab-line-steps'
import { tabBanners } from './tab-chrome'
import type { DrawnStatus } from './tab-status-steps'
import {
  feedbackLabel,
  noteOf,
  isFeedbackShown,
  markClassOf,
  MarkGlyph,
  pulseInStep,
  ResultMarkView,
  UndoPlace,
} from './tab-parts'
import { TitleTint } from './tab-title-tint'
import { StatusLines, statusLinesOf, statusMotion, type StatusLine } from './tab-status-part'
import { Sep } from './tab-parted'

const LIST_OF = { question: 'questions', task: 'tasks', finding: 'findings' } as const

export function stepLists(v: View): {
  lists: Lists
  prs: DrawnPrs | null
  status: DrawnStatus | null
  banners: BannerLine[]
  changed: Set<string>
} {
  const now = Date.now()
  const lists = listsOf(v, shownSettled(v))
  const t = drawnTab()
  const openId = isRowTab(t) ? openRowId(t) : undefined
  const changed = new Set<string>()
  const kept = new Set<string>()
  const prs = t === 'prs' ? stepPrs(v, now, changed, kept) : null
  const status = t === 'overview' ? stepStatus(v.statusPage, now, changed, kept) : null
  const banners = stepLines(tabBanners(v), tabState.lastBanners ?? undefined, bannerMotion, now, changed, kept)
  const lastPressLines = new Map(pressLines)
  const lastStatusLines = new Map(statusLines)
  pressLines.clear()
  statusLines.clear()
  for (const group of (Object.keys(LIST_OF) as Group[]).filter(g => TAB_OF[g] === t)) {
    const listed = lists[LIST_OF[group]]
    const listedIds = new Set(listed.map(entryId))
    const entries = [...listed]
    for (const [n, last] of (tabState.lastLists?.[LIST_OF[group]] ?? []).entries()) {
      const id = entryId(last)
      if (!listedIds.has(id) && drawnRows.has(id)) entries.splice(Math.min(n, entries.length), 0, last)
    }
    const drawn: Entry[] = []
    for (const x of entries) {
      const id = entryId(x)
      const before = drawnRows.get(id)
      const target: RowTarget = !listedIds.has(id)
        ? 'gone'
        : 'settled' in x
          ? isUndoing(id)
            ? 'undoing'
            : 'settled'
          : id === openId
            ? 'open'
            : 'closed'
      const track = stepRow(before?.track, target, now, entering.has(id), reducedMotion.matches)
      if (!track) continue
      if (track !== before?.track) changed.add(id)
      drawnRows.set(id, { track })
      kept.add(id)
      drawn.push(x)
      if (drawsPanel(track) && 'row' in x) {
        const { text, tone } = statusUnderOf(x.row)
        const lines = text ? [{ id: x.row.id, text, tone }] : []
        pressLines.set(x.row.id, stepLines(lines, lastPressLines.get(x.row.id), pressMotion, now, changed, kept))
        const status = statusLinesOf(x.row.id, statusTextOf(x.row))
        statusLines.set(x.row.id, stepLines(status, lastStatusLines.get(x.row.id), statusMotion, now, changed, kept))
      }
    }
    lists[LIST_OF[group]] = drawn
  }
  lists.findingGroups = lists.findingGroups.map(g => ({
    ...g,
    entries: lists.findings.filter(x => ('row' in x ? x.row.kind : x.settled.finding?.kind) === g.kind),
  }))
  for (const id of [...drawnRows.keys()]) if (!kept.has(id)) drawnRows.delete(id)
  return { lists, prs, status, banners, changed }
}

const undo = (r: RowView, by: InputKind) => pressRow({ action: 'undo', id: r.id }, by)

/** The row's buttons, or none while its reply field is open. */
export function rowActions(row: Row): { options: Key[]; keys: Key[]; more: Key[] } {
  if (row.typing && tabState.ui.typing === row.id) return { options: [], keys: [], more: [] }

  return { options: row.options, keys: row.keys, more: row.more }
}

/** A row's press as its line draws it: whether one is out or still sending, and the status it shows. */
function pressOf(row: Row) {
  const out = outOn(row.id)
  const isPressing = out !== null
  const pending = outPending(tabState.view, row.id)
  const isSending = out !== null && out.pending === null
  const f = isFeedbackShown(row) ? row.feedback : null
  const label = isSending ? null : pending ? feedbackText(pending, 'codex') : f ? feedbackLabel(row) : null
  const tone: FeedbackTone = isPressing ? 'muted' : feedbackTone(f)

  return { isPressing, pending, isSending, f, label, tone }
}

/** The status an open row draws under its buttons, while its press is out, and its tone. */
function statusUnderOf(row: Row): { text: string | null; tone: FeedbackTone } {
  const { pending, isSending, f, label, tone } = pressOf(row)

  return { text: !isSending && isStatusUnderActions(pending ?? f, true) ? label : null, tone }
}

const pressLines = new Map<string, (TextLine & { tone: FeedbackTone })[]>()
const pressMotion = (id: string) => `press-${id}`

const statusLines = new Map<string, StatusLine[]>()

const statusTextOf = (row: Row) => ({ foldNote: row.fold?.note ?? null, note: noteOf(row.id), error: errorOf(row.id) })

/** What a row's line and side column draw, in its open form or its closed one. */
type LineForm = {
  last: string | null
  side: string | null | undefined
}

export function ListRow({
  row,
  track,
  onSelect,
  now,
}: {
  row: Row
  track: RowTrack
  /** A press on the row's line, and whether Option was held. */
  onSelect: (isAll: boolean, by: InputKind) => void
  now: number
}) {
  const isClosing = drawsPanel(track) && (track.state === 'closing' || track.state === 'leaving')
  const isSelected = drawsPanel(track) && !isClosing
  const isTreeHung = row.hasTree && (isSelected || isClosing)
  const handle = (
    <span
      class={`${markClassOf(row.handleTone ?? null, row.isHandleRunning ?? false)}${isTreeHung ? ' has-tree' : ''}`}
      ref={row.isHandleRunning && !isTreeHung ? pulseInStep : undefined}
    >
      <TitleTint row={newRowIn(newRowsOf(tabState.ui), row.id, drawnTab())} tone="key">
        {isTreeHung ? (
          <span class="glyph" ref={row.isHandleRunning ? pulseInStep : undefined}>
            <MarkGlyph text={row.handle} />
          </span>
        ) : (
          <MarkGlyph text={row.handle} />
        )}
      </TitleTint>
      {isTreeHung ? <span class="trunk" /> : null}
    </span>
  )

  const { isPressing, pending, isSending, f, label, tone } = pressOf(row)
  const ageAt = !isPressing && f && hasAge(f) ? f.at : null
  const lineForm = (isOpen: boolean): LineForm => {
    const statusUnder = !isSending && isStatusUnderActions(pending ?? f, isOpen) ? label : null
    const last = statusUnder ? null : label
    const side = isSending ? SENDING : ageAt !== null ? shortAgo(now - ageAt) : row.age

    return { last, side }
  }
  const drawn = lineForm(isSelected || isClosing)
  // A closing row also draws its closed line, hidden, so that collapse() measures the height it comes to rest at.
  const closed = isClosing ? lineForm(false) : null
  const afterTone = tone === 'muted' ? undefined : tone
  const after = (form: LineForm, only?: 'open' | 'closed') =>
    form.last ? (
      <span class={only === 'open' ? 'part open-only' : only === 'closed' ? 'part closed-only' : 'part'}>
        <Sep />
        <span class={afterTone ? `after tone-${afterTone}` : 'after'}>{form.last}</span>
      </span>
    ) : null
  const isSideSplit = closed !== null && closed.side !== drawn.side
  const isTitleMoving = isClosing || (drawsPanel(track) && track.state === 'opening')
  const textParts = () => (
    <>
      <span class="part title-part">
        {row.lead ? (
          <>
            <span class="lead">{row.lead}</span>{' '}
          </>
        ) : null}
        <TitleTint row={newRowIn(newRowsOf(tabState.ui), row.id, drawnTab())} tone="key">
          {row.title}
        </TitleTint>
      </span>
      {after(drawn, closed ? 'open' : undefined)}
      {closed ? after(closed, 'closed') : null}
    </>
  )

  return (
    <div
      class={`row ${isSelected ? 'selected' : 'collapsed'}${isClosing ? ' closing' : ''}`}
      onClick={isSelected ? undefined : e => onSelect(e.altKey, inputOf(e))}
    >
      {handle}
      <div class="content">
        <button
          type="button"
          class="line"
          aria-expanded={isSelected}
          onClick={isSelected ? e => onSelect(e.altKey, inputOf(e)) : undefined}
        >
          <span class="text parted">{textParts()}</span>
          {isTitleMoving ? (
            <span class="text parted short" aria-hidden="true">
              {textParts()}
            </span>
          ) : null}
          {row.meta ? (
            <span class="meta parted">
              {row.meta.split(DOT).map((part, n) => (
                <span class="part">
                  {n > 0 ? <Sep /> : null}
                  {part}
                </span>
              ))}
            </span>
          ) : null}
          {row.holdsUp ? <span class="holds-up">{row.holdsUp}</span> : null}
        </button>
      </div>
      <span class="side" data-room={SENDING}>
        {isSideSplit ? (
          <>
            <span class="open-only">{drawn.side}</span>
            <span class="closed-only">{closed.side}</span>
          </>
        ) : (
          drawn.side
        )}
      </span>
      {isSelected || isClosing ? <Panel row={row} isClosing={isClosing} /> : null}
    </div>
  )
}

function Panel({ row, isClosing }: { row: Row; isClosing: boolean }) {
  const { keys, more } = rowActions(row)
  const copied = copies.get(row.id)
  const isTyping = !!row.typing && tabState.ui.typing === row.id
  const status = statusLines.get(row.id)?.[0]
  const bodyEnd: RowPart = row.body ? (row.bodyEnd?.() ?? 'detail') : 'title'
  const actionsAbove: RowPart = status ? 'status' : bodyEnd
  const lines = pressLines.get(row.id) ?? []
  const actionsPart = isTyping ? 'field' : 'buttons'

  return (
    <div class={isClosing ? 'panel closing' : 'panel'} inert={isClosing}>
      {row.body ? (
        <div class="body" {...(row.bodyEnd ? {} : partAttrs('title', 'detail'))}>
          {row.body()}
        </div>
      ) : null}
      {status ? <StatusLines line={status} above={bodyEnd} under={actionsPart} /> : null}
      <RowActions
        part={partAttrs(actionsAbove, actionsPart)}
        keys={keys}
        more={more}
        followsAnswers={row.options.length > 0 && keys[0]?.emphasis !== 'quiet'}
        reply={
          isTyping && row.typing
            ? {
                id: row.id,
                hint: row.typing.hint,
                draft: () => tabState.ui.drafts[row.id]?.text ?? '',
                onDraft: text => dispatch([{ type: 'edit-draft', id: row.id, text }], { isDrawn: false }),
                send: row.typing.send,
                exit: row.view ? fieldExit(row.view) : 'cancel',
                onExit: () =>
                  dispatch([
                    { type: 'close-field', id: row.id, isDiscard: !!row.view && fieldExit(row.view) === 'discard' },
                  ]),
              }
            : null
        }
        isBlocked={() => isGuarded(row.id, 'click')}
      />
      {lines.map((l, n) => (
        <div
          key={l.id}
          class={l.tone === 'muted' ? 'muted' : `tone-${l.tone}`}
          {...partAttrs(n === 0 ? actionsPart : 'result', 'result')}
          {...lineMotion(pressMotion(l.id))}
        >
          {l.text}
        </div>
      ))}
      {copied ? (
        <div {...partAttrs(lines.length > 0 ? 'result' : actionsPart, 'copy')}>
          <div class="muted">Copy {copied.name} from here:</div>
          <textarea rows={3} readOnly value={copied.text} onFocus={e => e.currentTarget.select()} />
          <button
            type="button"
            class="key"
            onClick={() => {
              copies.delete(row.id)
              tabState.draw()
            }}
          >
            Close
          </button>
        </div>
      ) : null}
    </div>
  )
}

function SettledView({ settled: r, wasOpen }: { settled: RowView; wasOpen: boolean }) {
  const { state } = r
  if (state.is !== 'settled') return null
  const now = Date.now()
  const start = tabState.ui.undoSeen[r.id] ?? now
  const tone = closedTitleTone(state)
  const seen = new Map(Object.entries(tabState.ui.closedSeen))
  const clock = tone === 'muted' ? undefined : closedTitleClock(seen, r.id, state.at, now)
  const error = errorOf(r.id)

  return (
    <div class={wasOpen ? 'row settled was-open' : 'row settled'}>
      <ResultMarkView mark={settledMark(state)} tint={{ row: clock, tone }} />
      <div class="content">
        <div class="settled-head">
          <div class="settled-line parted">
            <span class="part what">
              <TitleTint row={clock} tone={tone}>
                {r.title}
              </TitleTint>
            </span>
            <span class="part settled-result">
              <Sep />
              <span class="outcome-label">{settledLabel(state.label, state.delivery, state.reply)}</span>
            </span>
            {error ? (
              <span class="part tone-error">
                <Sep />
                {error}
              </span>
            ) : null}
          </div>
          <UndoPlace
            start={start}
            isUndoing={isUndoing(r.id)}
            canUndo={state.canUndo}
            offersUndo={state.offersUndo}
            onUndo={by => undo(r, by)}
          />
        </div>
      </div>
    </div>
  )
}

export function Entries({ entries, now }: { entries: Entry[]; now: number }) {
  if (entries.length === 0) return null

  return (
    <div class="list">
      {entries.map(x => {
        const id = entryId(x)
        // stepLists tracked every entry it returned.
        const drawn = drawnRows.get(id)!

        return (
          <div class="entry" key={id} data-motion={id}>
            {'row' in x ? (
              <ListRow
                row={x.row}
                track={drawn.track}
                now={now}
                onSelect={(isAll, by) => pressTitle(x.row.id, isAll, by)}
              />
            ) : (
              <SettledView settled={x.settled} wasOpen={drawn.track.hasOpenForm} />
            )}
          </div>
        )
      })}
    </div>
  )
}
