// The Inbox tab beside a Codex conversation, bundled into tab.html. It polls
// the plugin's server for the view and sends presses back. Its layout follows
// the mod's /inbox pane: docs/plans/codex-tab.md.

import { render } from 'preact'
import type { ComponentChildren, JSX } from 'preact'

import { ago, isLapsed } from '../../hooks/ledger'
import { noteText, pendingResult, stepEffects } from '../../hooks/presses'
import type { RowPress } from '../../hooks/presses'
import {
  closedShown,
  feedbackText,
  hasAge,
  isFailure,
  isGuarded,
  NEW_ROW_MS,
  PRESS_GUARD_MS,
  SETTLED_MS,
} from '../../hooks/view'
import type { Feedback, RowState, RowView } from '../../hooks/view'
import type { Finding, Item, RowNote } from '../../types'
import { followTo, isShownEmpty, newRows } from './arrivals'
import type { Group, SeenRows, Tab } from './arrivals'
import type { TabView as View } from './core'
import { drawnSettled, POLL_MS, settledIds, settledSeen } from './settle'

type Tone = 'needsYou' | 'findings' | 'done' | 'error'

/** One of a row's actions, with the key that presses it while the tab has focus, if it has one. */
type Key = { hotkey?: string; label: string; isPrimary?: boolean; run: () => void }

/** A list row. Selected, it shows its title in full, its body and its keys; otherwise one line. */
type Row = {
  id: string
  handle: string
  handleTone?: Tone
  meta?: JSX.Element
  title: string
  /** Muted text after the title, such as an age. */
  titleAfter?: string
  /** The unselected line, when it differs from the title and its age. */
  line?: { text: string; after?: string; afterTone?: Tone }
  /** Unselected, the title may take a second line. */
  hasSecondLine?: boolean
  body?: JSX.Element | null
  keys: Key[]
  /** Actions that talk about the row or drop it, after `keys` and a muted dot. */
  more: Key[]
  /** The row no longer waits on the person: selected, it shows `note`, with its body and keys behind Details. */
  fold?: { note?: string }
  typing?: { hint: string; send: (text: string) => void }
  feedback: Feedback | null
}

/** A row that just closed, drawn in its place with its outcome, or a row still open. */
type Entry = { row: Row } | { settled: RowView; state: Extract<RowState, { is: 'settled' }> }

// The keys of a question's answers and a task's steps, as the pane letters them.
const CHOICE_KEYS = [...'abcfghilm']
const TABS: { id: Tab; label: string; hotkey: string }[] = [
  { id: 'needsYou', label: 'Needs you', hotkey: '1' },
  { id: 'findings', label: 'Findings', hotkey: '2' },
]

let view: View | null = null
// The demo shows the mod's sample entries, and its presses send nothing.
let isDemo = false
// The first read of the view failed, so there is no view to show.
let readFailed = false
// Polls that failed in a row while a view shows, and when the shown view was read.
let pollFailures = 0
let readAt = 0
let tab: Tab = 'needsYou'
// Each tab's open row, and when a click or key opened it; 0 when it was open by default when pressed.
// Null until a row opens there: the tab then draws its top row open.
const selection: Record<Tab, { id: string; openedAt: number } | null> = { needsYou: null, findings: null }
let typing: string | null = null
let focusTyping = false
// Typed text by row, kept until it is sent, so a redraw, a new selection or a closed field keeps it.
const drafts = new Map<string, string>()
const details = new Set<string>()
// Questions whose every option shows. Until then, one with more than 5 options shows 4.
const optionsShown = new Set<string>()
const unfolded = new Set<Group>()
// What a row shows while its press runs: "Sending…", or a Local press's pending note.
const sending = new Map<string, string>()
const errors = new Map<string, string>()
// A row's stale or sample note, shown for SETTLED_MS from `at`.
const notes = new Map<string, { text: string; at: number }>()
const copies = new Map<string, { name: string; text: string }>()
// A note for a press whose row is no longer drawn, shown on line 1 for SETTLED_MS.
let lineNote: { text: string; at: number } | null = null
// When the tab first saw each row the view lists as settled. It draws one in place for SETTLED_MS from then.
let seen = new Map<string, number>()
// The row ids the tab has seen, and when each row new to it appeared. A new row draws a bar for NEW_ROW_MS.
let rowsSeen: SeenRows = null
const arrived = new Map<string, number>()
// Each view request takes the next number, and a reply older than the view shown is dropped.
let requested = 0
let shown = 0
let isPressing = false

// ── The host ────────────────────────────────────────────────────────────────

let nextId = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>()

/** Sends a request to the host. With `timeoutMs`, a request the host has not answered by then fails, and a later answer is dropped. */
function request(method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*')
    if (timeoutMs !== undefined)
      setTimeout(() => {
        if (pending.delete(id)) reject(new Error(`${method} timed out`))
      }, timeoutMs)
  })
}

