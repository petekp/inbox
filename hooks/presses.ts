import type { Closed, Delivery, Finding, Help, Item, LastAction, Ledger, LocalResult, RowNote, Turns } from '../types'
import type { Run } from './gh'
import { closeFinding, closeItem, pruneClosed, reopenFinding, reopenItem } from './ledger'
import type { Press } from './ledger'
import { namedPrs, parseRef } from './prs'
import type { Pressed } from './session'
import { clipLabel } from './text'

export { clipLabel }

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

/** What a host can ask of the file system: a path's stat, or null when it is gone, and whether it can be run. */
export type PathProbe = {
  stat(path: string): Promise<{ isFile(): boolean } | null>
  isExecutable(path: string): Promise<boolean>
}

const OPEN_TIMEOUT_MS = 10_000

/** Opens a link, or a path as `openCommands` decides. Returns why it could not, or null. */
export async function openTarget(
  run: Run,
  probe: PathProbe,
  target: string,
  root: string,
  home: string,
): Promise<string | null> {
  const open = (argv: string[]) => run(argv, { cwd: '/', timeoutMs: OPEN_TIMEOUT_MS })
  const failure = (r: { code: number; stderr: string }) => r.stderr.trim() || `open exited ${r.code}`
  if (/^https:\/\//.test(target)) {
    const r = await open(['open', target])
    return r.code === 0 ? null : failure(r)
  }
  const path = localPath(target, root || '/', home)
  const info = await probe.stat(path)
  if (!info) return 'it no longer exists'
  const isFile = info.isFile()
  const isExecutable = isFile && (await probe.isExecutable(path))
  const { argv, fallback } = openCommands(path, isFile, isExecutable)
  const r = await open(argv)
  const retry = r.code !== 0 && fallback ? await open(fallback) : r

  return retry.code === 0 ? null : failure(retry)
}

export type HelpStep = { label: string; step: Help[] }

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

type TrackedPr = { ref: string; url: string | null }

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

export function stepsOf(item: Item, extraSteps: HelpStep[]): HelpStep[] {
  return [...steps(item.helps), ...extraSteps]
}

export function isAwaitingReply(
  last: Pick<LastAction, 'turnsStarted' | 'delivery'> | undefined,
  turns: Turns,
): boolean {
  const pressed = last?.delivery?.state !== 'failed' ? last?.turnsStarted : undefined

  return pressed !== undefined && pressed <= turns.turnsStarted && turns.turnsApplied <= pressed
}

export function isHandedOff(
  last: Pick<LastAction, 'kind' | 'turnsStarted' | 'delivery'> | undefined,
  turns: Turns,
): boolean {
  return last?.kind === 'handoff' && isAwaitingReply(last, turns)
}

export function isPrRowId(id: string): boolean {
  return id.startsWith('pr:') || id.includes(' ')
}

export function isFoldingPress(id: string, last: Pick<LastAction, 'kind' | 'action'> | undefined): boolean {
  return !id.startsWith('pr:') && last?.kind === 'handoff' && last.action !== 'address'
}

export function isFixSent(last: LastAction | undefined): last is LastAction {
  return last?.action === 'address' && !last.isKept && last.delivery?.state !== 'failed'
}

export type RowPress =
  | { action: 'answer'; id: string; option: string }
  | { action: 'type'; id: string; text: string }
  | { action: 'explain' | 'done' | 'dismiss' | 'address' | 'issue' | 'discuss' | 'undo' | 'discard'; id: string }
  | { action: 'step'; id: string; step: number; label: string }

export type PrActionId =
  | 'thread-address'
  | 'thread-draft'
  | 'thread-open'
  | 'thread-discuss'
  | 'pr-conflicts'
  | 'pr-address-all'
  | 'pr-merge'
  | 'pr-open'
  | 'pr-dismiss'
  | 'check-fix'
  | 'log'

export function actionId(p: RowPress | { action: PrActionId }): string {
  return p.action === 'step' ? `step-${p.step}` : p.action
}

function pressText(p: RowPress): string {
  switch (p.action) {
    case 'answer':
      return p.option
    case 'type':
      return 'Reply'
    case 'issue':
      return ISSUE_LABEL
    case 'step':
      return p.label
    default:
      return capitalized(p.action)
  }
}

