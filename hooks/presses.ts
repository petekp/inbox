// What the person's presses send and how their buttons are labeled, the same
// in every host: each message goes to the agent as the person's own words.

import type { Closed, Delivery, Finding, Help, Item, LastAction, Ledger, LocalResult, RowNote, Turns } from '../types'
import { closeFinding, closeItem, reopenFinding, reopenItem } from './ledger'
import type { Press } from './ledger'
import { namedPrs, parseRef } from './prs'

export function clipLabel(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function baseName(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path
}

export function helpLabel(help: Help): string {
  const label =
    help.kind === 'open'
      ? `Open ${baseName(help.path)}`
      : help.kind === 'copy'
        ? `Copy ${help.name ?? 'snippet'}`
        : help.kind === 'run'
          ? `Run ${help.name ?? help.command}`
          : help.kind === 'terminal'
            ? `Copy ${help.name ?? help.command}`
            : `Open ${help.name ?? new URL(help.url).host}`

  return clipLabel(label, 32)
}

/** A path an item names, made absolute: `~/` from the home folder, a relative one from the session's folder. */
export function localPath(raw: string, root: string, home: string): string {
  if (raw.startsWith('~/')) return home + raw.slice(1)
  if (raw.startsWith('/')) return raw

  return `${root.replace(/\/$/, '')}/${raw.replace(/^\.\//, '')}`
}

// Files macOS `open` would run or install instead of showing.
const LAUNCHES =
  /\.(app|command|tool|terminal|workflow|scpt|scptd|applescript|pkg|mpkg|dmg|webloc|inetloc|fileloc|prefpane|kext)$/i

/**
 * The commands that open a local path. A folder, an executable, or anything
 * `open` would launch is shown in Finder instead. A file opens in the app
 * macOS assigns to its type, and `fallback` opens one with no assigned app
 * in the default text editor.
 */
export function openCommands(
  path: string,
  isFile: boolean,
  isExecutable: boolean,
): { argv: string[]; fallback: string[] | null } {
  if (!isFile || isExecutable || LAUNCHES.test(path)) return { argv: ['open', '-R', path], fallback: null }

  return { argv: ['open', path], fallback: ['open', '-t', path] }
}

/** One button's helps, used in order by one press. */
export type HelpStep = { label: string; step: Help[] }

/**
 * The item's helps as buttons. A snippet to copy and a file to open become one
 * step, "Copy env line and open .env.local", since the snippet goes in that file.
 */
export function steps(helps: Help[]): HelpStep[] {
  const copy = helps.find(h => h.kind === 'copy')
  const open = helps.find(h => h.kind === 'open')
  if (!copy || !open || copy.kind !== 'copy' || open.kind !== 'open')
    return helps.map(h => ({ label: helpLabel(h), step: [h] }))

  return helps
    .filter(h => h !== copy)
    .map(h =>
      h === open
        ? { label: clipLabel(`Copy ${copy.name ?? 'snippet'} and open ${baseName(open.path)}`, 48), step: [copy, open] }
        : { label: helpLabel(h), step: [h] },
    )
}

/** A PR the session tracks, which an item's ask can name as "#123". */
type TrackedPr = { ref: string; url: string | null }

/**
 * One step that opens the tracked PRs an item's ask names as "#123", as in
 * "Mark #12 ready for review". The reply that raised the item often names a PR
 * only by number, so the item has no link of its own. Several PRs share one
 * step, so a task naming five does not take five keys.
 */
export function prSteps(item: Item, tracked: TrackedPr[]): HelpStep[] {
  const urls = new Map(tracked.map(pr => [pr.ref, pr.url]))
  const links = namedPrs(item.ask, [...urls.keys()])
    .map(ref => {
      const { repo, number } = parseRef(ref)
      const url = urls.get(ref) ?? `https://github.com/${repo}/pull/${number}`
      return { kind: 'link' as const, url, name: `PR #${number}` }
    })
    .filter(l => !item.helps.some(h => h.kind === 'link' && h.url === l.url))

  return links.length === 0
    ? []
    : [{ label: links.length === 1 ? helpLabel(links[0]!) : `Open ${links.length} PRs`, step: links }]
}

/** An item's steps: its own helps, then the steps a host adds, such as `prSteps`. */
export function stepsOf(item: Item, extraSteps: HelpStep[]): HelpStep[] {
  return [...steps(item.helps), ...extraSteps]
}

/**
 * A task or finding handed to the agent waits on the agent until the update
 * for a turn started after the press has applied. Still open then, the agent's
 * reply did not finish it, so it waits on the person again. Counts lower than
 * at the press were reset, so the row no longer folds. A hand-off whose message
 * failed to send gave nothing away.
 */
export function isHandedOff(
  last: Pick<LastAction, 'kind' | 'turnsStarted' | 'delivery'> | undefined,
  turns: Turns,
): boolean {
  const pressed = last?.kind === 'handoff' && last.delivery?.state !== 'failed' ? last.turnsStarted : undefined

  return pressed !== undefined && pressed <= turns.turnsStarted && turns.turnsApplied <= pressed
}

/** A press on a question, task or finding row, in every host. An answer names its option by text. */
export type RowPress =
  | { action: 'answer'; id: string; option: string }
  | { action: 'type'; id: string; text: string }
  | { action: 'explain' | 'done' | 'dismiss' | 'address' | 'discuss' | 'undo'; id: string }
  | { action: 'step'; id: string; step: number; label: string }

/** The action ids of the mod's PR presses: on a review thread, on a PR block, and a check's Open log. */
export type PrActionId =
  | 'thread-address'
  | 'thread-draft'
  | 'thread-open'
  | 'thread-discuss'
  | 'pr-conflicts'
  | 'pr-address-all'
  | 'pr-open'
  | 'pr-dismiss'
  | 'log'

/** The id a press's last action stores, the same in every host: `explain`, `step-2`, `thread-address`. */
export function actionId(p: RowPress | { action: PrActionId }): string {
  return p.action === 'step' ? `step-${p.step}` : p.action
}

/** What a row reads after a ✓ once this press went through: "Explain", "Reply", or the step's own label. */
function pressText(p: RowPress): string {
  switch (p.action) {
    case 'answer':
      return p.option
    case 'type':
      return 'Reply'
    case 'step':
      return p.label
    default:
      return capitalized(p.action)
  }
}

export function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** A step's icon kind: run when it asks the agent to run a command, else copy or open by its first help. */
export function stepIconKind(step: HelpStep | undefined): 'run' | 'copy' | 'open' | undefined {
  if (!step) return undefined
  if (step.step.some(h => h.kind === 'run')) return 'run'
  const first = step.step[0]?.kind
  return first === 'copy' || first === 'terminal' ? 'copy' : first === 'open' || first === 'link' ? 'open' : undefined
}

/** Old stored actions that hand work off, for a last action saved before it said so. */
const HANDOFF_IDS = /^(address|type|step-\d+|thread-address|pr-conflicts|pr-address-all)$/

type Rename = [RegExp, string | ((old: string) => string)]

const PR_RENAMES: Rename[] = [
  [/^address-all-/, 'pr-address-all'],
  [/^resolve-/, 'pr-conflicts'],
]

const THREAD_RENAMES: Rename[] = [
  [/^address-/, 'thread-address'],
  [/^draft-/, 'thread-draft'],
  [/^discuss-/, 'thread-discuss'],
]

const ROW_RENAMES: Rename[] = [
  [/^explain(-|$)/, 'explain'],
  [/^(help-.+-|step-)\d+$/, old => `step-${old.split('-').pop()}`],
  [/^typed$/, 'type'],
  [/^address(-|$)/, 'address'],
  [/^discuss(-|$)/, 'discuss'],
]

/**
 * A last action saved by an earlier build in today's shape, or null when its
 * action no longer records one. The row's key says which table its old action
 * is read with, since `address-` and `discuss-` named both finding and thread actions.
 */
function upgradedLastAction(key: string, old: Omit<LastAction, 'kind'> & { isHandoff?: boolean }): LastAction | null {
  const renames = key.startsWith('pr:') ? PR_RENAMES : key.includes(' thread ') ? THREAD_RENAMES : ROW_RENAMES
  const found = renames.find(([pattern]) => pattern.test(old.action))
  const action = found ? (typeof found[1] === 'function' ? found[1](old.action) : found[1]) : null
  if (action === null) return null
  const { isHandoff, ...kept } = old
  const isHandedOff = isHandoff ?? HANDOFF_IDS.test(action)

  return {
    ...kept,
    kind: isHandedOff ? 'handoff' : 'talk',
    action,
    // Earlier builds saved "Explain sent" or "Sent to Claude to fix"; a last action is now the label pressed.
    text: /^Sent to (Claude|Codex) to /.test(old.text) ? 'Address' : old.text.replace(/ sent$/, ''),
  }
}

/**
 * Converts the last actions an earlier build saved, which have no `kind`, and
 * drops those whose action records nothing now. One that has a `kind` stays as
 * it is, so converting twice changes nothing.
 */
export function upgradeLastActions(saved: Record<string, LastAction>): Record<string, LastAction> {
  return Object.fromEntries(
    Object.entries(saved).flatMap(([key, entry]) => {
      // Earlier builds kept where a removed row stood, and its title, so it showed in place. Nothing reads them now.
      const {
        tab: _tab,
        title: _title,
        index: _index,
        ...last
      } = entry as LastAction & Partial<Record<'tab' | 'title' | 'index', unknown>>
      if ('kind' in last && last.kind) return [[key, last]]
      const upgraded = upgradedLastAction(key, last)
      return upgraded ? [[key, upgraded]] : []
    }),
  )
}

/**
 * What a press asks its host to do outside saved state: send a message as the
 * person's own, open a path or URL, or copy text. `by` marks a send the
 * per-turn update reads as a press; `isCommand` marks a command only the person can run.
 */
export type Effect =
  | { kind: 'send'; text: string; by: Press | null }
  | { kind: 'open'; target: string; name: string }
  | { kind: 'copy'; text: string; name: string; isCommand: boolean }

/**
 * A press's outcome: the new ledger, the pressed row's new last action, and the
 * effects to perform. `last` null leaves the row's last action as it was.
 * `stale` when the row the press was drawn for is gone or changed under it.
 */
export type PressResult = { ledger: Ledger; last: LastAction | null; effects: Effect[] } | { stale: true }

/** Whether a close can be undone: the person's own Done or Dismiss, which sent nothing. */
export function isUndoable(how: Closed['how']): boolean {
  return how === 'done' || how === 'dismissed'
}

/** What a row reads after a press that found it gone or changed. */
const STALE_TEXT = 'This changed before your press. Nothing was sent.'

/** What a row's note reads: after a stale press, or after a press on a sample entry. */
export function noteText(note: RowNote['note']): string {
  return note === 'sample' ? 'Sample entry: nothing was sent.' : STALE_TEXT
}

/** A help as the effect it asks for; a Run help asks the agent, as the person, to run its command. */
function helpEffect(item: Item, help: Help): Effect {
  switch (help.kind) {
    case 'run':
      return { kind: 'send', text: messages.run(item, help.command), by: { id: item.id, action: 'run' } }
    case 'open':
      return { kind: 'open', target: help.path, name: baseName(help.path) }
    case 'link':
      return { kind: 'open', target: help.url, name: help.name ?? help.url }
    case 'copy':
      return { kind: 'copy', text: help.text, name: help.name ?? 'snippet', isCommand: false }
    case 'terminal':
      return { kind: 'copy', text: help.command, name: help.name ?? clipLabel(help.command, 32), isCommand: true }
  }
}

/** The effects one press of a step asks for, in the order its helps run. */
export function stepEffects(item: Item, step: HelpStep): Effect[] {
  return step.step.map(h => helpEffect(item, h))
}

/** A Local press's opens and copies, each pending until its host has run it. */
export function pendingResult(effects: Effect[], at: number): LocalResult {
  return {
    state: 'pending',
    parts: effects.flatMap(e =>
      e.kind === 'send'
        ? []
        : [{ kind: e.kind, name: e.name, isCommand: e.kind === 'copy' && e.isCommand, error: null }],
    ),
    at,
  }
}

/** A pending result once each part ran: `errors` gives each part's failure in order, or null where it worked. */
export function finishedResult(pending: LocalResult, errors: (string | null)[], at: number): LocalResult {
  const parts = pending.parts.map((part, n) => ({ ...part, error: errors[n] ?? null }))

  return { state: parts.some(part => part.error !== null) ? 'failed' : 'done', parts, at }
}

/**
 * The last action a Local press leaves. A row's Talk, Hand-off or Mark entry
 * keeps everything but its result, so a handed-off row stays folded and out of
 * the count. A row with no such entry gets a local one.
 */
export function localLast(
  last: LastAction | undefined,
  pressed: Pick<LastAction, 'action' | 'text'>,
  result: LocalResult,
): LastAction {
  return last && last.kind !== 'local' ? { ...last, result } : { kind: 'local', ...pressed, at: result.at, result }
}

/**
 * Writes a Local press's finished result on its row, unless a later press has
 * replaced the pending one, which `pendingAt` names.
 */
export function withResult(
  lastActions: Record<string, LastAction>,
  rowId: string,
  pendingAt: number,
  result: LocalResult,
): Record<string, LastAction> {
  const last = lastActions[rowId]
  if (last?.result?.state !== 'pending' || last.result.at !== pendingAt) return lastActions

  return { ...lastActions, [rowId]: { ...last, result } }
}

/**
 * Applies a press on a question, task or finding row, the same in every host.
 * Pure: it reads only its arguments. `last` is the row's current last action,
 * which a Local press keeps. `ctx.extraSteps` are the steps the host drew
 * beyond the item's own helps, so a step press is checked against what was drawn.
 * A press that sends records its message as queued until its host sees it arrive.
 */
export function applyPress(
  ledger: Ledger,
  last: LastAction | undefined,
  p: RowPress,
  ctx: { now: number; turnsStarted: number; extraSteps: HelpStep[] },
): PressResult {
  const r = pressed(ledger, last, p, ctx)

  return 'stale' in r || !r.last ? r : { ...r, last: withQueued(r.last, r.effects) }
}

/** A press's last action with its message queued, when the press sends one. A press with several sends is matched by its first. */
export function withQueued(last: LastAction, effects: Effect[]): LastAction {
  const send = effects.find(e => e.kind === 'send')

  return send ? { ...last, delivery: { state: 'queued', message: send.text } } : last
}

/**
 * Last actions once a message entered as a turn's prompt: the oldest press
 * still queued with that text arrived. Every row that one press recorded
 * arrives together, as a PR's Address all records each thread it sends.
 */
export function withArrival(lastActions: Record<string, LastAction>, message: string): Record<string, LastAction> {
  const isWaiting = (a: LastAction) => a.delivery?.state === 'queued' && a.delivery.message === message
  const waiting = Object.values(lastActions).filter(isWaiting)
  if (waiting.length === 0) return lastActions
  const at = Math.min(...waiting.map(a => a.at))

  return Object.fromEntries(
    Object.entries(lastActions).map(([id, a]) => [
      id,
      isWaiting(a) && a.at === at ? { ...a, delivery: { state: 'arrived' as const } } : a,
    ]),
  )
}

/** Replaces the delivery of each row the press made at `at` that is still queued and passes `matches`. */
function withQueuedDelivery(
  lastActions: Record<string, LastAction>,
  rows: string[],
  at: number,
  matches: (message: string) => boolean,
  delivery: Delivery,
): Record<string, LastAction> {
  const changed = rows.flatMap(id => {
    const a = lastActions[id]
    return a?.at === at && a.delivery?.state === 'queued' && matches(a.delivery.message)
      ? [[id, { ...a, delivery }] as const]
      : []
  })

  return changed.length === 0 ? lastActions : { ...lastActions, ...Object.fromEntries(changed) }
}

/**
 * Last actions once a press's message failed to send: each row the press made
 * at `at` reads why. A row pressed again since keeps its newer press.
 */
export function withFailure(
  lastActions: Record<string, LastAction>,
  rows: string[],
  at: number,
  reason: string,
): Record<string, LastAction> {
  return withQueuedDelivery(lastActions, rows, at, () => true, { state: 'failed', reason })
}

/**
 * Last actions once a press's message entered as `entered`, which another
 * plugin rewrote it to: each row the press made at `at` that still waits for
 * `message` waits for `entered` instead, so its arrival matches.
 */
export function withRewrite(
  lastActions: Record<string, LastAction>,
  rows: string[],
  at: number,
  message: string,
  entered: string,
): Record<string, LastAction> {
  return withQueuedDelivery(lastActions, rows, at, m => m === message, { state: 'queued', message: entered })
}

/**
 * The ledger once an answer's message failed to send: the question the answer
 * closed at `at` opens again, as it was. Any later close of it stands.
 */
export function reopenOnFailure(ledger: Ledger, id: string, at: number): Ledger {
  if (ledger.items.some(i => i.id === id)) return ledger
  const closed = ledger.closed.findLast(c => c.id === id)

  return closed?.item && closed.how === 'answered' && closed.at === at ? reopenItem(ledger, id) : ledger
}

/**
 * The press [Try again] repeats on a row whose message failed to send, or null.
 * A typed reply has none: its words go back into the row's draft instead.
 */
export function retryOf(id: string, last: LastAction): RowPress | null {
  if (!/^[if]\d+$/.test(id)) return null
  const step = /^step-(\d+)$/.exec(last.action)
  if (step) return { action: 'step', id, step: Number(step[1]), label: last.text }
  switch (last.action) {
    case 'answer':
      return { action: 'answer', id, option: last.text }
    case 'explain':
    case 'address':
    case 'discuss':
      return { action: last.action, id }
    default:
      return null
  }
}

/** The last action a press records on its row. */
export function recordPress(
  kind: LastAction['kind'],
  action: string,
  text: string,
  ctx: { now: number; turnsStarted: number },
): LastAction {
  return { kind, action, text, at: ctx.now, turnsStarted: ctx.turnsStarted }
}

function pressed(
  ledger: Ledger,
  last: LastAction | undefined,
  p: RowPress,
  ctx: { now: number; turnsStarted: number; extraSteps: HelpStep[] },
): PressResult {
  const stale = { stale: true as const }
  const record = (kind: LastAction['kind']) => recordPress(kind, actionId(p), pressText(p), ctx)
  const unchanged = { ledger, last: null, effects: [] }

  if (p.action === 'undo') {
    // Only the person's own Done or Dismiss undoes, so an old drawing cannot reopen an answered, expired or agent-closed row.
    if (ledger.items.some(i => i.id === p.id) || ledger.findings.some(f => f.id === p.id)) return stale
    const closed = ledger.closed.findLast(c => c.id === p.id)
    if (closed?.item && isUndoable(closed.how)) return { ...unchanged, ledger: reopenItem(ledger, p.id) }
    const closedFinding = ledger.closedFindings.findLast(f => f.id === p.id)
    if (closedFinding && isUndoable(closedFinding.how)) return { ...unchanged, ledger: reopenFinding(ledger, p.id) }
    return stale
  }

  const finding = ledger.findings.find(f => f.id === p.id)
  if (finding) {
    // A finding sent to the agent stays open until the agent closes it or the person dismisses it.
    const sendFinding = (kind: 'talk' | 'handoff', text: string) => ({
      ledger,
      last: record(kind),
      effects: [{ kind: 'send' as const, text, by: null }],
    })
    switch (p.action) {
      case 'address':
        return sendFinding('handoff', messages.finding(finding, 'address'))
      case 'discuss':
        return sendFinding('talk', messages.finding(finding, 'discuss'))
      case 'type': {
        const words = p.text.trim()
        return words ? sendFinding('handoff', messages.finding(finding, 'typed', words)) : unchanged
      }
      case 'dismiss':
        return {
          ledger: closeFinding(ledger, p.id, { how: 'dismissed', outcome: 'dismissed' }, ctx.now),
          last: null,
          effects: [],
        }
      default:
        return stale
    }
  }

  const item = ledger.items.find(i => i.id === p.id)
  if (!item) return stale
  const answered = (answer: string): PressResult => ({
    ledger: closeItem(ledger, item.id, { how: 'answered', outcome: answer }, ctx.now),
    last: record('mark'),
    effects: [{ kind: 'send', text: messages.answer(item, answer), by: { id: item.id, action: 'answer' } }],
  })
  switch (p.action) {
    case 'answer':
      return item.options.includes(p.option) ? answered(p.option) : stale
    case 'type': {
      const words = p.text.trim()
      if (!words) return unchanged
      if (item.kind === 'question') return answered(words)
      // A task stays open: the agent closes it once the reply settles it.
      return {
        ledger,
        last: record('handoff'),
        effects: [{ kind: 'send', text: messages.taskReply(item, words), by: null }],
      }
    }
    case 'explain':
      return {
        ledger,
        last: record('talk'),
        effects: [{ kind: 'send', text: messages.explain(item), by: { id: item.id, action: 'explain' } }],
      }
    case 'done':
      return { ledger: closeItem(ledger, item.id, { how: 'done', outcome: 'done' }, ctx.now), last: null, effects: [] }
    case 'dismiss':
      return {
        ledger: closeItem(ledger, item.id, { how: 'dismissed', outcome: 'dismissed' }, ctx.now),
        last: null,
        effects: [],
      }
    case 'step': {
      const step = stepsOf(item, ctx.extraSteps)[p.step]
      if (!step || step.label !== p.label) return stale
      const effects = stepEffects(item, step)
      if (effects.some(e => e.kind === 'send')) return { ledger, last: record('handoff'), effects }
      return {
        ledger,
        last: localLast(last, { action: actionId(p), text: pressText(p) }, pendingResult(effects, ctx.now)),
        effects,
      }
    }
    // Address and Discuss are a finding's.
    default:
      return stale
  }
}

/** A finding as the agent reads it back: its kind and title, its detail, and its file. */
function findingBody(finding: Finding): string[] {
  return [
    `${finding.kind === 'issue' ? 'Issue' : 'Opportunity'}: ${finding.title}`,
    finding.detail,
    ...(finding.path ? [`File: ${finding.path}`] : []),
  ]
}

/** The message each press sends. */
export const messages = {
  answer: (item: Item, answer: string) => `Re "${item.ask}": ${answer}`,
  /** Asks what an item is about. The item stays open, since nothing was decided. */
  explain: (item: Item) => {
    const what = item.kind === 'task' ? 'this task you left for me' : 'this question you asked me'
    const options = item.options.length > 0 ? `\nOptions: ${item.options.join(' / ')}` : ''

    return `Remind me what ${what} is about: why it came up, and what each choice would mean. Don't act on it yet.\n"${item.ask}"${options}`
  },
  run: (item: Item, command: string) => `For "${item.ask}", run this:\n\`\`\`\n${command}\n\`\`\``,
  taskReply: (item: Item, words: string) => `Re the task you left for me, "${item.ask}": ${words}`,
  /** Sends a finding back to the agent: to fix it, to talk it through first, or with the person's own words. */
  finding: (finding: Finding, how: 'address' | 'discuss' | 'typed', words = '') => {
    const opening =
      how === 'address'
        ? 'Please address this finding you recorded:'
        : how === 'discuss'
          ? "Let's talk through this finding you recorded before changing anything:"
          : 'About this finding you recorded:'

    return [opening, ...findingBody(finding), ...(how === 'typed' ? ['', words] : [])].join('\n')
  },
}
