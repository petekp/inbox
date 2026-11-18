import { RowActions } from './row-actions'
import { closedTitleTone, settledMark, DOT, fieldExit, settledLabel, shortAgo } from '../../hooks/rows'
import { entryId } from '../../hooks/action-plan'
import { isListedTab, isRowTab } from '../../hooks/tabs'
import { feedbackText, hasAge, isFailure, isStatusUnderActions } from '../../hooks/feedback'
import { SETTLED_MS } from '../../hooks/timing'
import type { RowView } from '../../hooks/rows'
import { TAB_OF } from './arrivals'
import { closedTitleClock, newRowIn, showNewRows } from '../../hooks/arrivals'
import type { Group } from './arrivals'
import type { TabView as View } from './core'
import { stepRow } from '../../hooks/row-motion'
import type { RowTarget, RowTrack } from '../../hooks/row-motion'
import { isUndoLeft } from './settle'
import { tabState, drafts, sending, SENDING, errors, copies, entering, undoing, drawnRows } from './tab-state'
import type { Row, Entry, Lists } from './tab-state'
import { reducedMotion, drawIn } from './tab-motion'
import { drawnTab, shownSettled, openRowId, open, isOpenGuarded, rowActions } from './tab-selection'
import { discardReply, outPending } from './tab-press'
import { foldAllHere } from './tab-fold-all'
import { act, listsOf, pressTitle } from './tab-rows'
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

const LIST_OF = { question: 'questions', task: 'tasks', finding: 'findings' } as const