export function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

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

export type Effect =
  | { kind: 'send'; text: string; by: Press | null }
  | { kind: 'open'; target: string; name: string }
  | { kind: 'copy'; text: string; name: string; isCommand: boolean }

/**
 * `last` null leaves the row's last action as it was.
 * `stale` when the row the press was drawn for is gone or changed under it.
 */
export type PressResult =
  { ledger: Ledger; last: LastAction | null; effects: Effect[]; reopenedId?: string } | { stale: true }

export function isUndoable(c: Pick<Closed, 'how' | 'isSentToAgent'>): boolean {
  return (c.how === 'done' || c.how === 'dismissed') && !c.isSentToAgent
}

export function doneWake(
  ledger: Ledger,
  ctx: { now: number; windowMs: number; isTurnRunning: boolean },
): { text: string; ids: string[] } | null {
  if (ctx.isTurnRunning) return null
  const waited = ledger.closed.filter(
    c =>
      c.how === 'done' &&
      c.outcome === 'done' &&
      !c.isSentToAgent &&
      !c.doneNotification &&
      c.item?.turn === ledger.turn,
  )
  if (waited.length === 0 || waited.some(c => ctx.now - c.at < ctx.windowMs)) return null

  return { text: messages.done(waited.map(c => c.ask)), ids: waited.map(c => c.id) }
}

export function markSentToAgent(ledger: Ledger, ids: string[], notificationId?: string): Ledger {
  return {
    ...ledger,
    closed: ledger.closed.map(c =>
      ids.includes(c.id)
        ? { ...c, isSentToAgent: true, ...(notificationId ? { doneNotification: { id: notificationId } } : {}) }
        : c,
    ),
  }
}

export function refuseDoneNotification(ledger: Ledger, notificationId: string, reason: string): Ledger {
  return {
    ...ledger,
    closed: ledger.closed.map(c => {
      if (c.how !== 'done' || c.doneNotification?.id !== notificationId) return c
      const { isSentToAgent: _sent, ...closed } = c
      return { ...closed, doneNotification: { id: notificationId, error: reason } }
    }),
  }
}

const STALE_TEXT = 'This changed before your press. Nothing was sent.'

export function noteText(note: RowNote['note']): string {
  return note === 'sample' ? 'Sample entry: nothing was sent.' : STALE_TEXT
}

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

export function stepEffects(item: Item, step: HelpStep): Effect[] {
  return step.step.map(h => helpEffect(item, h))
}

export function pendingResult(effects: Effect[], at: number, pressId?: string): LocalResult {
  return {
    state: 'pending',
    parts: effects.flatMap(e =>
      e.kind === 'send'
        ? []
        : [{ kind: e.kind, name: e.name, isCommand: e.kind === 'copy' && e.isCommand, error: null }],
    ),
    at,
    ...(pressId ? { pressId } : {}),
  }
}

export function finishedResult(pending: LocalResult, errors: (string | null)[], at: number): LocalResult {
  const parts = pending.parts.map((part, n) => ({ ...part, error: errors[n] ?? null }))

  return {
    state: parts.some(part => part.error !== null) ? 'failed' : 'done',
    parts,
    at,
    ...(pending.pressId ? { pressId: pending.pressId } : {}),
  }
}

export function localLast(
  last: LastAction | undefined,
  pressed: Pick<LastAction, 'action' | 'text'>,
  result: LocalResult,
): LastAction {
  return last && last.kind !== 'local' ? { ...last, result } : { kind: 'local', ...pressed, at: result.at, result }
}

export function withResult(
  lastActions: Record<string, LastAction>,
  rowId: string,
  pendingAt: number,
  result: LocalResult,
): Record<string, LastAction> {
  const last = lastActions[rowId]
  if (last?.result?.state !== 'pending' || last.result.at !== pendingAt || last.result.pressId !== result.pressId)
    return lastActions

  return { ...lastActions, [rowId]: { ...last, result } }
}

/**
 * Pure: it reads only its arguments.
 */
export function applyPress(
  ledger: Ledger,
  last: LastAction | undefined,
  p: RowPress,
  ctx: { now: number; turnsStarted: number; extraSteps: HelpStep[]; localPressId?: string },
): PressResult {
  const r = pressed(ledger, last, p, ctx)

  return 'stale' in r || !r.last ? r : { ...r, last: withQueued(r.last, r.effects) }
}

