import type { Session } from '../../types'
import type { ClientId } from '../domain/client-features'
import { pressFolder, publishedSessionPath } from './herdr'
import { herdrEnvelope } from './herdr-envelope'
import type { EnvelopeSource } from './herdr-envelope'
import { fileTime, isLookFile, isPressFile, isPrsShownFile, pressFile } from './herdr-press-file'
import { withCollapse } from '../view/collapse'
import type { HerdrFile } from './herdr-press-file'
import { startPress } from '../runtime/host-press'
import type { PressHost, PressOutcome } from '../runtime/host-press'
import { lookReportedOn } from '../runtime/session-status'
import { rowsInPlace } from '../runtime/session-presses'
import { updateRemoteViewer } from '../runtime/remote-viewers'
import type { RemoteViewerUpdate, ViewerStore } from '../runtime/remote-viewers'
import { startRemoteCommand } from './remote-commands'
import type { StartedCommand } from './remote-commands'
import { clipLabel } from '../domain/text'

/**
 * The file calls a host publishes with. `move` replaces `to` in one step, so the Herdr look never reads half a file.
 * `remove` and `removeFolder` resolve when there was nothing to remove.
 */
export type PublishFiles = {
  write: (path: string, text: string) => Promise<void>
  move: (from: string, to: string) => Promise<void>
  remove: (path: string) => Promise<void>
  removeFolder: (path: string) => Promise<void>
}

/**
 * The file calls a host reads presses with. `list` gives a folder's file names, and rejects for a missing folder. `move`
 * rejects when `from` is gone, as when another process took the file first.
 */
export type PressFiles = Pick<PublishFiles, 'move' | 'remove'> & {
  list: (folder: string) => Promise<readonly string[]>
  read: (path: string) => Promise<string>
}

/** The largest press file a host reads. The look's press files are well under 1 KiB. */
const PRESS_FILE_LIMIT_BYTES = 64 * 1024

/** Why a host does not read the file `stat` describes as a press, or null when it may. */
export function pressFileProblem(info: { isFile(): boolean; size: number }): string | null {
  if (!info.isFile()) return 'not a file'

  return info.size > PRESS_FILE_LIMIT_BYTES ? `over ${PRESS_FILE_LIMIT_BYTES} bytes` : null
}

/** Whether the session's published file names `host` and `terminal`. False when it is missing or not JSON. */
export async function isPublishedHere(
  read: (path: string) => Promise<string>,
  appHome: string,
  sessionId: string,
  host: ClientId,
  terminal: string,
): Promise<boolean> {
  try {
    const envelope = JSON.parse(await read(publishedSessionPath(appHome, sessionId))) as {
      host?: unknown
      terminal?: unknown
    } | null

    return envelope?.host === host && envelope.terminal === terminal
  } catch {
    return false
  }
}

/** The most a published file may hold, since Herdr's `readTextFile` reads at most 1 MiB. */
export const PUBLISH_LIMIT_BYTES = 1024 * 1024

function utf8Bytes(text: string): number {
  let bytes = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
  }

  return bytes
}

const isOverLimit = (text: string) => text.length * 3 > PUBLISH_LIMIT_BYTES && utf8Bytes(text) > PUBLISH_LIMIT_BYTES

/**
 * `s` without the closed items and findings that no row draws in place, which the look folds under its closed count.
 * The rows a remote viewer holds stay.
 */
function withoutFoldedClosed(s: Session, now: number, viewers: EnvelopeSource['viewers']): Session {
  const inPlace = rowsInPlace(s, now, viewers)
  const { closed, closedFindings } = s.ledger

  return {
    ...s,
    ledger: {
      ...s.ledger,
      closed: closed.filter(c => inPlace.has(c.id)),
      closedFindings: closedFindings.filter(f => inPlace.has(f.id)),
    },
  }
}

/**
 * The text of the session's envelope. Over `PUBLISH_LIMIT_BYTES`, it leaves out the folded closed items, as `trimmed`.
 * When that is still over, the text goes out whole and `log` says so, since open items are never left out.
 */
export function publishedText(source: EnvelopeSource, session: Session, log: (text: string) => void): string {
  const text = JSON.stringify(herdrEnvelope(source, session))
  if (!isOverLimit(text)) return text
  const trimmed = JSON.stringify(
    herdrEnvelope(source, withoutFoldedClosed(session, source.writtenAt, source.viewers), true),
  )
  if (isOverLimit(trimmed))
    log(`Herdr publish is over ${PUBLISH_LIMIT_BYTES} bytes after trimming, so the look cannot read it`)

  return trimmed
}