/** Rows whose panel is closing, and rows whose close just ended, whose Holds up line then fades in over the settled height. */
const rowsClosing = new Set<string>()
const rowsJustClosed = new Set<string>()
const JUST_CLOSED_MS = 600

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
  if (document.visibilityState === 'visible' && !tabState.isHelpShown)
    tabState.newRows = showNewRows(tabState.newRows, t, now)
  const rows = isListedTab(t) ? lists.byTab[t] : []
  const openId = isRowTab(t) ? openRowId(rows, t, v) : undefined
  const changed = new Set<string>()
  const kept = new Set<string>()
  const prs = t === 'prs' ? stepPrs(v, now, changed, kept) : null
  const status = t === 'overview' ? stepStatus(v.statusPage, now, changed, kept) : null
  const banners = stepLines(tabBanners(v), tabState.lastBanners ?? undefined, bannerMotion, now, changed, kept)
  const lastPressLines = new Map(pressLines)
  pressLines.clear()
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
          ? undoing.has(id)
            ? 'undoing'
            : 'settled'
          : id === openId
            ? 'open'
            : 'closed'
      const track = stepRow(before?.track, target, now, entering.has(id), reducedMotion.matches)
      if (!track) continue
      if (track !== before?.track) changed.add(id)
      const openRow = !track.hasPanel ? undefined : 'row' in x && listedIds.has(id) ? x.row : before?.openRow
      drawnRows.set(id, { track, openRow })
      kept.add(id)
      drawn.push(x)
      if (track.hasPanel && 'row' in x) {
        const text = statusUnderOf(x.row)
        const lines = text ? [{ id: x.row.id, text }] : []
        pressLines.set(x.row.id, stepLines(lines, lastPressLines.get(x.row.id), pressMotion, now, changed, kept))
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

export async function undo(r: RowView) {
  if (undoing.has(r.id)) return
  const t = TAB_OF[r.type]
  undoing.add(r.id)
  try {
    await act(r.id, { action: 'undo', id: r.id }, () => open(t, r.id))
  } finally {
    undoing.delete(r.id)
    const at = tabState.seen.get(r.id)
    const isTimeLeft = at !== undefined && isUndoLeft(at, Date.now())
    const error = errors.get(r.id)
    if (error && !isTimeLeft) {
      tabState.lineNote = { text: error, at: Date.now(), isError: true }
      drawIn(SETTLED_MS)
    }
    tabState.draw()
  }
}

/** A row's press as its line draws it: whether one is out or still sending, and the status it shows. */
function pressOf(row: Row) {
  const isPressing = sending.has(row.id)
  const pending = outPending(tabState.view, row.id)
  const isSending = isPressing && sending.get(row.id)?.pending === null
  const f = isFeedbackShown(row) ? row.feedback : null
  const label = isSending ? null : pending ? feedbackText(pending, 'codex') : f ? feedbackLabel(row) : null

  return { isPressing, pending, isSending, f, label }
}

/** The status an open row draws under its buttons, while its press is out. */
function statusUnderOf(row: Row): string | null {
  const { pending, isSending, f, label } = pressOf(row)

  return !isSending && isStatusUnderActions(pending ?? f, true) ? label : null
}

const pressLines = new Map<string, TextLine[]>()
const pressMotion = (id: string) => `press-${id}`

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
  onSelect: (isAll: boolean) => void
  now: number
}) {
  const isClosing = track.hasPanel && (track.state === 'closing' || track.state === 'leaving')
  const isSelected = track.hasPanel && !isClosing
  if (isClosing) rowsClosing.add(row.id)
  else if (rowsClosing.delete(row.id)) {
    rowsJustClosed.add(row.id)
    setTimeout(() => rowsJustClosed.delete(row.id), JUST_CLOSED_MS)
  }
  const isJustClosed = !isSelected && rowsJustClosed.has(row.id)
  const isTreeHung = row.hasTree && (isSelected || isClosing)
  const handle = (
    <span
      class={`${markClassOf(row.handleTone ?? null, row.isHandleRunning ?? false)}${isTreeHung ? ' has-tree' : ''}`}
      ref={row.isHandleRunning && !isTreeHung ? pulseInStep : undefined}
    >
      <TitleTint row={newRowIn(tabState.newRows, row.id, drawnTab())} tone="key">
        {isTreeHung ? (
          <span class="glyph" ref={row.isHandleRunning ? pulseInStep : undefined}>
            <MarkGlyph text={row.handle} />
          </span>
        ) : (
          <MarkGlyph text={row.handle} />
        )}
      </TitleTint>
    </span>
  )

  const { isPressing, pending, isSending, f, label } = pressOf(row)
  const ageAt = !isPressing && f && hasAge(f) ? f.at : null
  const lineForm = (isOpen: boolean): LineForm => {
    const statusUnder = !isSending && isStatusUnderActions(pending ?? f, isOpen) ? label : null
    const last = statusUnder ? null : label
    const side = isSending ? SENDING : ageAt !== null ? shortAgo(now - ageAt) : last ? null : row.age

    return { last, side }
  }
  const drawn = lineForm(isSelected || isClosing)
  // A closing row also draws its closed line, hidden, so that collapse() measures the height it comes to rest at.
  const closed = isClosing ? lineForm(false) : null
  const afterTone = !isPressing && isFailure(row.feedback) ? 'error' : undefined
  const after = (form: LineForm, only?: 'open' | 'closed') =>
    form.last ? (
      <span class={only === 'open' ? 'open-only' : only === 'closed' ? 'closed-only' : undefined}>
        <span class="muted">{DOT}</span>
        <span class={afterTone ? `after tone-${afterTone}` : 'after'}>{form.last}</span>
      </span>
    ) : null
  const isSideSplit = closed !== null && closed.side !== drawn.side
  const isTitleMoving = isClosing || (track.hasPanel && track.state === 'opening')
  const textParts = () => (
    <>
      {row.lead ? (
        <>
          <span class="lead">{row.lead}</span>{' '}
        </>
      ) : null}
      <TitleTint row={newRowIn(tabState.newRows, row.id, drawnTab())} tone="key">
        {row.title}
      </TitleTint>
      {after(drawn, closed ? 'open' : undefined)}
      {closed ? after(closed, 'closed') : null}
    </>
  )

  return (
    <div
      class={`row ${isSelected ? 'selected' : 'collapsed'}${isClosing ? ' closing' : ''}${isJustClosed ? ' just-closed' : ''}`}
      onClick={isSelected ? undefined : e => onSelect(e.altKey)}
    >
      {handle}
      <div class="content">
        <button
          type="button"
          class="line"
          aria-expanded={isSelected}
          onClick={isSelected ? e => onSelect(e.altKey) : undefined}
        >
          <span class="text">{textParts()}</span>
          {isTitleMoving ? (
            <span class="text short" aria-hidden="true">
              {textParts()}
            </span>
          ) : null}
          {row.meta ? <span class="meta">{row.meta}</span> : null}
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
  const note = noteOf(row.id)
  const isTyping = !!row.typing && tabState.typing === row.id
  const notes = [
    row.fold?.note ? <div class="muted">{row.fold.note}</div> : null,
    note ? <div class="muted">{note}</div> : null,
    errors.has(row.id) ? <div class="tone-error">{errors.get(row.id)}</div> : null,
  ].filter(Boolean)

  return (
    <div class={isClosing ? 'panel closing' : 'panel'} inert={isClosing}>
      {row.body ? <div class="body">{row.body()}</div> : null}
      {notes.length > 0 ? <div>{notes}</div> : null}
      <RowActions
        keys={keys}
        more={more}
        reply={
          isTyping
            ? {
                id: row.id,
                hint: row.typing!.hint,
                draft: () => drafts.get(row.id)?.text ?? '',
                onDraft: text =>
                  drafts.set(row.id, { text, since: drafts.get(row.id)?.since ?? tabState.view?.at ?? Date.now() }),
                send: text => {
                  tabState.typing = null
                  row.typing!.send(text)
                },
                exit: row.view ? fieldExit(row.view) : 'cancel',
                onExit: () => {
                  if (row.view && fieldExit(row.view) === 'discard') discardReply(row.id)
                  else {
                    tabState.typing = null
                    tabState.draw()
                  }
                },
              }
            : null
        }
        isBlocked={isOpenGuarded}
      />
      {(pressLines.get(row.id) ?? []).map(l => (
        <div key={l.id} class="muted" {...lineMotion(pressMotion(l.id))}>
          {l.text}
        </div>
      ))}
      {copied ? (
        <div>
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

function SettledView({ settled: r, panel }: { settled: RowView; panel: Row | undefined }) {
  const { state } = r
  if (state.is !== 'settled') return null
  const start = tabState.seen.get(r.id) ?? Date.now()
  const tone = closedTitleTone(state)
  const clock = tone === 'muted' ? undefined : closedTitleClock(tabState.closedSeen, r.id, state.at, Date.now())
  const error = errors.get(r.id)

  return (
    <div class={panel ? 'row settled was-open' : 'row settled'}>
      <ResultMarkView mark={settledMark(state)} tint={{ row: clock, tone }} />
      <div class="content">
        <div class="settled-head">
          <div class="settled-line">
            <span class="what">
              <TitleTint row={clock} tone={tone}>
                {r.title}
              </TitleTint>
            </span>
            <span class="muted">{DOT}</span>
            <span class="outcome-label">{settledLabel(state.label, state.delivery, state.reply)}</span>
            {error ? (
              <span class="tone-error">
                {DOT}
                {error}
              </span>
            ) : null}
          </div>
          <UndoPlace
            start={start}
            isUndoing={undoing.has(r.id)}
            canUndo={state.canUndo}
            offersUndo={state.offersUndo}
            onUndo={() => void undo(r)}
          />
        </div>
        {panel ? <Panel row={panel} isClosing /> : null}
      </div>
    </div>
  )
}

export function Entries({ entries, group, all, now }: { entries: Entry[]; group: Group; all: Row[]; now: number }) {
  const t = TAB_OF[group]
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
                onSelect={isAll => pressTitle(t, all, all.indexOf(x.row), isAll ? foldAllHere : undefined)}
              />
            ) : (
              <SettledView settled={x.settled} panel={drawn.openRow} />
            )}
          </div>
        )
      })}
    </div>
  )
}