export function withQueued(last: LastAction, effects: Effect[]): LastAction {
  const send = effects.find(e => e.kind === 'send')

  return send ? { ...last, delivery: { state: 'queued', message: send.text } } : last
}

export function withDeliveryId(
  lastActions: Record<string, LastAction>,
  rows: string[],
  at: number,
  message: string,
  id: string,
): Record<string, LastAction> {
  return Object.fromEntries(
    Object.entries(lastActions).map(([row, action]) => [
      row,
      rows.includes(row) &&
      action.at === at &&
      action.delivery?.state === 'queued' &&
      action.delivery.id === undefined &&
      action.delivery.message === message
        ? { ...action, delivery: { ...action.delivery, id } }
        : action,
    ]),
  )
}

/** A known delivery id acknowledges its press; old id-less receipts match only old id-less actions by time. */
export function withArrival(
  lastActions: Record<string, LastAction>,
  message: string,
  pressedAt?: number,
  deliveryId?: string | null,
): Record<string, LastAction> {
  const isWaiting = (
    a: LastAction,
  ): a is LastAction & { delivery: Extract<Delivery, { state: 'queued' | 'unconfirmed' }> } =>
    (a.delivery?.state === 'queued' || a.delivery?.state === 'unconfirmed') && a.delivery.message === message
  const waiting = Object.values(lastActions).filter(
    a => isWaiting(a) && (deliveryId ? a.delivery?.id === deliveryId : a.delivery?.id === undefined),
  )
  if (waiting.length === 0) return lastActions
  const at = pressedAt ?? Math.min(...waiting.map(a => a.at))

  return Object.fromEntries(
    Object.entries(lastActions).map(([id, a]) => [
      id,
      isWaiting(a) && (deliveryId ? a.delivery?.id === deliveryId : a.delivery?.id === undefined && a.at === at)
        ? { ...a, delivery: { state: 'arrived' as const } }
        : a,
    ]),
  )
}

export function withUnconfirmed(
  lastActions: Record<string, LastAction>,
  message: string,
  pressedAt?: number,
  deliveryId?: string | null,
): Record<string, LastAction> {
  return Object.fromEntries(
    Object.entries(lastActions).map(([id, action]) => [
      id,
      action.delivery?.state === 'queued' &&
      action.delivery.message === message &&
      (deliveryId
        ? action.delivery.id === deliveryId
        : pressedAt === undefined || (action.delivery.id === undefined && action.at === pressedAt))
        ? { ...action, delivery: { ...action.delivery, state: 'unconfirmed' as const } }
        : action,
    ]),
  )
}

export function withAcceptedSend(
  lastActions: Record<string, LastAction>,
  rows: string[],
  at: number,
  message: string,
  deliveryId: string,
): Record<string, LastAction> {
  return withQueuedDelivery(
    lastActions,
    rows,
    at,
    text => text === message,
    { state: 'queued', message, id: deliveryId },
    deliveryId,
  )
}

function withQueuedDelivery(
  lastActions: Record<string, LastAction>,
  rows: string[],
  at: number,
  matches: (message: string) => boolean,
  delivery: Delivery,
  deliveryId?: string,
): Record<string, LastAction> {
  const changed = rows.flatMap(id => {
    const a = lastActions[id]
    return a?.at === at &&
      (a.delivery?.state === 'queued' || a.delivery?.state === 'unconfirmed') &&
      (deliveryId ? a.delivery.id === deliveryId : a.delivery.id === undefined) &&
      matches(a.delivery.message)
      ? [[id, { ...a, delivery }] as const]
      : []
  })

  return changed.length === 0 ? lastActions : { ...lastActions, ...Object.fromEntries(changed) }
}

export function withFailure(
  lastActions: Record<string, LastAction>,
  rows: string[],
  at: number,
  reason: string,
  deliveryId?: string,
): Record<string, LastAction> {
  return withQueuedDelivery(
    lastActions,
    rows,
    at,
    () => true,
    { state: 'failed', reason, ...(deliveryId ? { id: deliveryId } : {}) },
    deliveryId,
  )
}

