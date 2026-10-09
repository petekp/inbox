// The Inbox tab beside a Codex conversation, bundled into tab.html. It polls
// the plugin's server for the view and sends presses back. Its layout follows
// the mod's /inbox pane: docs/plans/codex-tab.md.

import { render } from 'preact'
import type { ComponentChildren, JSX } from 'preact'

import { ago } from '../../hooks/ledger'
import { noteText, pendingResult, stepEffects } from '../../hooks/presses'
import type { RowPress } from '../../hooks/presses'
import { feedbackText, isFailure, SETTLED_MS } from '../../hooks/view'
import type { Feedback, RowView } from '../../hooks/view'
import type { Finding, Item, RowNote } from '../../types'
import type { TabView as View } from './core'

type Tab = 'needsYou' | 'findings'
type Tone = 'needsYou' | 'findings' | 'done' | 'error'
type Group = 'question' | 'task' | 'finding'

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

/** A row that just left its list, shown in its place until SETTLED_MS passes. */
type Settled = { id: string; group: Group; index: number; what: string; outcome: string; at: number }

// The keys of a question's answers and a task's steps, as the pane letters them.
const CHOICE_KEYS = [...'abcfghilm']
const TABS: { id: Tab; label: string; hotkey: string }[] = [
  { id: 'needsYou', label: 'Needs you', hotkey: '1' },
  { id: 'findings', label: 'Findings', hotkey: '2' },
]
const POLL_MS = 3000

let view: View | null = null
// The demo shows the mod's sample entries, and its presses send nothing.
let isDemo = false
let readFailed = false
let tab: Tab = 'needsYou'
const selection: Record<Tab, { id: string; index: number } | null> = { needsYou: null, findings: null }
let typing: string | null = null
let focusTyping = false
// Typed text by row, kept until it is sent, so a redraw, a new selection or a closed field keeps it.
const drafts = new Map<string, string>()
const details = new Set<string>()
// Questions whose every option shows. Until then, one with more than 5 options shows 4.
const optionsShown = new Set<string>()
const unfolded = new Set<'question' | 'task'>()
// What a row shows while its press runs: "Sending…", or a Local press's pending note.
const sending = new Map<string, string>()
const errors = new Map<string, string>()
// A row's stale or sample note, shown for SETTLED_MS from `at`.
const notes = new Map<string, { text: string; at: number }>()
const copies = new Map<string, { name: string; text: string }>()
// A note for a press whose row is no longer drawn, shown on line 1 for SETTLED_MS.
let lineNote: { text: string; at: number } | null = null
let settled: Settled[] = []
let order: Record<Group, string[]> = { question: [], task: [], finding: [] }
// Each view request takes the next number, and a reply older than the view shown is dropped.
let requested = 0
let shown = 0
let isPressing = false

// ── The host ────────────────────────────────────────────────────────────────

let nextId = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>()