window.addEventListener('message', e => {
  const m = e.data
  if (!m || m.jsonrpc !== '2.0') return
  if (m.id != null && !m.method && pending.has(m.id)) {
    const p = pending.get(m.id)!
    pending.delete(m.id)
    if (m.error) p.reject(m.error)
    else p.resolve(m.result)
    return
  }
  if (m.method === 'ui/notifications/host-context-changed') applyHost(m.params ?? {})
  if (m.id != null && m.method) parent.postMessage({ jsonrpc: '2.0', id: m.id, result: {} }, '*')
})

function applyHost(ctx: { theme?: string; styles?: { variables?: Record<string, string> } }) {
  if (ctx.theme) document.documentElement.dataset.theme = ctx.theme
  for (const [k, v] of Object.entries(ctx.styles?.variables ?? {})) document.documentElement.style.setProperty(k, v)
}

/** A tool's answer for the tab. A call the server could not answer throws, as a failed request does. */
async function callTool<T>(name: string, args: unknown = {}, timeoutMs?: number): Promise<T> {
  const r = (await request('tools/call', { name, arguments: args }, timeoutMs)) as
    { structuredContent?: T; isError?: boolean; content?: { text?: string }[] } | undefined
  if (!r || r.isError || r.structuredContent === undefined) throw new Error(r?.content?.[0]?.text ?? `${name} failed`)

  return r.structuredContent
}

// ── The view ────────────────────────────────────────────────────────────────

function applyView(next: View, seq: number) {
  if (seq < shown) return
  shown = seq
  readFailed = false
  pollFailures = 0
  readAt = Date.now()
  const before = seen
  seen = settledSeen(seen, settledIds(next), Date.now())
  // A row seen settled for the first time leaves for its Closed fold once SETTLED_MS passes.
  if ([...seen.keys()].some(id => !before.has(id))) setTimeout(draw, SETTLED_MS + 50)
  view = next
  const rows = newRows(rowsSeen, next)
  rowsSeen = rows.seen
  const added = [...rows.added.needsYou, ...rows.added.findings]
  for (const id of added) arrived.set(id, Date.now())
  if (added.length > 0) setTimeout(draw, NEW_ROW_MS + 50)
  follow(next, rows.added)
  draw()
}

/** Moves to the other tab for its new rows while the tab on screen shows only its empty text, as the mod's pane does. */
function follow(v: View, added: Record<Tab, string[]>) {
  const drawn = drawnSettled(seen, Date.now())
  const lists = listsOf(v, drawn)
  const to = followTo(tab, isShownEmpty(v, tab, drawn, unfolded), added, {
    needsYou: lists.byTab.needsYou.map(r => r.id),
    findings: lists.byTab.findings.map(r => r.id),
  })
  if (!to) return
  tab = to.tab
  if (to.id) open(to.tab, to.id)
}

/** How long a view read may go unanswered before it counts as failed, so a lost answer cannot stop the polls. */
const READ_TIMEOUT_MS = 3 * POLL_MS

/** Reads the view once. A failed first read shows that the inbox could not be read; a failed poll after it counts toward "retrying". */
async function read() {
  const seq = ++requested
  try {
    applyView(await callTool<View>('inbox_view', { demo: isDemo }, READ_TIMEOUT_MS), seq)
  } catch {
    if (view) pollFailures++
    else readFailed = true
    draw()
  }
}

async function poll() {
  if (!isPressing) await read()
  setTimeout(poll, POLL_MS)
}

type PressReply = {
  view?: View
  copy?: { text: string; name: string } | null
  error?: string | null
  note?: RowNote['note'] | null
}

/** Whether the view lists an open row with this id, which can show a note. */
function isListed(v: View, id: string): boolean {
  return [...v.needsYou.questions, ...v.needsYou.tasks, ...v.findings.rows].some(
    r => r.id === id && r.state.is !== 'settled',
  )
}

/** Whether the view lists this row as reading "Not sent". */
function isNotSent(v: View, id: string): boolean {
  return [...v.needsYou.questions, ...v.needsYou.tasks, ...v.findings.rows].some(
    r => r.id === id && r.feedback?.is === 'notSent',
  )
}

/**
 * How long a press may go unanswered before it reads as not sent and polls resume. It must exceed the
 * server's limits on a press's lock waits, `codex queue` and opens, or a press that went through reads as failed.
 */
const PRESS_TIMEOUT_MS = 60_000

/**
 * Sends a press, drawn for the view's session, to the server. `onSent` runs
 * only once the press went through, so a stale or failed press keeps a typed draft.
 */