export function withRewrite(
  lastActions: Record<string, LastAction>,
  rows: string[],
  at: number,
  message: string,
  entered: string,
  deliveryId?: string,
): Record<string, LastAction> {
  return Object.fromEntries(
    Object.entries(lastActions).map(([id, action]) => [
      id,
      rows.includes(id) &&
      action.at === at &&
      (action.delivery?.state === 'queued' || action.delivery?.state === 'unconfirmed') &&
      (deliveryId ? action.delivery.id === deliveryId : action.delivery.id === undefined) &&
      action.delivery.message === message
        ? { ...action, delivery: { ...action.delivery, message: entered } }
        : action,
    ]),
  )
}

export function reopenOnFailure(ledger: Ledger, id: string, at: number): Ledger {
  if (ledger.items.some(i => i.id === id)) return ledger
  const closed = ledger.closed.findLast(c => c.id === id)

  return closed?.item && closed.how === 'answered' && closed.at === at ? reopenItem(ledger, id) : ledger
}

export function demoRecord(
  lasts: Record<string, LastAction>,
  effects: Effect[],
): { lasts: Record<string, LastAction>; isSample: boolean } {
  return {
    lasts: Object.fromEntries(
      Object.entries(lasts).flatMap(([id, { delivery: _unsent, ...l }]) => (l.result === undefined ? [[id, l]] : [])),
    ),
    isSample: effects.length > 0,
  }
}

export function demoTurns(turns: Turns, effects: Effect[], isReplied = false): Turns {
  if (isReplied) return { ...turns, turnsApplied: turns.turnsStarted }

  return effects.some(e => e.kind === 'send') ? { ...turns, turnsStarted: turns.turnsStarted + 1 } : turns
}

/**
 * The demo's state after a press: the press's ledger without records no reply holds, its last actions without
 * delivery marks, and a turn started when it sends. `isSample` is true when the press had an effect the demo
 * only pretends to run.
 */
export function demoAfterPress(
  before: { lastActions: Record<string, LastAction>; turns: Turns },
  r: Pressed,
  held: ReadonlySet<string>,
): { ledger: Ledger; lastActions: Record<string, LastAction>; turns: Turns; isSample: boolean } {
  const { lasts, isSample } = demoRecord(r.lasts, r.effects)

  return {
    ledger: pruneClosed(r.ledger, held),
    lastActions: withLasts(before.lastActions, lasts, r.drop),
    turns: demoTurns(before.turns, r.effects),
    isSample,
  }
}

export type EffectHost = {
  now(): Promise<number> | number
  /** Opens or copies. Returns why it could not, or null. */
  perform(e: Exclude<Effect, { kind: 'send' }>): Promise<string | null>
  send(
    e: Extract<Effect, { kind: 'send' }>,
    deliveryId: string,
  ): Promise<{ state: 'accepted' } | { state: 'rejected'; reason: string } | { state: 'unconfirmed'; reason: string }>
  deliveryId(): string
  saveLasts(change: (a: Record<string, LastAction>) => Record<string, LastAction>): Promise<Record<string, LastAction>>
  saveLedger(change: (l: Ledger) => Ledger): Promise<void>
}

/**
 * When the press is a Local one, `pending` is the result it recorded on
 * `rowId`, and the result of how they went replaces it. Returns that result, or null for a press with no pending one.
 */