/**
 * Writes the session's envelope beside its file, then moves it over the file. A temporary name never ends in `.json`.
 * A failed write or move removes the temporary file and rejects.
 */
export async function publishSession(
  files: PublishFiles,
  appHome: string,
  source: EnvelopeSource,
  session: Session,
  log: (text: string) => void,
): Promise<void> {
  const path = publishedSessionPath(appHome, source.sessionId)
  const temporary = `${path}.${source.writtenAt}-${Math.random().toString(36).slice(2)}.tmp`
  try {
    await files.write(temporary, publishedText(source, session, log))
    await files.move(temporary, path)
  } catch (err) {
    await files.remove(temporary).catch(() => undefined)
    throw err
  }
}

/**
 * Publishes the session when there is an app home, and resolves whether its file now holds it. A host labels its
 * terminal with the session only then, so the labels never name a file that was not written. A failure goes to `log`.
 */
export function publishedSession(
  files: PublishFiles,
  appHome: string | null,
  source: EnvelopeSource,
  session: Session,
  log: (text: string) => void,
): Promise<boolean> {
  if (!appHome) return Promise.resolve(false)

  return publishSession(files, appHome, source, session, log).then(
    () => true,
    (err: unknown) => {
      log(`Herdr publish failed: ${err instanceof Error ? err.message : String(err)}`)
      return false
    },
  )
}

/**
 * Removes the session's published file and its press folder, as when the session ends or the host moves to another.
 * No host applies a press for that session after this.
 */
export async function unpublishSession(
  files: Pick<PublishFiles, 'remove' | 'removeFolder'>,
  appHome: string,
  sessionId: string,
): Promise<void> {
  await Promise.all([
    files.remove(publishedSessionPath(appHome, sessionId)),
    files.removeFolder(pressFolder(appHome, sessionId)),
  ])
}

/**
 * A file a host applied. `waiting` runs what waits for the agent's turn to end: a press's message the host holds until
 * then, and the opens and copies after it. Null when the file is done.
 */
export type StartedFile = { waiting: (() => Promise<unknown>) | null }

const DONE: StartedFile = { waiting: null }

/**
 * Applies one press file for `sessionId`: a press, or a look at the Status. Resolves once it is done, or once it is
 * saved with a message that waits for the agent's turn. Null leaves the file for later, as when the host no longer runs
 * that session. A rejection is logged, and the file is removed as for an applied press.
 */
export type ApplyPress = (sessionId: string, file: HerdrFile) => Promise<StartedFile | null>

/** The most characters of a name or reason from a press file that a log line holds. */
const LOGGED_CHARS = 100

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const logged = (text: string) => clipLabel(text, LOGGED_CHARS)

/**
 * Returns a drain: it applies each press file waiting for a session, oldest first by `fileTime`, and removes the file. It
 * reads a folder only when `owns` says this process runs the session there. Legacy files use a process-specific rename.
 * Version-2 files stay in place until their start returns; their saved command admission prevents repeated effects. A
 * file `pressFile` refuses or that cannot be read is logged and removed. One drain of a folder runs at a time, and a
 * drain asked for while one runs runs once more after it, so a press that lands mid-drain is not missed. The drain does
 * not wait for what a file leaves `waiting`, so a message held until the agent's turn ends holds up no file behind it.
 * Each folder's waiting messages run one after another, so they reach the agent in press order.
 */