async function act(rowId: string, press: RowPress, onSent?: () => void, pending = 'Sending…') {
  if (press.action !== 'undo') keepPressedOpen(rowId)
  sending.set(rowId, pending)
  errors.delete(rowId)
  notes.delete(rowId)
  copies.delete(rowId)
  draw()
  isPressing = true
  const seq = ++requested
  try {
    const r = await callTool<PressReply>('inbox_press', { press, thread: view?.thread, demo: isDemo }, PRESS_TIMEOUT_MS)
    if (r?.copy) await copy(rowId, r.copy)
    if (r?.view) applyView(r.view, seq)
    // A message that did not send shows on its row, from the view, when the row is there to show it.
    if (r?.error && !(view && isNotSent(view, rowId))) errors.set(rowId, r.error)
    // A sample press went through on the demo's copy, so its typed words go as a real press's do.
    // After the view, so `onSent` reads the rows as they are after the press.
    if (!r?.error && r?.note !== 'stale') onSent?.()
    if (r?.note && view && isListed(view, rowId)) {
      notes.set(rowId, { text: noteText(r.note), at: Date.now() })
      setTimeout(draw, SETTLED_MS + 50)
      // A stale press's typed words go back into the field they were sent from.
      if (r.note === 'stale' && press.action === 'type') typing = rowId
    } else if (r?.note) {
      lineNote = { text: noteText(r.note), at: Date.now() }
      setTimeout(draw, SETTLED_MS + 50)
    }
  } catch {
    errors.set(rowId, 'Not sent: the inbox did not answer.')
  } finally {
    isPressing = false
    sending.delete(rowId)
    draw()
  }
}

/** Copies a press's text. The row's result already reads "✓ Copied", so only a failure says more. */
async function copy(rowId: string, c: { text: string; name: string }) {
  try {
    await navigator.clipboard.writeText(c.text)
  } catch {
    // The tab's frame may not get the clipboard, so the text shows for a manual copy.
    errors.set(rowId, `Could not copy ${c.name}: this tab has no clipboard access`)
    copies.set(rowId, c)
  }
}

// ── Rows ────────────────────────────────────────────────────────────────────

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function startTyping(id: string) {
  keepPressedOpen(id)
  typing = id
  focusTyping = true
  draw()
}

/**
 * A row's actions as the tab's keys, as the pane draws them. `keys` finish the
 * row: options and steps, the first 9 shown on letters, Done for a task and
 * Address for a finding. `more` are the other ways to respond. Options past the
 * fourth of a question with more than 5 show only after [All N options].
 */
function rowKeys(r: RowView): { keys: Key[]; more: Key[] } {
  const { id, item } = r
  const shown = r.actions.filter(a => optionsShown.has(id) || !a.isFolded)
  const folded = r.actions.length - shown.length
  // [All N options] follows the last option shown.
  const lastOption = shown.map(a => a.press.action).lastIndexOf('answer')
  const keys: Key[] = []
  const more: Key[] = []
  // A press whose message failed to send leads with [Try again], which repeats it.
  const retry = r.feedback?.is === 'notSent' ? r.feedback.retry : null
  if (retry) keys.push({ label: 'Try again', run: () => void act(id, retry) })
  let letters = 0
  const lettered = () => (letters < CHOICE_KEYS.length ? { hotkey: CHOICE_KEYS[letters++]! } : {})
  for (const [n, a] of shown.entries()) {
    const p = a.press
    const label = a.label
    if (p.action === 'answer' && item) {
      keys.push({ ...lettered(), label, isPrimary: a.isPrimary, run: () => void act(id, p) })
      if (n === lastOption && folded > 0)
        keys.push({
          label: `All ${item.options.length} options`,
          run: () => {
            optionsShown.add(id)
            draw()
          },
        })
    } else if (p.action === 'step') {
      const step = r.steps[p.step]
      // An open or copy shows its pending note, as the pane does, until the server answers.
      const pending =
        a.kind === 'local' && item && step
          ? feedbackText({ is: 'local', result: pendingResult(stepEffects(item, step), Date.now()) }, 'html')
          : undefined
      keys.push({ ...lettered(), label, run: () => void act(id, p, undefined, pending) })
    } else if (p.action === 'done') keys.push({ hotkey: 'd', label, run: () => void act(id, p) })
    else if (p.action === 'address') keys.push({ hotkey: 'a', label, run: () => void act(id, p) })
    else if (p.action === 'type') more.push({ hotkey: 't', label, run: () => startTyping(id) })
    else if (p.action === 'explain' || p.action === 'discuss')
      more.push({ hotkey: 'e', label, run: () => void act(id, p) })
    else if (p.action === 'dismiss') more.push({ hotkey: 'x', label, run: () => void act(id, p) })
  }

  return { keys, more }
}

function itemRow(v: View, r: RowView, item: Item): Row {
  const isQuestion = item.kind === 'question'
  const isHandedOff = r.state.is === 'handedOff'
  const id = item.id

  return {
    id,
    handle: isHandedOff ? '✓' : r.handle,
    handleTone: isHandedOff ? 'done' : undefined,
    ...(isHandedOff ? { fold: {} } : {}),
    title: item.ask,
    titleAfter: item.at === null ? undefined : ` · ${ago(v.at - item.at)}`,
    hasSecondLine: isQuestion,
    ...rowKeys(r),
    typing: {
      hint: isQuestion ? 'Your answer' : 'Your reply to Codex',
      send: text => void act(id, { action: 'type', id, text }, () => drafts.delete(id)),
    },
    feedback: r.feedback,
  }
}

const FINDING_BADGES = {
  issue: { label: 'Issue', mark: '▲', tone: 'needsYou' },
  opportunity: { label: 'Opportunity', mark: '✦', tone: 'done' },
} as const

