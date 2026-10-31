import { RowActions } from './row-actions'
import { HELD_MARK } from '../../hooks/help'
import { settledMark, DOT, fieldExit, settledLabel, shortAgo } from '../../hooks/rows'
import { entryId } from '../../hooks/action-plan'
import { isListedTab, isRowTab } from '../../hooks/tabs'
import { feedbackText, hasAge, isFailure, isStatusUnderActions } from '../../hooks/feedback'
import { SETTLED_MS } from '../../hooks/timing'
import type { RowView } from '../../hooks/rows'
import { TAB_OF } from './arrivals'
import type { Group } from './arrivals'
import type { TabView as View } from './core'
import { stepRow } from './rows'
import type { RowTarget, RowTrack } from './rows'
import { isUndoLeft } from './settle'
import { tabState, drafts, sending, SENDING, errors, copies, entering, undoing, drawnRows } from './tab-state'
import type { Row, Entry, Lists } from './tab-state'
import { reducedMotion, drawIn } from './tab-motion'
import { drawnTab, shownSettled, selectedIndex, open, select, isOpenGuarded, rowActions } from './tab-selection'
import { discardReply } from './tab-press'
import { act, listsOf } from './tab-rows'
import { feedbackLabel, noteOf, isFeedbackShown, pulseInStep, ResultMarkView, UndoPlace } from './tab-parts'

const LIST_OF = { question: 'questions', task: 'tasks', finding: 'findings' } as const

export function stepLists(v: View): { lists: Lists; changed: Set<string> } {
  const now = Date.now()
  const lists = listsOf(v, shownSettled(v))
  const t = drawnTab()
  const rows = isListedTab(t) ? lists.byTab[t] : []
  const openId = isRowTab(t) ? rows[selectedIndex(rows, t, v)]?.id : undefined
  const changed = new Set<string>()
  const kept = new Set<string>()
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
    }
    lists[LIST_OF[group]] = drawn
  }
  lists.findingGroups = lists.findingGroups.map(g => ({
    ...g,
    entries: lists.findings.filter(x => ('row' in x ? x.row.kind : x.settled.finding?.kind) === g.kind),
  }))
  for (const id of [...drawnRows.keys()]) if (!kept.has(id)) drawnRows.delete(id)
  return { lists, changed }
}

async function undo(r: RowView) {
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

export function ListRow({
  row,
  track,
  onSelect,
  now,
}: {
  row: Row
  track: RowTrack
  onSelect: () => void
  now: number
}) {
  const isClosing = track.hasPanel && (track.state === 'closing' || track.state === 'leaving')
  const isSelected = track.hasPanel && !isClosing
  const handle = (
    <span
      class={`mark ${row.handleTone ?? ''}${row.isHandleRunning ? ' running' : ''}`}
      ref={row.isHandleRunning ? pulseInStep : undefined}
    >
      {row.handle}
    </span>
  )

  const isPressing = sending.has(row.id)
  const pending = sending.get(row.id)?.pending ?? null
  const isSending = isPressing && pending === null
  const f = isFeedbackShown(row) ? row.feedback : null
  const label = isSending ? null : pending ? feedbackText(pending, 'codex') : f ? feedbackLabel(row) : null
  const ageAt = !isPressing && f && hasAge(f) ? f.at : null
  const isInSide = ageAt !== null && !isSelected && !isClosing && f?.is !== 'queued' && f?.is !== 'unconfirmed'
  const statusUnder = !isSending && isStatusUnderActions(pending ?? f, isSelected || isClosing) ? label : null
  const last = isInSide || statusUnder ? null : label
  const side = isSending ? SENDING : ageAt !== null ? shortAgo(now - ageAt) : last ? null : row.age
  const afterTone = !isPressing && isFailure(row.feedback) ? 'error' : undefined

  return (
    <div
      class={`row ${isSelected ? 'selected' : 'collapsed'}${isClosing ? ' closing' : ''}`}
      onClick={isSelected ? undefined : onSelect}
    >
      {handle}
      <div class="content">
        <button
          type="button"
          class="line"
          {...(isSelected ? { tabIndex: -1, 'aria-disabled': true } : { 'aria-expanded': false })}
        >
          <span class="text">
            {row.lead ? (
              <>
                <span class="lead">{row.lead}</span>{' '}
              </>
            ) : null}
            {row.title}
          </span>
          {row.meta ? <span class="meta">{row.meta}</span> : null}
          {last ? (
            <span class={`after ${afterTone ? `tone-${afterTone}` : ''}`}>
              {isSelected || isClosing ? `${DOT}${last}` : last}
            </span>
          ) : null}
          {row.holdsUp ? (
            <span class="holds-up">
              <span class="tone-needsYou">{HELD_MARK.mark}</span> {row.holdsUp}
            </span>
          ) : null}
        </button>
      </div>
      <span class="side" data-room={SENDING}>
        {isInSide ? <span class="side-label">{label}</span> : null}
        {side}
      </span>
      {isSelected || isClosing ? <Panel row={row} isClosing={isClosing} status={statusUnder} /> : null}
    </div>
  )
}

function Panel({ row, isClosing, status }: { row: Row; isClosing: boolean; status?: string | null }) {
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
      {row.body ? <div class="body">{row.body}</div> : null}
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
      {status ? <div class="muted">{status}</div> : null}
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
  const error = errors.get(r.id)

  return (
    <div class={panel ? 'row settled was-open' : 'row settled'}>
      <ResultMarkView mark={settledMark(state)} />
      <div class="content">
        <div class="settled-head">
          <div class="settled-line">
            <span class="what">{r.title}</span>
            <span class="outcome-label">
              {DOT}
              {settledLabel(state.label, state.delivery)}
            </span>
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
              <ListRow row={x.row} track={drawn.track} now={now} onSelect={() => select(t, all, all.indexOf(x.row))} />
            ) : (
              <SettledView settled={x.settled} panel={drawn.openRow} />
            )}
          </div>
        )
      })}
    </div>
  )
}
