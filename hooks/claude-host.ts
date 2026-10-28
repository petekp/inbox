// The mod's host: where Claude Code keeps the session, how each conversation's session is saved, and the
// SessionHost the shared session code runs through.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, UiCopyResult, UiPressArgument } from 'claude-code'

import type { Away, LastAction, Ledger, OldPresence, PrViews, SentPrompt, Stop } from '../types'
import type { Run } from './gh'
import { EMPTY, KEPT_SESSIONS } from './ledger'
import { CLAUDE_CODE } from './model-text'
import type { ShownTab } from './view'
import { COMPARE_PAGE_FILE, localPath, openCommands, withArrival, withRewrite, withUnconfirmed } from './presses'
import type { Effect } from './presses'
import { emptySession, pruned, upgradeSession } from './session'
import type { SavedSession, SendOutcome, SentBy, Session } from './session'
import { exclusiveKeys } from './session-host'
import type { Ask, CallReport, OverviewRecords, RecordFiles, SessionHost } from './session-host'

/** The drawn conversation's session. `revision` counts its writes, so a write computed from an older one is retried. */
export type ModSession = Session & { revision: number }

export const NO_SESSION: ModSession = { ...emptySession(), revision: 0 }
export const PRESENT: Away = { lastActiveAt: 0, isAway: false, minute: 0 }

/** The tab the pane shows, whether it shows the sample, and since when. */
export type Shown = { tab: ShownTab; isDemo: boolean; since: number }

/** The showing once the pane shows `tab`, with or without the sample: `shown` while neither changed, else one from `now`. */
export function showingAt(shown: Shown | null, tab: ShownTab, isDemo: boolean, now: number): Shown {
  return shown?.tab === tab && shown.isDemo === isDemo ? shown : { tab, isDemo, since: now }
}

// The engine lists the values a file reads and writes from that file's own consts, so register.tsx defines these
// four again.
const SESSION = atom({ plugin: 'inbox', key: 'session' } as const, NO_SESSION)
const AWAY = atom({ plugin: 'inbox', key: 'away' } as const, PRESENT)
const UNREADABLE = atom({ plugin: 'inbox', key: 'unreadable' } as const, null as string | null)
/** Null while the pane is closed. */
const SHOWN = atom({ plugin: 'inbox', key: 'shown' } as const, null as Shown | null)

const OLD_LEDGER = atom({ plugin: 'inbox', key: 'ledger' } as const, EMPTY)
const OLD_PRESENCE = atom(
  { plugin: 'inbox', key: 'presence' } as const,
  {
    lastActiveAt: 0,
    isAway: false,
    isUpdating: false,
    ledgerState: 'current',
    turnsStarted: 0,
    turnsApplied: 0,
    minute: 0,
  } as OldPresence,
)
const OLD_PR_VIEWS = atom(
  { plugin: 'inbox', key: 'prViews' } as const,
  { views: {}, branchRef: null, isFetching: false } as PrViews,
)
const OLD_STOP = atom({ plugin: 'inbox', key: 'stop' } as const, null as Stop | null)
const OLD_LAST_ACTIONS = atom({ plugin: 'inbox', key: 'lastActions' } as const, {} as Record<string, LastAction>)
const OLD_SENT = atom({ plugin: 'inbox', key: 'sent' } as const, [] as SentPrompt[])
const OLD_UNTRACKED_SENT = atom(
  { plugin: 'inbox', key: 'untrackedSent' } as const,
  [] as { sessionId: string; text: string }[],
)

/** The conversation the session runs. /clear, /resume and /branch move it to another id, and each move is a new generation. */
export const conversation = { id: '', root: '', generation: 0 }

export type Owner = { id: string; generation: number }

export function currentOwner(): Owner {
  return { id: conversation.id, generation: conversation.generation }
}

export function isCurrent(owner: Owner): boolean {
  return owner.id === conversation.id && owner.generation === conversation.generation
}

/**
 * The session as an older build left it in its separate fields, for a hot reload into this build. A sent message
 * whose record those fields lost is kept as an uncertain record, so its arrival cannot be credited to a newer press.
 */