function findingRow(v: View, r: RowView, f: Finding): Row {
  const badge = FINDING_BADGES[f.kind]
  // A finding handed to Codex folds, as a task does, until Codex's reply leaves it open.
  const isHandedOff = r.state.is === 'handedOff'
  const id = f.id

  return {
    id,
    handle: isHandedOff ? '✓' : r.handle,
    handleTone: isHandedOff ? 'done' : undefined,
    ...(isHandedOff ? { fold: {} } : {}),
    title: f.title,
    meta: (
      <div>
        <span class={`tone-${badge.tone}`}>
          {badge.mark} {badge.label}
        </span>
        <span class="muted"> {ago(v.at - f.at)}</span>
      </div>
    ),
    line: { text: f.title, after: ` · ${ago(v.at - f.at)}` },
    body: (
      <div>
        <p>{f.detail}</p>
        {f.path ? (
          <p>
            <span class="muted">Relevant file: </span>
            {f.path}
          </p>
        ) : null}
      </div>
    ),
    ...rowKeys(r),
    typing: {
      hint: 'Your reply to Codex',
      send: text => void act(id, { action: 'type', id, text }, () => drafts.delete(id)),
    },
    feedback: r.feedback,
  }
}

type Lists = {
  questions: Entry[]
  tasks: Entry[]
  findings: Entry[]
  /** Each tab's open rows in order: the selection and the keys read these. A settled row cannot be selected. */
  byTab: Record<Tab, Row[]>
}

/** The view's lists as the tab draws them. A settled row shows while `drawn` has it, and is left out after. */
function listsOf(v: View, drawn: ReadonlySet<string>): Lists {
  const entries = (rows: RowView[]) =>
    rows.flatMap((r): Entry[] => {
      if (r.state.is === 'settled') return drawn.has(r.id) ? [{ settled: r, state: r.state }] : []
      if (r.item) return [{ row: itemRow(v, r, r.item) }]
      return r.finding ? [{ row: findingRow(v, r, r.finding) }] : []
    })
  const rowsOf = (list: Entry[]) => list.flatMap(x => ('row' in x ? [x.row] : []))
  const questions = entries(v.needsYou.questions)
  const tasks = entries(v.needsYou.tasks)
  const findings = entries(v.findings.rows)

  return {
    questions,
    tasks,
    findings,
    byTab: { needsYou: [...rowsOf(questions), ...rowsOf(tasks)], findings: rowsOf(findings) },
  }
}

/** The ids of the settled rows a list draws, which its Closed fold leaves out. */
function settledIn(entries: Entry[]): Set<string> {
  return new Set(entries.flatMap(x => ('settled' in x ? [x.settled.id] : [])))
}

/** Undo on a settled row: the row comes back open, and selected. */
function undo(r: RowView) {
  const t: Tab = r.type === 'finding' ? 'findings' : 'needsYou'
  void act(r.id, { action: 'undo', id: r.id }, () => open(t, r.id))
}

/**
 * The open row's index, or -1 when none is open. A tab where no row opened yet
 * draws its top row open. Once the open row leaves, none is open: a row
 * opening under the pointer would catch a second click.
 */
function selectedIndex(rows: Row[], t: Tab, v: View): number {
  const s = selection[t]
  // In Needs you the top row that counts, else the first, as when every task is handed off.
  const id = s ? s.id : ((t === 'needsYou' ? v.needsYou.topId : null) ?? rows[0]?.id)

  return id ? rows.findIndex(r => r.id === id) : -1
}

/** Opens a row. Its buttons ignore clicks for PRESS_GUARD_MS, and draw again once that ends. */
function open(t: Tab, id: string) {
  selection[t] = { id, openedAt: Date.now() }
  setTimeout(draw, PRESS_GUARD_MS + 50)
}

function select(t: Tab, rows: Row[], index: number) {
  const row = rows[index]
  if (!row) return
  open(t, row.id)
  draw()
}

/**
 * Keeps a row open once it is pressed while the tab draws it open by default,
 * so the default does not open another row when this one leaves. A row open by
 * default was not opened by a click, so it is not guarded.
 */
function keepPressedOpen(id: string) {
  if (!selection[tab]) selection[tab] = { id, openedAt: 0 }
}

/** Whether the shown tab's open row opened too recently for a click on its buttons to count. */
function isOpenGuarded(): boolean {
  return isGuarded(selection[tab]?.openedAt ?? 0, Date.now())
}

/** The selected row's keys: a folded row offers only Details until it is opened. */
function rowActions(row: Row): { keys: Key[]; more: Key[] } {
  const detailsKey = {
    hotkey: 'v',
    label: details.has(row.id) ? 'Hide details' : 'Details',
    run: () => {
      if (details.has(row.id)) details.delete(row.id)
      else details.add(row.id)
      draw()
    },
  }
  if (row.fold && !details.has(row.id)) return { keys: [detailsKey], more: [] }

  return row.fold ? { keys: row.keys, more: [...row.more, detailsKey] } : { keys: row.keys, more: row.more }
}