function request(method: string, params: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*')
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

async function callTool<T>(name: string, args: unknown = {}): Promise<T | undefined> {
  const r = (await request('tools/call', { name, arguments: args })) as { structuredContent?: T } | undefined
  return r?.structuredContent
}

// ── The view ────────────────────────────────────────────────────────────────

function orderOf(v: View): Record<Group, string[]> {
  return {
    question: v.needsYou.questions.map(r => r.id),
    task: v.needsYou.tasks.map(r => r.id),
    finding: v.findings.rows.map(r => r.id),
  }
}

/** What a row that left says in its place, or null when it leaves without a trace, as a dismissed finding does. */
function leftText(prev: View, next: View, group: Group, id: string): { what: string; outcome: string } | null {
  if (group === 'finding') {
    const f = next.leaving.find(x => x.id === id)
    return f ? { what: f.title, outcome: f.text } : null
  }
  const d = next.closed.find(x => x.id === id)

  return d ? { what: d.ask, outcome: capitalized(d.outcome) } : null
}

function applyView(next: View, seq: number) {
  if (seq < shown) return
  shown = seq
  readFailed = false
  const now = Date.now()
  const nextOrder = orderOf(next)
  const left: Settled[] = []
  if (view)
    for (const group of Object.keys(order) as Group[])
      order[group].forEach((id, index) => {
        if (nextOrder[group].includes(id) || settled.some(s => s.id === id)) return
        const text = leftText(view!, next, group, id)
        if (text) left.push({ id, group, index, ...text, at: now })
      })
  settled = [...settled.filter(s => !nextOrder[s.group].includes(s.id)), ...left]
  if (left.length > 0) setTimeout(draw, SETTLED_MS + 50)
  order = nextOrder
  view = next
  draw()
}

async function poll() {
  if (!isPressing) {
    const seq = ++requested
    try {
      const v = await callTool<View>('inbox_view', { demo: isDemo })
      if (v) applyView(v, seq)
    } catch {
      readFailed = true
      draw()
    }
  }
  setTimeout(poll, POLL_MS)
}

type PressReply = {
  view?: View
  copy?: { text: string; name: string } | null
  error?: string | null
  note?: RowNote['note'] | null
}

/** Whether the view lists a row with this id. */
function isListed(v: View, id: string): boolean {
  return [...v.needsYou.questions, ...v.needsYou.tasks, ...v.findings.rows].some(r => r.id === id)
}

/**
 * Sends a press, drawn for the view's session, to the server. `onSent` runs
 * only once the press went through, so a stale or failed press keeps a typed draft.
 */
async function act(rowId: string, press: RowPress, onSent?: () => void, pending = 'Sending…') {
  sending.set(rowId, pending)
  errors.delete(rowId)
  notes.delete(rowId)
  copies.delete(rowId)
  draw()
  isPressing = true
  const seq = ++requested
  try {
    const r = await callTool<PressReply>('inbox_press', { press, thread: view?.thread, demo: isDemo })
    if (r?.error) errors.set(rowId, r.error)
    // A sample press went through on the demo's copy, so its typed words go as a real press's do.
    else if (r?.note !== 'stale') onSent?.()
    if (r?.copy) await copy(rowId, r.copy)
    if (r?.view) applyView(r.view, seq)
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
  const id = f.id

  return {
    id,
    handle: '•',
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
  questions: Row[]
  tasks: Row[]
  findings: Row[]
  /** Each tab's rows in order: the selection and the keys read these. */
  byTab: Record<Tab, Row[]>
}

function listsOf(v: View): Lists {
  const items = (rows: RowView[]) => rows.flatMap(r => (r.item ? [itemRow(v, r, r.item)] : []))
  const questions = items(v.needsYou.questions)
  const tasks = items(v.needsYou.tasks)
  const findings = v.findings.rows.flatMap(r => (r.finding ? [findingRow(v, r, r.finding)] : []))

  return {
    questions,
    tasks,
    findings,
    byTab: { needsYou: [...questions, ...tasks], findings },
  }
}

/** The selected row's index: the selected row, or the row now in its place once it left. */
function selectedIndex(rows: Row[], t: Tab): number {
  const s = selection[t]
  if (!s) return rows.length > 0 ? 0 : -1
  const at = rows.findIndex(r => r.id === s.id)

  return at >= 0 ? at : Math.min(s.index, rows.length - 1)
}

function select(t: Tab, rows: Row[], index: number) {
  const row = rows[index]
  if (!row) return
  selection[t] = { id: row.id, index }
  draw()
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

function KeyButton({ k }: { k: Key }) {
  return (
    <button type="button" class={k.isPrimary ? 'key primary' : 'key'} onClick={k.run}>
      {k.hotkey ? (
        <>
          <kbd>{k.hotkey}</kbd>:{' '}
        </>
      ) : null}
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
        <kbd>↵</kbd>: Send
      </button>
      <button
        type="button"
        class="key"
        onClick={() => {
          typing = null
          draw()
        }}
      >
        <kbd>esc</kbd>: Cancel
      </button>
    </form>
  )
}

/** A row's last press, "✓ Explain". A row whose own mark is a ✓ leaves out the second one. */
function feedbackLabel(row: Row): string | null {
  const f = row.feedback
  if (!f) return null

  return f.is === 'done' && row.handleTone === 'done' ? f.label : feedbackText(f, 'html')
}

/** The feedback with its age. A note and a Local result read alone, with no age. */
function lastText(row: Row, now: number): string | null {
  const f = row.feedback
  if (!f) return null

  return f.is === 'done' ? `${feedbackLabel(row)} · ${ago(now - f.at)}` : feedbackLabel(row)
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

function ListRow({
  row,
  isSelected,
  onSelect,
  now,
}: {
  row: Row
  isSelected: boolean
  onSelect: () => void
  now: number
}) {
  // A last action is green only on a row that shows a ✓. On a row still open it is muted, so it does not read as an answer.
  const lastTone = row.handleTone === 'done' ? 'tone-done' : 'muted'
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
      <div class="row">
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
    <div class="row selected">
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

function SettledView({ s }: { s: Settled }) {
  return (
    <div class="row settled">
      <span class="mark done">✓</span>
      <div class="content tight">
        <div class="what">{s.what}</div>
        <div class="tone-done">{s.outcome}</div>
        <div class="leave">
          {/* The bar's delay is set once, when it is drawn: the animation keeps its own clock after that. */}
          <div
            style={{ animationDuration: `${SETTLED_MS}ms` }}
            ref={el => {
              if (el && !el.style.animationDelay) el.style.animationDelay = `-${Math.max(0, Date.now() - s.at)}ms`
            }}
          />
        </div>
      </div>
    </div>
  )
}

/** A group's rows with the rows that just left spliced in where they were. */
function Entries({ rows, group, all, now }: { rows: Row[]; group: Group; all: Row[]; now: number }) {
  const t: Tab = group === 'finding' ? 'findings' : 'needsYou'
  const at = selectedIndex(all, t)
  const entries: ({ row: Row } | { settled: Settled })[] = rows.map(row => ({ row }))
  for (const s of settled.filter(x => x.group === group).sort((a, b) => a.index - b.index))
    entries.splice(Math.min(s.index, entries.length), 0, { settled: s })
  if (entries.length === 0) return null

  // Needs you hangs its rows from each group's title, as the pane does; Findings lists them flat.
  return (
    <div class={group === 'finding' ? 'flat' : 'tree'}>
      {entries.map(x =>
        'row' in x ? (
          <div class="entry" key={x.row.id}>
            <ListRow
              row={x.row}
              now={now}
              isSelected={all.indexOf(x.row) === at}
              onSelect={() => select(t, all, all.indexOf(x.row))}
            />
          </div>
        ) : (
          <div class="entry" key={`settled-${x.settled.id}`}>
            <SettledView s={x.settled} />
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

function ItemGroup({
  v,
  kind,
  rows,
  all,
  now,
}: {
  v: View
  kind: 'question' | 'task'
  rows: Row[]
  all: Row[]
  now: number
}) {
  const title = kind === 'question' ? 'Questions' : 'Tasks'
  const showing = new Set(settled.map(s => s.id))
  const closed = v.closed.filter(d => d.kind === kind && !showing.has(d.id))
  const isUnfolded = unfolded.has(kind)
  // A group with no open, settled or closed items is left out.
  if (rows.length === 0 && !settled.some(s => s.group === kind) && closed.length === 0) return null

  return (
    <section>
      {/* A row handed to Codex stays listed but leaves the count. */}
      <GroupTitle title={title} count={rows.filter(r => !r.fold).length} />
      <Entries rows={rows} group={kind} all={all} now={now} />
      {closed.length > 0 ? (
        <button
          type="button"
          class="fold"
          onClick={() => {
            if (isUnfolded) unfolded.delete(kind)
            else unfolded.add(kind)
            draw()
          }}
        >
          <span class="fold-mark">{isUnfolded ? '▾' : '▸'}</span>
          {closed.length} Closed
        </button>
      ) : null}
      {isUnfolded && closed.length > 0 ? (
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
    </section>
  )
}

function NeedsYou({ v, lists, now }: { v: View; lists: Lists; now: number }) {
  const all = lists.byTab.needsYou
  const isNothing = all.length === 0 && !settled.some(s => s.group !== 'finding')
  const showing = new Set(settled.map(s => s.id))
  if (isNothing && !v.closed.some(d => !showing.has(d.id)))
    return (
      <div class="empty">
        <div class="title">Nothing needs you.</div>
      </div>
    )

  // With closed items still shown, the empty text is one line above them.
  return (
    <main>
      {isNothing ? (
        <section>
          <div class="group-title empty-line">Nothing needs you.</div>
        </section>
      ) : null}
      <ItemGroup v={v} kind="question" rows={lists.questions} all={all} now={now} />
      <ItemGroup v={v} kind="task" rows={lists.tasks} all={all} now={now} />
    </main>
  )
}

function Findings({ lists, now }: { lists: Lists; now: number }) {
  if (lists.findings.length === 0 && !settled.some(s => s.group === 'finding'))
    return (
      <div class="empty">
        <div class="title">No findings yet</div>
        <div class="muted">Codex flags issues and opportunities it spots beyond your task.</div>
      </div>
    )

  return (
    <main>
      <section>
        <Entries rows={lists.findings} group="finding" all={lists.findings} now={now} />
      </section>
    </main>
  )
}

function TabBar({ v, now }: { v: View; now: number }) {
  const counts: Record<Tab, number> = { needsYou: v.needsYou.count, findings: v.findings.count }
  const { changedAt, isUpdating, error } = v.status
  const status = isUpdating ? 'Updating…' : changedAt !== null ? `Updated ${ago(now - changedAt)}` : 'Not updated yet'

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
      <div class="status">
        {status}
        {error ? <div class="tone-error">{error}</div> : null}
        {lineNote && Date.now() - lineNote.at < SETTLED_MS ? <div class="muted">{lineNote.text}</div> : null}
      </div>
    </nav>
  )
}

/** Switches between the conversation's inbox and the demo. The new view starts fresh, so no row reads as just closed. */
async function toggleDemo() {
  isDemo = !isDemo
  view = null
  settled = []
  order = { question: [], task: [], finding: [] }
  selection.needsYou = null
  selection.findings = null
  typing = null
  const seq = ++requested
  draw()
  try {
    const v = await callTool<View>('inbox_view', { demo: isDemo })
    if (v) applyView(v, seq)
  } catch {
    readFailed = true
    draw()
  }
}

function App(): ComponentChildren {
  if (!view)
    return <div class="notice">{readFailed ? 'Could not read the inbox.' : <span class="muted">Loading…</span>}</div>
  const v = view
  const now = v.at
  const lists = listsOf(v)

  return (
    <>
      {readFailed ? <div class="notice">Could not read the inbox.</div> : null}
      {isDemo ? (
        <div class="demo-note">
          <span>Showing sample entries. Presses here send nothing.</span>
          <button type="button" class="key" onClick={() => void toggleDemo()}>
            Hide demo
          </button>
        </div>
      ) : null}
      <TabBar v={v} now={now} />
      {tab === 'needsYou' ? <NeedsYou v={v} lists={lists} now={now} /> : <Findings lists={lists} now={now} />}
      <footer>
        <span>
          <kbd>1 2</kbd>Switch tabs<span class="sep">·</span>
          <kbd>j k</kbd>Select the next or previous row
        </span>
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
  settled = settled.filter(s => Date.now() - s.at < SETTLED_MS)
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
  const rows = listsOf(view).byTab[tab]
  const at = selectedIndex(rows, tab)
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