async function fromOldFields($: EngineInterface): Promise<Session> {
  const [id, ledger, presence, prViews, stop, lastActions, sent, untracked] = await Promise.all([
    $.session.id(),
    read($, OLD_LEDGER),
    read($, OLD_PRESENCE),
    read($, OLD_PR_VIEWS),
    read($, OLD_STOP),
    read($, OLD_LAST_ACTIONS),
    read($, OLD_SENT),
    read($, OLD_UNTRACKED_SENT),
  ])
  await update($, AWAY, () => ({
    lastActiveAt: presence.lastActiveAt,
    isAway: presence.isAway,
    minute: presence.minute,
  }))

  return upgradeSession({
    ledger,
    presence: {
      isUpdating: presence.isUpdating,
      ledgerState: presence.ledgerState,
      // Presence from before the turn counts existed cannot say whether the last turn's update landed, so that
      // load catches up once.
      turnsStarted: presence.turnsStarted ?? 1,
      turnsApplied: presence.turnsApplied ?? 0,
    },
    prViews,
    stop,
    lastActions,
    sent: [
      ...(sent ?? [])
        .filter(p => p.sessionId === id)
        .map(p => ({ text: p.text, press: null, at: p.pressedAt ?? 0, pressedAt: p.pressedAt, deliveryId: p.id })),
      ...(untracked ?? []).filter(u => u.sessionId === id).map(u => uncertainRecord(u.text)),
    ],
  })
}

/** A sent message no record can be matched to. Its text arriving reads unconfirmed. */
function uncertainRecord(text: string): Session['sent'][number] {
  return {
    text,
    press: null,
    at: 0,
    row: null,
    queuedId: null,
    pressedAt: null,
    deliveryId: null,
    phase: 'uncertain',
  }
}

function isUntracked(record: Session['sent'][number]): boolean {
  return record.phase === 'uncertain' && record.deliveryId === null
}

/**
 * Brings the drawn session to the current shape. A row's queued message that has no sent record lost it to an
 * older build, so its record becomes uncertain and the row reads unconfirmed.
 */
export async function upgradeDrawn($: EngineInterface): Promise<ModSession> {
  const written = await $.state.get({ plugin: 'inbox', key: 'session' })
  const base = written.value === undefined ? await fromOldFields($) : upgradeSession(written.value as SavedSession)

  return update($, SESSION, cur => {
    const s = written.value === undefined ? base : upgradeSession(cur as SavedSession)
    const lost = Object.entries(s.lastActions).flatMap(([row, action]) => {
      const delivery = action.delivery
      return /^[if]\d+$/.test(row) &&
        delivery?.state === 'queued' &&
        !s.sent.some(x =>
          delivery.id ? x.deliveryId === delivery.id : x.text === delivery.message && x.pressedAt === action.at,
        )
        ? [delivery.message]
        : []
    })
    const fresh = lost.filter(text => !s.sent.some(x => isUntracked(x) && x.text === text))

    return {
      ...s,
      sent: [...s.sent, ...fresh.map(uncertainRecord)],
      lastActions: lost.reduce((next, text) => withUnconfirmed(next, text), s.lastActions),
      revision: (cur.revision ?? 0) + 1,
    }
  })
}

/**
 * Replaces the drawn session outside the write loop, as a conversation switch or load does. A change that returns
 * the session it was given writes nothing.
 */
export async function replaceDrawn($: EngineInterface, change: (s: ModSession) => Session): Promise<ModSession> {
  const cur = await read($, SESSION)
  if (change(cur) === cur) return cur

  return update($, SESSION, s => ({ ...change(s), revision: s.revision + 1 }))
}

const MAX_TRIES = 20

/** A session change that landed: the session it read and the one it wrote, and whether that session is the drawn one. */
export type Changed = { before: Session; after: Session; isDrawn: boolean }

/**
 * Changes the session of `owner`. While its conversation is drawn, the change runs on the drawn session and is
 * written only if no other write landed meanwhile; otherwise it runs again on what landed. Once the conversation
 * moved on, the change goes to its saved session. A change that returns the session it was given writes nothing.
 * Every write saves the pane's `held` rows and its showing of the real session, and prunes the session with `pruned`.
 * A write that changes more than the running turn saves.
 */