// ── Drawing ─────────────────────────────────────────────────────────────────

/**
 * One of the open row's actions. A click right after the row opened does
 * nothing; its key works at once. Keys are an extra, so no key text shows.
 */
function KeyButton({ k }: { k: Key }) {
  return (
    <button
      type="button"
      class={k.isPrimary ? 'key primary' : 'key'}
      disabled={isOpenGuarded()}
      onClick={() => {
        if (!isOpenGuarded()) k.run()
      }}
    >
      {k.label}
    </button>
  )
}

function TypeField({ row }: { row: Row }) {
  const typed = row.typing!
  const submit = (e: Event) => {
    e.preventDefault()
    const text = (drafts.get(row.id) ?? '').trim()
    if (!text) return
    typing = null
    typed.send(text)
  }

  return (
    <form onSubmit={submit}>
      <input
        id={`type-${row.id}`}
        value={drafts.get(row.id) ?? ''}
        placeholder={typed.hint}
        aria-label={typed.hint}
        onInput={e => drafts.set(row.id, e.currentTarget.value)}
      />
      <button type="submit" class="key">
        Send
      </button>
      <button
        type="button"
        class="key"
        onClick={() => {
          typing = null
          draw()
        }}
      >
        Cancel
      </button>
    </form>
  )
}

/** A row's last press, "✓ Explain" or "Queued: Explain". A row whose own mark is a ✓ leaves out the second one. */
function feedbackLabel(row: Row): string | null {
  const f = row.feedback
  if (!f) return null

  return f.is === 'done' && row.handleTone === 'done' ? f.label : feedbackText(f, 'html')
}

/** The feedback with its age. A note, a Local result and a message not sent read alone, with no age. */
function lastText(row: Row, now: number): string | null {
  const f = row.feedback
  if (!f) return null

  return hasAge(f) ? `${feedbackLabel(row)} · ${ago(now - f.at)}` : feedbackLabel(row)
}

/** A row's note while it shows. */
function noteOf(id: string): string | null {
  const n = notes.get(id)

  return n && Date.now() - n.at < SETTLED_MS ? n.text : null
}

/** The row's own note, error or copy box replaces its feedback while it shows. */
function isFeedbackShown(row: Row): boolean {
  return !errors.has(row.id) && noteOf(row.id) === null && !copies.has(row.id)
}

/** Whether a row appeared less than NEW_ROW_MS ago, so it draws a bar. */
function isNew(id: string): boolean {
  const at = arrived.get(id)

  return at !== undefined && Date.now() - at < NEW_ROW_MS
}