export function pressDrainer(
  files: PressFiles,
  owns: (sessionId: string) => Promise<boolean>,
  apply: ApplyPress,
  log: (text: string) => void,
): (appHome: string, sessionId: string) => Promise<void> {
  const takenMark = `.${Math.random().toString(36).slice(2)}.taken`
  const draining = new Map<string, { again: boolean; done: Promise<void> }>()
  const waitingRuns = new Map<string, Promise<void>>()
  const runInOrder = (folder: string, waiting: () => Promise<unknown>, onError: (err: unknown) => void) => {
    const next = (waitingRuns.get(folder) ?? Promise.resolve()).then(waiting).then(() => undefined, onError)
    waitingRuns.set(folder, next)
    void next.then(() => {
      if (waitingRuns.get(folder) === next) waitingRuns.delete(folder)
    })
  }

  const drainOnce = async (folder: string, sessionId: string) => {
    const names = [...(await files.list(folder).catch(() => []))].filter(name => name.endsWith('.json')).sort()
    if (names.length === 0 || !(await owns(sessionId).catch(() => false))) return
    const waiting: { path: string; taken: string; file: HerdrFile }[] = []
    for (const name of names) {
      const path = `${folder}/${name}`
      const taken = `${path}${takenMark}`
      const candidate = await files.read(path).then(pressFile, () => null)
      if (candidate?.ok && candidate.file.format === 2) {
        waiting.push({ path, taken: path, file: candidate.file })
        continue
      }
      if (
        !(await files.move(path, taken).then(
          () => true,
          () => false,
        ))
      )
        continue
      const read = await files.read(taken).then(pressFile, (err: unknown) => ({
        ok: false as const,
        reason: `not read: ${message(err)}`,
      }))
      if (read.ok) waiting.push({ path, taken, file: read.file })
      else {
        log(`Herdr press ${logged(name)} refused: ${logged(read.reason)}`)
        await files.remove(taken).catch(() => undefined)
      }
    }
    const failed = (file: HerdrFile) => (err: unknown) => log(`Herdr press ${logged(file.id)} failed: ${message(err)}`)
    for (const { path, taken, file } of waiting.sort((a, b) => fileTime(a.file) - fileTime(b.file))) {
      const started = await apply(sessionId, file).catch((err: unknown) => {
        failed(file)(err)
        return file.format === 2 ? null : DONE
      })
      if (started) {
        if (started.waiting) runInOrder(folder, started.waiting, failed(file))
        await files
          .remove(taken)
          .catch((err: unknown) => log(`Herdr press ${logged(file.id)} not removed: ${message(err)}`))
      } else if (taken !== path) {
        await files
          .move(taken, path)
          .catch((err: unknown) => log(`Herdr press ${logged(file.id)} not put back: ${message(err)}`))
      }
    }
  }

  return async (appHome, sessionId) => {
    const folder = pressFolder(appHome, sessionId)
    const running = draining.get(folder)
    if (running) {
      running.again = true
      return running.done
    }
    const entry = { again: false, done: Promise.resolve() }
    draining.set(folder, entry)
    entry.done = (async () => {
      try {
        do {
          entry.again = false
          await drainOnce(folder, sessionId)
        } while (entry.again)
      } finally {
        draining.delete(folder)
      }
    })()

    return entry.done
  }
}

/** How often a host reads its press folders when no wake came, in case it missed one. */
export const PRESS_POLL_MS = 10_000

/**
 * Applies presses until stopped: `drain` runs at once, at each wake that `wakes` gives, and every `PRESS_POLL_MS`.
 * `wakes` starts what wakes it, such as a file watcher, and returns how to stop that. A failed drain goes to `log`.
 */
export function followPresses(
  drain: () => Promise<void>,
  wakes: (wake: () => void) => () => void,
  every: (ms: number, fn: () => void) => () => void,
  log: (text: string) => void,
): () => void {
  const wake = () => void drain().catch((err: unknown) => log(`Herdr presses not read: ${message(err)}`))
  wake()
  const stopPoll = every(PRESS_POLL_MS, wake)
  const stopWakes = wakes(wake)

  return () => {
    stopPoll()
    stopWakes()
  }
}

/** What a look or collapse file comes to as a press outcome: nothing to show, copy or wait for. */
const LOOK_OUTCOME: PressOutcome = {
  copy: null,
  error: null,
  note: null,
  isUnconfirmed: false,
  isRowFailed: false,
  wakesAfterSettle: false,
}

/**
 * A file the Herdr look wrote, applied: done with its outcome, or saved with a message the host holds until the agent's
 * turn ends, which `finish` sends before the press's opens and copies.
 */
type StartedHerdrFile = StartedCommand

const finished = (outcome: PressOutcome): StartedHerdrFile => ({ is: 'done', outcome })

/** A host's `StartedFile` for a started Herdr file, which runs `after` with the press's outcome once it is known. */
export const startedFile = (started: StartedHerdrFile, after: (outcome: PressOutcome) => void): StartedFile => {
  if (started.is === 'waiting') return { waiting: async () => after(await started.finish()) }
  after(started.outcome)
  return DONE
}