export async function changeSession(
  $: EngineInterface,
  owner: Owner,
  change: (s: Session) => Session | Promise<Session>,
  held: Set<string>,
): Promise<Changed> {
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    if (!isCurrent(owner)) return changeSaved($, owner.id, change)
    const drawn = await read($, SESSION)
    // A hot reload can leave a session an earlier build wrote. The fetch that is running still runs.
    const upgraded = upgradeSession(drawn)
    const before = { ...upgraded, prViews: { ...upgraded.prViews, isFetching: drawn.prViews.isFetching } }
    const changed = await change(before)
    if (changed === before) return { before, after: before, isDrawn: true }
    // A resume drops the running turn, so a write that changes only the turn, such as each tool call's activity,
    // leaves the saved copy alone.
    const isTurnOnly = (Object.keys(changed) as (keyof Session)[]).every(k => k === 'turn' || changed[k] === before[k])
    const shown = await read($, SHOWN)
    const next = pruned({ ...changed, heldRows: [...held], shownSince: shown && !shown.isDemo ? shown.since : null })
    let landed: ModSession | null = null
    await update($, SESSION, cur => {
      if (!isCurrent(owner) || cur.revision !== drawn.revision) {
        landed = null
        return cur
      }
      landed = { ...next, revision: drawn.revision + 1 }
      return landed
    })
    const written = landed as ModSession | null
    if (!written) continue
    if (!isTurnOnly && (await read($, UNREADABLE)) !== owner.id) await save($, owner, written)
    return { before, after: written, isDrawn: isCurrent(owner) }
  }
  throw new Error('The session kept changing under this write.')
}

/** Changes a conversation's saved session, after its pending saves. A session the store cannot read stays as it is. */
async function changeSaved(
  $: EngineInterface,
  id: string,
  change: (s: Session) => Session | Promise<Session>,
): Promise<Changed> {
  savedWrites++
  // The read, the change and the write run in the save queue, so two changes to one saved session cannot both
  // start from the same read.
  const changed = saving.then(async (): Promise<Changed> => {
    const saved = await readSaved($, id)
    if (!saved?.session) return { before: emptySession(), after: emptySession(), isDrawn: false }
    const before = upgradeSession(saved.session)
    const after = await change(before)
    if (after === before) return { before, after, isDrawn: false }
    await $.store.set(sessionKey(id), { savedAt: saved.session.savedAt, ...after })

    return { before, after, isDrawn: false }
  })
  const write = changed.then(() => undefined)
  saving = write.catch(() => undefined)
  track(id, write)

  return changed
}

export type SavedRecord = SavedSession & { savedAt: number }

const sessionKey = (id: string) => `s:${id}`

let saving: Promise<void> = Promise.resolve()
let savedWrites = 0

/** How many changes went to a saved session that is not drawn, so a load can tell its read is out of date. */
export function savedWriteCount(): number {
  return savedWrites
}
const savesBySession = new Map<string, Promise<void>>()
const prunedSaves = new Set<string>()
const savedRevisions = new Map<string, number>()

function track(id: string, write: Promise<void>) {
  savesBySession.set(id, write)
  void write
    .finally(() => {
      if (savesBySession.get(id) === write) savesBySession.delete(id)
    })
    .catch(() => undefined)
}

/**
 * Saves a conversation's session, once every earlier save has landed. A save older than one already resolved is
 * skipped. The first save of each conversation also deletes the oldest saved sessions beyond the newest `KEPT_SESSIONS`.
 */
function save($: EngineInterface, owner: Owner, s: ModSession): Promise<void> {
  const key = sessionKey(owner.id)
  const generation = `${owner.id}:${owner.generation}`
  savedRevisions.set(generation, Math.max(savedRevisions.get(generation) ?? 0, s.revision))
  const { revision: _revision, ...session } = s
  const next = Promise.all([saving, $.clock.now()]).then(async ([, savedAt]) => {
    if (s.revision < (savedRevisions.get(generation) ?? 0)) return
    await $.store.set(key, { savedAt, ...session })
    if (prunedSaves.has(generation)) return
    const keys = await $.store.keys()
    const sessions = keys.filter(k => k.startsWith('s:'))
    const ages = await Promise.all(
      sessions.map(async candidate => {
        try {
          const saved = (await $.store.get(candidate)) as SavedRecord | undefined
          return saved && Number.isFinite(saved.savedAt) && saved.ledger && typeof saved.ledger === 'object'
            ? { key: candidate, savedAt: saved.savedAt }
            : null
        } catch {
          return null
        }
      }),
    )
    const stale = ages
      .filter((entry): entry is { key: string; savedAt: number } => entry !== null && entry.key !== key)
      .sort((a, b) => a.savedAt - b.savedAt || a.key.localeCompare(b.key))
      .slice(0, Math.max(0, sessions.length - KEPT_SESSIONS))
      .map(entry => entry.key)
    // `p:` keys held the last-session offer, which earlier builds saved per folder.
    await Promise.all([...stale, ...keys.filter(k => k.startsWith('p:'))].map(old => $.store.delete(old)))
    prunedSaves.add(generation)
  })
  saving = next.catch(() => undefined)
  track(owner.id, next)

  return next
}