function ListRow({
  row,
  tone,
  isSelected,
  onSelect,
  now,
}: {
  row: Row
  /** The tab's color, for the bar of a row that just appeared. */
  tone: Tone
  isSelected: boolean
  onSelect: () => void
  now: number
}) {
  const bar = isNew(row.id) ? ` new tone-bar-${tone}` : ''
  // A last action is green only on a row that shows a ✓. On a row still open it is muted, so it does not read as an answer,
  // and so is a message still queued, which has not reached Codex.
  const lastTone = row.handleTone === 'done' && row.feedback?.is !== 'queued' ? 'tone-done' : 'muted'
  const handle = <span class={`mark ${row.handleTone ?? ''}`}>{row.handle}</span>

  if (!isSelected) {
    const plain = row.line ?? { text: row.title, after: row.titleAfter }
    // A row's last action takes the place of its age, as "✓ Discuss 1m ago".
    const last = isFeedbackShown(row) ? lastText(row, now) : null
    const line = last
      ? {
          ...plain,
          after: ` · ${last}`,
          afterTone: isFailure(row.feedback)
            ? ('error' as const)
            : row.handleTone === 'done' && row.feedback?.is === 'done'
              ? ('done' as const)
              : undefined,
        }
      : plain

    return (
      <div class={`row${bar}`}>
        {handle}
        <button type="button" class="line" onClick={onSelect}>
          <span class={row.hasSecondLine ? 'text two' : 'text'}>{line.text}</span>
          {line.after ? (
            <span class={`after ${line.afterTone ? `tone-${line.afterTone}` : ''}`}>{line.after}</span>
          ) : null}
        </button>
      </div>
    )
  }

  const isOpen = !row.fold || details.has(row.id)
  const { keys, more } = rowActions(row)
  const last = isFeedbackShown(row) ? lastText(row, now) : null
  const status = [row.fold?.note, isFailure(row.feedback) ? null : last]
  const failure = isFailure(row.feedback) ? last : null
  const copied = copies.get(row.id)
  const note = noteOf(row.id)

  return (
    <div class={`row selected${bar}`}>
      {handle}
      <div class="content">
        <div class="tight">
          {row.meta ? <div class="meta">{row.meta}</div> : null}
          <div class="title">
            {row.title}
            {row.titleAfter ? <span class="after">{row.titleAfter}</span> : null}
          </div>
        </div>
        {isOpen && row.body ? <div class="body">{row.body}</div> : null}
        {status.some(Boolean) || failure || sending.has(row.id) || note || errors.has(row.id) ? (
          <div class="tight">
            {status.filter(Boolean).map(s => (
              <div class={lastTone}>{s}</div>
            ))}
            {failure ? <div class="tone-error">{failure}</div> : null}
            {sending.has(row.id) ? <div class="muted">{sending.get(row.id)}</div> : null}
            {note ? <div class="muted">{note}</div> : null}
            {errors.has(row.id) ? <div class="tone-error">{errors.get(row.id)}</div> : null}
          </div>
        ) : null}
        <div class="keys">
          {keys.map(k => (
            <KeyButton k={k} />
          ))}
          {keys.length > 0 && more.length > 0 ? <span class="key-dot">·</span> : null}
          {more.map(k => (
            <KeyButton k={k} />
          ))}
        </div>
        {row.typing && typing === row.id ? <TypeField row={row} /> : null}
        {copied ? (
          <div>
            <div class="muted">Copy {copied.name} from here:</div>
            <textarea rows={3} readOnly value={copied.text} onFocus={e => e.currentTarget.select()} />
            <button
              type="button"
              class="key"
              onClick={() => {
                copies.delete(row.id)
                draw()
              }}
            >
              Close
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** A row that just closed, with its outcome, [Undo] after the person's own Done or Dismiss, and its leave bar. */
function SettledView({ settled: r, state }: Extract<Entry, { settled: RowView }>) {
  const start = seen.get(r.id) ?? Date.now()

  return (
    <div class="row settled">
      {/* The ✓ waits for an answer's message to reach Codex. */}
      <span class="mark done">{state.isQueued ? '' : '✓'}</span>
      <div class="content tight">
        <div class="what">{r.title}</div>
        <div>
          <span class={state.isQueued ? 'muted' : 'tone-done'}>
            {state.isQueued ? `Queued: ${state.label}` : state.label}
          </span>
          {state.canUndo ? (
            <button type="button" class="key" onClick={() => undo(r)}>
              Undo
            </button>
          ) : null}
        </div>
        <div class="leave">
          {/* The bar's delay is set once, when it is drawn: the animation keeps its own clock after that. */}
          <div
            style={{ animationDuration: `${SETTLED_MS}ms` }}
            ref={el => {
              if (el && !el.style.animationDelay) el.style.animationDelay = `-${Math.max(0, Date.now() - start)}ms`
            }}
          />
        </div>
      </div>
    </div>
  )
}

/** A list's rows, with the rows that just closed in their places. */
function Entries({
  v,
  entries,
  group,
  all,
  now,
}: {
  v: View
  entries: Entry[]
  group: Group
  all: Row[]
  now: number
}) {
  const t: Tab = group === 'finding' ? 'findings' : 'needsYou'
  const at = selectedIndex(all, t, v)
  if (entries.length === 0) return null

  // Needs you hangs its rows from each group's title, as the pane does; Findings lists them flat.
  return (
    <div class={group === 'finding' ? 'flat' : 'tree'}>
      {entries.map(x =>
        'row' in x ? (
          <div class="entry" key={x.row.id}>
            <ListRow
              row={x.row}
              tone={t}
              now={now}
              isSelected={all.indexOf(x.row) === at}
              onSelect={() => select(t, all, all.indexOf(x.row))}
            />
          </div>
        ) : (
          <div class="entry" key={`settled-${x.settled.id}`}>
            <SettledView settled={x.settled} state={x.state} />
          </div>
        ),
      )}
    </div>
  )
}

function GroupTitle({ title, count }: { title: string; count: number }) {
  return (
    <div class="group-title">
      {title}
      {count > 0 ? <span class="count">{count}</span> : null}
    </div>
  )
}

/** A group's closed items as its fold lists them: without the rows drawn settled, up to CLOSED_SHOWN. */
function itemsClosed(v: View, kind: 'question' | 'task', entries: Entry[]): ClosedLine[] {
  return closedShown(v.needsYou.closed[kind === 'question' ? 'questions' : 'tasks'], settledIn(entries)).map(d => ({
    id: d.id,
    ask: d.ask,
    outcome: d.outcome,
    isLapsed: isLapsed(d),
    at: d.at,
  }))
}

function ItemGroup({
  v,
  kind,
  entries,
  all,
  now,
}: {
  v: View
  kind: 'question' | 'task'
  entries: Entry[]
  all: Row[]
  now: number
}) {
  const title = kind === 'question' ? 'Questions' : 'Tasks'
  const closed = itemsClosed(v, kind, entries)
  // A group with no open, settled or closed items is left out.
  if (entries.length === 0 && closed.length === 0) return null
  const rows = entries.flatMap(x => ('row' in x ? [x.row] : []))

  return (
    <section>
      {/* A row handed to Codex stays listed but leaves the count. */}
      <GroupTitle title={title} count={rows.filter(r => !r.fold).length} />
      <Entries v={v} entries={entries} group={kind} all={all} now={now} />
      <ClosedFold group={kind} closed={closed} now={now} />
    </section>
  )
}

/** A closed item or finding as a Closed fold lists it. */
type ClosedLine = {
  id: string
  ask: string
  outcome: string
  /** Closed without the person deciding it: dismissed, expired, or overtaken by the work. */
  isLapsed: boolean
  at: number
}

/** A list's closed items or findings behind `▸ N Closed`, each with how it closed and when. */
function ClosedFold({ group, closed, now }: { group: Group; closed: ClosedLine[]; now: number }) {
  if (closed.length === 0) return null
  const isUnfolded = unfolded.has(group)

  return (
    <>
      <button
        type="button"
        class="fold"
        onClick={() => {
          if (isUnfolded) unfolded.delete(group)
          else unfolded.add(group)
          draw()
        }}
      >
        <span class="fold-mark">{isUnfolded ? '▾' : '▸'}</span>
        {closed.length} Closed
      </button>
      {isUnfolded ? (
        <div class="tree closed-tree">
          {closed.map(d => (
            <div class="entry" key={`closed-${d.id}`}>
              <div class="row">
                <span class="mark">◇</span>
                <div class="content tight">
                  <div class="muted">{d.ask}</div>
                  <div>
                    <span class={d.isLapsed ? 'outcome lapsed' : 'outcome'}>{capitalized(d.outcome)}</span>
                    <span class="muted"> · {ago(now - d.at)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  )
}

/**
 * What Needs you reads above its rows, or in place of its empty text, when the
 * session's hooks have not all run, so the list does not read as complete. Null when they have.
 */
function notHeardText(v: View): [string, string] | null {
  if (v.heard === 'heard') return null

  return [
    'The inbox has not heard from this chat’s hooks.',
    v.heard === 'none'
      ? 'Codex runs a plugin’s hooks only after you trust them.'
      : 'Items from Codex’s replies are missing.',
  ]
}

function NeedsYou({ v, lists, now }: { v: View; lists: Lists; now: number }) {
  const all = lists.byTab.needsYou
  const isNothing = lists.questions.length === 0 && lists.tasks.length === 0
  const hasClosed =
    itemsClosed(v, 'question', lists.questions).length > 0 || itemsClosed(v, 'task', lists.tasks).length > 0
  const notHeard = notHeardText(v)
  if (isNothing && !hasClosed)
    return notHeard ? (
      <div class="empty">
        <div class="title">{notHeard[0]}</div>
        <div class="muted">{notHeard[1]}</div>
      </div>
    ) : (
      <div class="empty">
        <div class="title">Nothing needs you.</div>
      </div>
    )

  // With closed items still shown, the empty text is one line above them.
  return (
    <main>
      {notHeard ? (
        <section>
          <div class="group-title">
            {notHeard[0]}
            <div class="muted">{notHeard[1]}</div>
          </div>
        </section>
      ) : isNothing ? (
        <section>
          <div class="group-title empty-line">Nothing needs you.</div>
        </section>
      ) : null}
      <ItemGroup v={v} kind="question" entries={lists.questions} all={all} now={now} />
      <ItemGroup v={v} kind="task" entries={lists.tasks} all={all} now={now} />
    </main>
  )
}

function Findings({ v, lists, now }: { v: View; lists: Lists; now: number }) {
  // A finding stays listed until Codex closes it or the person dismisses it. Then it settles and moves to Closed.
  const closed = closedShown(v.findings.closed, settledIn(lists.findings)).map(f => ({
    id: f.id,
    ask: f.title,
    outcome: f.outcome,
    isLapsed: isLapsed(f),
    at: f.closedAt,
  }))
  const isNothing = lists.findings.length === 0
  if (isNothing && closed.length === 0)
    return (
      <div class="empty">
        <div class="title">No findings yet</div>
        <div class="muted">Codex flags issues and opportunities it spots beyond your task.</div>
      </div>
    )

  // With closed findings still shown, the empty text is one line above them.
  return (
    <main>
      <section>
        {isNothing ? <div class="group-title empty-line">No open findings.</div> : null}
        <Entries v={v} entries={lists.findings} group="finding" all={lists.byTab.findings} now={now} />
        <ClosedFold group="finding" closed={closed} now={now} />
      </section>
    </main>
  )
}

/** How long polls may fail before "retrying" turns red. */
const LATE_READ_MS = 60_000

/**
 * Line 1, the count and the status, and line 2, the goal and its current step,
 * since the tab has no band. While polls fail, the status says when the view shown was read.
 */
function Heading({ v, now }: { v: View; now: number }) {
  const { changedAt, isUpdating, error } = v.status
  const sinceRead = Date.now() - readAt
  const status =
    pollFailures >= 2 ? (
      <span class={sinceRead > LATE_READ_MS ? 'tone-error' : undefined}>Last read {ago(sinceRead)} · retrying</span>
    ) : isUpdating ? (
      'Updating…'
    ) : changedAt !== null ? (
      `Updated ${ago(now - changedAt)}`
    ) : (
      'Not updated yet'
    )
  const findings = v.findings.count
  const counts = [
    v.needsYou.count > 0 ? <span class="tone-needsYou">{v.needsYou.count} need you</span> : null,
    findings > 0 ? <span class="tone-findings">{findings === 1 ? '1 finding' : `${findings} findings`}</span> : null,
  ].filter(x => x !== null)

  return (
    <header>
      <div class="line-one">
        <span class="counts">
          {counts.map((c, n) => (
            <span key={n}>
              {n > 0 ? <span class="muted"> · </span> : null}
              {c}
            </span>
          ))}
        </span>
        <div class="status">
          {status}
          {error ? <div class="tone-error">{error}</div> : null}
          {lineNote && Date.now() - lineNote.at < SETTLED_MS ? <div class="muted">{lineNote.text}</div> : null}
        </div>
      </div>
      {v.goal ? (
        <div class="goal">
          <span class="goal-mark">◆ </span>
          {v.goal}
          {v.now ? <span class="muted"> · {v.now}</span> : null}
        </div>
      ) : null}
    </header>
  )
}

function TabBar({ v }: { v: View }) {
  const counts: Record<Tab, number> = { needsYou: v.needsYou.count, findings: v.findings.count }

  return (
    <nav>
      <div class="tabs">
        {TABS.map(t => (
          <button
            type="button"
            class={`tab ${tab === t.id ? 'shown' : ''}`}
            onClick={() => {
              tab = t.id
              draw()
            }}
          >
            {t.label}
            {counts[t.id] > 0 ? <span class={`count tone-${t.id}`}>{counts[t.id]}</span> : null}
          </button>
        ))}
      </div>
    </nav>
  )
}

/** Switches between the conversation's inbox and the demo. The new view starts fresh, so no row reads as just closed or new. */
async function toggleDemo() {
  isDemo = !isDemo
  view = null
  seen = new Map()
  rowsSeen = null
  arrived.clear()
  selection.needsYou = null
  selection.findings = null
  typing = null
  draw()
  await read()
}

function App(): ComponentChildren {
  if (!view)
    return readFailed ? (
      <div class="notice">
        Could not read the inbox.{' '}
        <button type="button" class="key" onClick={() => void read()}>
          Try again
        </button>
      </div>
    ) : (
      <div class="notice">
        <span class="muted">Loading…</span>
      </div>
    )
  const v = view
  const now = v.at
  const lists = listsOf(v, drawnSettled(seen, Date.now()))

  return (
    <>
      {isDemo ? (
        <div class="demo-note">
          <span>Showing sample entries. Presses here send nothing.</span>
          <button type="button" class="key" onClick={() => void toggleDemo()}>
            Hide demo
          </button>
        </div>
      ) : null}
      <Heading v={v} now={now} />
      <TabBar v={v} />
      {tab === 'needsYou' ? <NeedsYou v={v} lists={lists} now={now} /> : <Findings v={v} lists={lists} now={now} />}
      <footer>
        {isDemo ? null : (
          <button type="button" class="demo-toggle" onClick={() => void toggleDemo()}>
            Show demo
          </button>
        )}
      </footer>
    </>
  )
}

const root = document.getElementById('app')!

function draw() {
  // The page's "Loading…" text is not Preact's, so it goes before the first draw.
  if (root.className) {
    root.className = ''
    root.textContent = ''
  }
  render(<App />, root)
  if (focusTyping && typing) {
    focusTyping = false
    document.getElementById(`type-${typing}`)?.focus()
  }
}

// ── Keys ────────────────────────────────────────────────────────────────────

// The pane's keys, while the tab has focus. A text field takes its own keys, and
// a held modifier leaves the key to the app.
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || !view) return
  const target = e.target as HTMLElement | null
  if (target?.closest('input, textarea')) {
    if (e.key === 'Escape' && target.tagName === 'INPUT') {
      typing = null
      draw()
    }
    return
  }
  const switched = TABS.find(t => t.hotkey === e.key)
  if (switched) {
    tab = switched.id
    draw()
    return
  }
  const rows = listsOf(view, drawnSettled(seen, Date.now())).byTab[tab]
  const at = selectedIndex(rows, tab, view)
  const move = e.key === 'j' || e.key === 'ArrowDown' ? 1 : e.key === 'k' || e.key === 'ArrowUp' ? -1 : 0
  if (move !== 0) {
    e.preventDefault()
    select(tab, rows, Math.max(0, Math.min(rows.length - 1, at + move)))
    document.querySelector('.row.selected')?.scrollIntoView({ block: 'nearest' })
    return
  }
  const row = rows[at]
  if (!row) return
  const { keys, more } = rowActions(row)
  const k = [...keys, ...more].find(x => x.hotkey === e.key)
  if (k) {
    e.preventDefault()
    k.run()
  }
})

request('ui/initialize', {
  protocolVersion: '2026-01-26',
  appInfo: { name: 'inbox', version: '0.1.0' },
  appCapabilities: { tools: {} },
})
  .then(r => {
    applyHost((r as { hostContext?: Parameters<typeof applyHost>[0] } | undefined)?.hostContext ?? {})
    parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: {} }, '*')
    void poll()
  })
  .catch(() => {
    root.textContent = 'The inbox could not connect to Codex.'
  })