/** A host that applies Herdr files: a press host, with the store that keeps its viewer leases. */
export type HerdrFileHost<S extends Session> = PressHost<S> & { viewers: ViewerStore }

/**
 * Applies a viewer's heartbeat to the viewer store, which leaves the saved session alone. When a viewer stops showing
 * the Status, its look is counted as `lookReportedOn` counts it, and that is saved before the lease, so a failed save
 * leaves the heartbeat to be applied again. A viewer on the PRs tab makes the host read the session's PRs if they are due.
 */
async function applyViewerUpdate<S extends Session>(host: HerdrFileHost<S>, file: RemoteViewerUpdate): Promise<void> {
  const now = await host.now()
  const leases = await host.viewers.read()
  const next = updateRemoteViewer(leases, file, now)
  const previous = leases[file.id]
  const viewer = next[file.id]
  if (next === leases || !viewer) return
  const isSameLook =
    previous !== undefined &&
    !previous.released &&
    previous.expiresAt > now &&
    previous.generation === file.generation &&
    previous.tab === 'overview' &&
    file.tab === 'overview'
  const endedLook = isSameLook && !file.active ? previous : undefined
  const lookShownSince = endedLook?.shownSince ?? null
  if (endedLook && lookShownSince !== null) {
    const duration = Math.min(file.visibleForMs ?? 0, now - lookShownSince)
    await host.update(s =>
      lookReportedOn(s, {
        startedAt: now - duration,
        endedAt: now,
        drawnWrittenAt: Math.min(now, file.seenAt ?? 0),
        shown: viewer.released ? endedLook.shownRows : viewer.shownRows,
      }),
    )
  }
  await host.viewers.update(current => updateRemoteViewer(current, file, now))
  if (!viewer.released && viewer.tab === 'prs') await host.refreshPrsIfDue?.()
}

/**
 * Applies a file the Herdr look wrote. A look at the Status counts as `lookReportedOn` counts it, a collapse is
 * saved as `withCollapse` saves it, and a report that the look shows the PRs tab makes the host read the session's PRs
 * if they are due. A press is applied, then named as the session's `lastHerdrPress`, so the next publish tells the look
 * the outcome even when the press changed nothing. When the look ran the press's opens and copies, `perform` answers
 * with their result instead of running them again. A message the host holds until the agent's turn ends is saved as
 * queued, which is its row's outcome until then: that press is named once saved, and waits to run.
 */
export async function startHerdrFile<S extends Session>(
  host: HerdrFileHost<S>,
  file: HerdrFile,
  sessionId = '',
): Promise<StartedHerdrFile> {
  if (file.format === 2) {
    if (file.kind === 'command') return startRemoteCommand(host, file, sessionId)
    if (file.session !== sessionId) return finished(LOOK_OUTCOME)
    await applyViewerUpdate(host, file)
    return finished(LOOK_OUTCOME)
  }
  if (isLookFile(file)) {
    await host.update(s => lookReportedOn(s, file.look))
    return finished(LOOK_OUTCOME)
  }
  if (isPrsShownFile(file)) {
    await host.refreshPrsIfDue?.()
    return finished(LOOK_OUTCOME)
  }
  if (!isPressFile(file)) {
    const { row, isCollapsed, at } = file.collapse
    await host.update(s => withCollapse(s, row, isCollapsed, at))
    return finished(LOOK_OUTCOME)
  }
  const { result } = file
  const started = await startPress(
    result ? { ...host, perform: async () => result.error } : host,
    file.press,
    false,
    file.holds,
  )
  const saveLast = (outcome: PressOutcome | null) =>
    host.update(s => ({
      ...s,
      lastHerdrPress: { id: file.id, outcome: outcome?.note === 'stale' ? 'stale' : 'applied' } as const,
    }))
  const isQueuedOnSave =
    host.isDeliveryHeldUntilRun === true && (started.effects?.some(e => e.kind === 'send') ?? false)
  if (!isQueuedOnSave) {
    const outcome = await started.finish()
    await saveLast(outcome)
    return finished(outcome)
  }
  const lastUnsaved = await saveLast(null).then(
    () => null,
    (err: unknown) => err,
  )

  return {
    is: 'waiting',
    finish: async () => {
      const outcome = await started.finish()
      if (lastUnsaved !== null) throw lastUnsaved
      return outcome
    },
  }
}