/** A conversation's saved session, or `{ session: undefined }` when none is saved. Null when the store cannot read it. */
export async function readSaved($: EngineInterface, id: string): Promise<{ session: SavedRecord | undefined } | null> {
  try {
    return { session: (await $.store.get(sessionKey(id))) as SavedRecord | undefined }
  } catch {
    return null
  }
}

/** A conversation's saved session, once its pending saves have landed. */
export async function readSettled($: EngineInterface, id: string) {
  await savesBySession.get(id)?.catch(() => undefined)

  return readSaved($, id)
}

/**
 * The prompt rows of the mod's own messages Claude Code has stored, by text: how many rows were stored before
 * each, and the sent record each matched. A rewritten message is confirmed from these, since its row may be stored
 * before `$.prompt.submit` returns.
 */
const stored = {
  count: 0,
  at: new Map<string, number>(),
  by: new Map<string, { count: number; deliveryId: string | null }>(),
}

export function forgetStored() {
  stored.at.clear()
  stored.by.clear()
}

/** Records that Claude Code stored a prompt row of the mod's own. Returns the row's count, for `arrived`. */
export function noteStored(text: string): number {
  const count = ++stored.count
  stored.at.set(text, count)
  stored.by.set(text, { count, deliveryId: null })

  return count
}

/**
 * Matches the stored prompt row `count` to the message a press sent. A message matches while its send is still
 * running too, since Claude Code stores the row before `$.prompt.submit` returns. When an older build's untracked
 * send has the same text, the row confirms nothing, so it reads unconfirmed.
 */
export function arrived(s: Session, text: string, count: number): { state: Session; sentBy: SentBy } {
  const tracked = s.sent.filter(x => !isUntracked(x))
  const index = tracked.findIndex(x => x.text === text)
  const match = tracked[index]
  if (!match || s.sent.some(x => isUntracked(x) && x.text === text)) {
    return {
      state: {
        ...s,
        sent: match ? s.sent.filter(x => x !== match) : s.sent,
        lastActions: withUnconfirmed(s.lastActions, text),
      },
      sentBy: { press: null },
    }
  }
  if (stored.by.get(text)?.count === count) stored.by.set(text, { count, deliveryId: match.deliveryId })
  const lastActions = tracked
    .slice(index + 1)
    .filter(x => x.text === text && x.row !== null)
    .reduce(
      (actions, later) => withUnconfirmed(actions, text, later.pressedAt ?? undefined, later.deliveryId),
      match.row === null
        ? s.lastActions
        : withArrival(s.lastActions, text, match.pressedAt ?? undefined, match.deliveryId),
    )

  return { state: { ...s, sent: s.sent.filter(x => x !== match), lastActions }, sentBy: { press: match.press } }
}

/**
 * Settles a message another plugin rewrote whose row Claude Code stored before `$.prompt.submit` returned. The row
 * confirms the press only when no other record or untracked send shares the new text and the row matched no record.
 * Returns how the send went, or null when the row is not stored yet and the shared code settles it.
 */
function settleRewrite(
  s: Session,
  deliveryId: string,
  text: string,
  entered: string,
  since: number,
): { state: Session; outcome: SendOutcome } | null {
  if ((stored.at.get(entered) ?? 0) <= since) return null
  const record = s.sent.find(x => x.deliveryId === deliveryId)
  const rows = Object.entries(s.lastActions).filter(
    ([_id, a]) => a.delivery && 'id' in a.delivery && a.delivery.id === deliveryId,
  )
  const moved = rows.reduce(
    (actions, [id, a]) => withRewrite(actions, [id], a.at, text, entered, deliveryId),
    s.lastActions,
  )
  const isConfirmed =
    !s.sent.some(x => x.deliveryId !== deliveryId && x.text === entered) && stored.by.get(entered)?.deliveryId === null
  if (isConfirmed)
    return {
      state: {
        ...s,
        sent: s.sent.filter(x => x.deliveryId !== deliveryId),
        lastActions: withArrival(moved, entered, undefined, deliveryId),
        turn: { ...s.turn, press: s.turn.press ?? record?.press ?? null },
      },
      outcome: { state: 'accepted', queuedId: null },
    }

  return {
    state: {
      ...s,
      sent: s.sent.map(x => (x.deliveryId === deliveryId ? { ...x, text: entered } : x)),
      lastActions: withUnconfirmed(moved, entered, undefined, deliveryId),
    },
    outcome: { state: 'unconfirmed', reason: 'Another plugin changed the message' },
  }
}