export async function runLocalEffects(
  host: EffectHost,
  effects: Effect[],
  rowId: string,
  pending: LocalResult | undefined,
): Promise<LocalResult | null> {
  const errors: (string | null)[] = []
  for (const e of effects)
    if (e.kind !== 'send') {
      try {
        errors.push(await host.perform(e))
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }
  if (pending?.state !== 'pending') return null
  const result = finishedResult(pending, errors, await host.now())
  await host.saveLasts(a => withResult(a, rowId, pending.at, result))

  return result
}

/**
 * A rejected send marks its rows failed and reopens an answer it closed.
 */
export async function runSends(
  host: EffectHost,
  effects: Effect[],
  rowId: string,
  rows: string[],
  at: number,
): Promise<
  { state: 'rejected'; reason: string; isRowFailed: boolean } | { state: 'unconfirmed'; reason: string } | null
> {
  for (const e of effects) {
    if (e.kind !== 'send') continue
    const deliveryId = host.deliveryId()
    const outcome = await host.send(e, deliveryId)
    if (outcome.state === 'accepted') continue
    if (outcome.state === 'unconfirmed') {
      await host.saveLasts(a => withUnconfirmed(a, e.text, at, deliveryId))
      return outcome
    }
    const reason = outcome.reason
    const last = (await host.saveLasts(a => withFailure(a, rows, at, reason, deliveryId)))[rowId]
    const isRowFailed = last?.at === at && last.delivery?.state === 'failed' && last.delivery.id === deliveryId
    if (isRowFailed && last.kind === 'mark') await host.saveLedger(l => reopenOnFailure(l, rowId, at))

    return { state: 'rejected', reason, isRowFailed }
  }

  return null
}

export const ISSUE_LABEL = 'File issue'

export function retryOf(id: string, last: LastAction): RowPress | null {
  if (!/^[if]\d+$/.test(id)) return null
  const step = /^step-(\d+)$/.exec(last.action)
  if (step) return { action: 'step', id, step: Number(step[1]), label: last.text }
  switch (last.action) {
    case 'answer':
      return { action: 'answer', id, option: last.text }
    case 'explain':
    case 'address':
    case 'issue':
    case 'discuss':
      return { action: last.action, id }
    default:
      return null
  }
}

export function withLasts(
  lastActions: Record<string, LastAction>,
  lasts: Record<string, LastAction>,
  drop: string[],
  pressOrder?: number,
): Record<string, LastAction> {
  const merged = { ...lastActions }
  for (const [id, last] of Object.entries(lasts)) {
    const current = merged[id]
    if (pressOrder !== undefined && current?.pressOrder !== undefined && current.pressOrder > pressOrder) continue
    merged[id] = last
  }
  for (const id of drop) {
    const current = merged[id]
    if (pressOrder !== undefined && current?.pressOrder !== undefined && current.pressOrder > pressOrder) continue
    delete merged[id]
  }
  return merged
}

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
  ctx: { now: number; turnsStarted: number; extraSteps: HelpStep[]; localPressId?: string },
): PressResult {
  const stale = { stale: true as const }
  const record = (kind: LastAction['kind']) => recordPress(kind, actionId(p), pressText(p), ctx)
  const unchanged = { ledger, last: null, effects: [] }

  if (p.action === 'undo') {
    if (ledger.findings.some(f => f.id === p.id) && last?.action === 'address' && !last.isKept)
      return { ...unchanged, last: { ...last, isKept: true } }
    if (ledger.items.some(i => i.id === p.id) || ledger.findings.some(f => f.id === p.id)) return stale
    const closed = ledger.closed.findLast(c => c.id === p.id)
    if (closed?.item && isUndoable(closed)) return { ...unchanged, ledger: reopenItem(ledger, p.id), reopenedId: p.id }
    const closedFinding = ledger.closedFindings.findLast(f => f.id === p.id)
    if (closedFinding && isUndoable(closedFinding))
      return { ...unchanged, ledger: reopenFinding(ledger, p.id), reopenedId: p.id }
    return stale
  }

  const finding = ledger.findings.find(f => f.id === p.id)
  if (finding) {
    const sendFinding = (kind: 'talk' | 'handoff', text: string) => ({
      ledger,
      last: record(kind),
      effects: [{ kind: 'send' as const, text, by: null }],
    })
    switch (p.action) {
      case 'address': {
        const sent = sendFinding('handoff', messages.finding(finding, 'address'))
        const asker = ledger.items.find(i => i.id === finding.askedAs)

        return asker
          ? {
              ...sent,
              ledger: closeItem(ledger, asker.id, { how: 'update', outcome: `fix sent for ${finding.id}` }, ctx.now),
            }
          : sent
      }
      case 'issue':
        return sendFinding('handoff', messages.finding(finding, 'issue'))
      case 'explain':
        return sendFinding('talk', messages.finding(finding, 'explain'))
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
  if (!item) return p.action === 'type' ? replyToClosed(ledger, p, record('handoff')) : stale
  const answered = (answer: string): PressResult => ({
    ledger: closeItem(ledger, item.id, { how: 'answered', outcome: answer }, ctx.now, ledger.turn + 1),
    last: record('mark'),
    effects: [{ kind: 'send', text: messages.answer(item, answer), by: { id: item.id, action: 'answer' } }],
  })
  switch (p.action) {
    case 'answer':
      return item.options.includes(p.option) ? answered(p.option) : stale
    case 'type': {
      const words = p.text.trim()
      if (!words) return unchanged
      const text = item.kind === 'question' ? messages.answer(item, words) : messages.taskReply(item, words)
      return { ledger, last: record('handoff'), effects: [{ kind: 'send', text, by: null }] }
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
        last: localLast(
          last,
          { action: actionId(p), text: pressText(p) },
          pendingResult(effects, ctx.now, ctx.localPressId),
        ),
        effects,
      }
    }
    default:
      return stale
  }
}

/** Only a held row's field sends a typed reply to a closed row. The ledger stays as it is. */
function replyToClosed(ledger: Ledger, p: Extract<RowPress, { action: 'type' }>, last: LastAction): PressResult {
  const words = p.text.trim()
  const closed = ledger.closed.findLast(c => c.id === p.id)?.item
  const record = ledger.closedFindings.findLast(f => f.id === p.id)
  const text = closed
    ? closed.kind === 'question'
      ? messages.answer(closed, words)
      : messages.taskReply(closed, words)
    : record
      ? messages.finding(record, 'typed', words)
      : null
  if (text === null) return { stale: true }
  if (!words) return { ledger, last: null, effects: [] }

  return { ledger, last, effects: [{ kind: 'send', text, by: null }] }
}

function findingBody(finding: Finding): string[] {
  return [
    `${finding.kind === 'issue' ? 'Issue' : 'Opportunity'}: ${finding.title}`,
    finding.detail,
    ...(finding.path ? [`File: ${finding.path}`] : []),
  ]
}

const EXPLAIN_REPLY_FORM =
  'Keep it under 80 words of plain language, not counting a diagram: no jargon, and name each thing by what it does. Call each choice by its name as listed. When a small ASCII diagram would show it faster than words, such as steps in order or a before-and-after, put one in a code block in your reply.'

export const messages = {
  answer: (item: Item, answer: string) => `Re "${item.ask}": ${answer}`,
  explain: (item: Item) => {
    const what =
      item.kind === 'task'
        ? 'this task you left for me is about: why it came up, and what doing it involves'
        : 'this question you asked me is about: why it came up, what each choice would do, and which you would pick'
    const options = item.options.length > 0 ? `\nOptions: ${item.options.join(' / ')}` : ''

    return `Remind me what ${what}. ${EXPLAIN_REPLY_FORM} Don't act on it yet.\n"${item.ask}"${options}`
  },
  run: (item: Item, command: string) => `For "${item.ask}", run this:\n\`\`\`\n${command}\n\`\`\``,
  taskReply: (item: Item, words: string) => `Re the task you left for me, "${item.ask}": ${words}`,
  done: (asks: string[]) => (asks.length === 1 ? `Done: ${asks[0]}` : `Done:\n${asks.map(a => `- ${a}`).join('\n')}`),
  /**
   * A close reason is cut at 80 characters, so filing asks for the issue's key there.
   */
  finding: (finding: Finding, how: 'address' | 'issue' | 'explain' | 'discuss' | 'typed', words = '') => {
    const opening =
      how === 'address'
        ? 'Please address this finding you recorded:'
        : how === 'issue'
          ? "Please file an issue for this finding you recorded, in the issue tracker you have tools for. First check whether one already exists, and if it does, use it instead of filing a duplicate. Then close the finding with the issue's key or number as the reason, and give me its link. If you have no tools for an issue tracker, say so and leave the finding open."
          : how === 'explain'
            ? `Remind me what this finding you recorded is about: why it matters, what fixing it would involve, and whether you would fix it now. ${EXPLAIN_REPLY_FORM} Don't act on it yet.`
            : how === 'discuss'
              ? "Let's talk through this finding you recorded before changing anything:"
              : 'About this finding you recorded:'

    return [opening, ...findingBody(finding), ...(how === 'typed' ? ['', words] : [])].join('\n')
  },
}