const MODEL = 'sonnet'

type ModelResult = Awaited<ReturnType<EngineInterface['model']['fork']>>

export function askLedgerModel(
  $: EngineInterface,
  prompt: string,
  system: string,
  timeoutMs: number,
): Promise<ModelResult> {
  return $.model.complete({
    model: MODEL,
    system: [{ text: system, cache: true as const }],
    prompt,
    maxTokens: 1600,
    effort: 'low',
    timeoutMs,
  })
}

/** The engine does not say which model answered. */
function callReport(r: ModelResult): CallReport {
  if (r.isAnswered) return { model: MODEL }
  const error = r.reason === 'api-error' ? `api-error ${r.status ?? 'with no response'}: ${r.error}` : r.reason

  return { model: MODEL, error }
}

/** Calls the inbox model as `askLedgerModel` does, waiting up to `timeoutMs`. */
export function modelAsk($: EngineInterface, timeoutMs: number): Ask {
  return async (prompt, system, report) => {
    const r = await askLedgerModel($, prompt, system, timeoutMs)
    report?.(callReport(r))
    return r.isAnswered ? r.text : null
  }
}

/** The engine has no call that removes a file, so removing runs `rm` and `rmdir`. */
function recordFiles($: EngineInterface): RecordFiles {
  return {
    write: (path, text) => $.fs.write(path, text),
    list: async folder => (await $.fs.list(folder).catch(() => [])).map(e => e.name),
    removeFiles: async paths => void (await $.process.run(['rm', '-f', '--', ...paths])),
    removeFolder: async path => void (await $.process.run(['rmdir', '--', path])),
  }
}

/** The folder a next build keeps its Overview call records in, under Claude Code's configuration folder. */
export async function recordsFolder($: EngineInterface): Promise<string | null> {
  const home = await $.env.get('HOME')
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) || (home ? `${home}/.claude` : null)

  return config ? `${config}/plugins/data/inbox/overview-calls` : null
}

export function overviewRecords($: EngineInterface, folder: string, owner: Owner): OverviewRecords {
  return { host: 'claude-code', folder, session: owner.id, files: recordFiles($) }
}

const COPY_FAILURES: Record<Extract<UiCopyResult, { isCopied: false }>['reason'], string> = {
  'no-surface': 'no app is attached',
  'no-clipboard': 'the clipboard did not take it',
  refused: 'another plugin refused it',
}

async function openUrl($: EngineInterface, url: string): Promise<string | null> {
  const r = await $.process.run(['open', url])

  return r.exitCode === 0 ? null : r.stderr.trim() || `open exited ${r.exitCode}`
}

async function openPath($: EngineInterface, raw: string): Promise<string | null> {
  const path = localPath(raw, conversation.root, (await $.env.get('HOME')) ?? '')
  if (!(await $.fs.exists(path))) return 'it no longer exists'
  const stat = await $.fs.stat(path)
  const isFile = stat.kind === 'file'
  const isExecutable = isFile && (await $.process.run(['test', '-x', path])).exitCode === 0
  const { argv, fallback } = openCommands(path, isFile, isExecutable)
  const r = await $.process.run(argv)
  const retry = r.exitCode !== 0 && fallback ? await $.process.run(fallback) : r

  return retry.exitCode === 0 ? null : retry.stderr.trim() || `open exited ${retry.exitCode}`
}

async function perform(
  $: EngineInterface,
  effect: Extract<Effect, { kind: 'open' | 'copy' }>,
  surface: UiPressArgument['surface'],
): Promise<string | null> {
  try {
    if (effect.kind === 'open')
      return await (/^[a-z][a-z\d+.-]*:\/\//i.test(effect.target)
        ? openUrl($, effect.target)
        : openPath($, effect.target))
    const r = await $.ui.copy({ text: effect.text, surface })
    return r.isCopied ? null : COPY_FAILURES[r.reason]
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

export function gh($: EngineInterface, args: string[]) {
  return $.process.run(['gh', ...args], { cwd: conversation.root, timeoutMs: 20_000 })
}

/** `$.process.run` as the shared `Run`: a run that rejects, because it could not start or outlived its timeout, ends with code -1. */
export function processRun($: EngineInterface): Run {
  return (args, { cwd, timeoutMs, env }) =>
    $.process.run(args, { cwd, timeoutMs, env }).then(
      r => ({ code: r.exitCode, stdout: r.stdout, stderr: r.stderr }),
      (err: unknown) => ({ code: -1, stdout: '', stderr: err instanceof Error ? err.message : String(err) }),
    )
}

/**
 * `$.process.run` rejects when the command cannot start, and also when it is still running at the timeout. Asking
 * for `gh --version` tells them apart: only a gh that cannot start makes this reject too.
 */
async function isGhUnstartable($: EngineInterface): Promise<boolean> {
  try {
    await gh($, ['--version'])

    return false
  } catch {
    return true
  }
}

/**
 * Sends a message as the person's own prompt. Claude Code may store its row before `$.prompt.submit` returns, as
 * the mod's `session.append` handler sees, and another plugin may rewrite it.
 */
export async function deliver(
  $: EngineInterface,
  owner: Owner,
  text: string,
  deliveryId: string,
): Promise<SendOutcome> {
  if (!isCurrent(owner)) return { state: 'rejected', reason: 'the conversation changed first' }
  const since = stored.count
  type Submitted = { entered: string } | { notSent: string }
  const sent = await $.prompt.submit({ text, asUser: true }).then(
    (r): Submitted => (r.drop === undefined ? { entered: r.text } : { notSent: r.drop }),
    (err: unknown): Submitted =>
      (stored.at.get(text) ?? 0) > since
        ? { entered: text }
        : { notSent: (err instanceof Error ? err.message : String(err)) || 'the session refused it' },
  )
  if ('notSent' in sent) return { state: 'rejected', reason: sent.notSent }
  const entered = sent.entered
  if (entered === text) return { state: 'accepted', queuedId: null }
  let outcome: SendOutcome = { state: 'accepted', queuedId: null, entered }
  const { heldRows } = await read($, SESSION)
  await changeSession(
    $,
    owner,
    s => {
      const settled = settleRewrite(s, deliveryId, text, entered, since)
      outcome = settled?.outcome ?? { state: 'accepted', queuedId: null, entered }
      return settled?.state ?? s
    },
    new Set(heldRows),
  )

  return outcome
}

/** The page template for a comparison, as the mod ships it. */
export function comparePagePath($: EngineInterface): string {
  return `${$.plugin.root}/hooks/${COMPARE_PAGE_FILE}`
}

/** The mod's SessionHost for the conversation `owner`, with copies going to `surface`. */
export function sessionHost(
  $: EngineInterface,
  owner: Owner,
  opts: {
    /** Changes the session, with what the drawing does after each write. */
    update: SessionHost<Session>['update']
    surface?: UiPressArgument['surface']
    settleWindowMs: number
    onGhMissing: (isMissing: boolean) => void
    /** Fetches the session's PRs, and resolves once that fetch ends. */
    refreshPrs: () => Promise<void>
  },
): SessionHost<Session> {
  // gh is taken to start until a run fails. Then `find` asks it for its version, which only an unstartable gh refuses.
  let ghFound: string | null | undefined = 'gh'

  return {
    now: () => $.clock.now(),
    read: async () => {
      if (isCurrent(owner)) return upgradeSession(await read($, SESSION))
      const saved = await readSettled($, owner.id)
      return saved?.session ? upgradeSession(saved.session) : emptySession()
    },
    update: opts.update,
    exclusive: fn => updating.run(owner.id, fn),
    ask: modelAsk($, 45_000),
    deliver: (_s, text, deliveryId) => deliver($, owner, text, deliveryId),
    isDeliveryHeldUntilRun: true,
    perform: async (_s, effect) => (opts.surface ? perform($, effect, opts.surface) : COPY_FAILURES['no-surface']),
    refreshPrs: opts.refreshPrs,
    gh: {
      find: async () => {
        if (ghFound === undefined) ghFound = (await isGhUnstartable($)) ? null : 'gh'
        return ghFound
      },
      forget: () => {
        ghFound = undefined
      },
      run: (_s, _bin, onUnstartable) => async args => {
        try {
          return await gh($, args)
        } catch (err) {
          onUnstartable()
          return { exitCode: -1, stdout: '', stderr: err instanceof Error ? err.message : String(err) }
        }
      },
      noteMissing: opts.onGhMissing,
    },
    settleWindowMs: opts.settleWindowMs,
    comparePage: comparePagePath($),
    newId: () => crypto.randomUUID(),
  }
}

/** The conversations whose per-reply update runs now. */
const updating = exclusiveKeys()
