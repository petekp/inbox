import type { Session } from '../types'
import type { ClientId } from './clients'
import { herdrEnvelope, pressFolder, publishedSessionPath } from './herdr'
import type { EnvelopeSource } from './herdr'
import { pressFile } from './herdr-press-file'
import type { PressFile } from './herdr-press-file'
import { press } from './host-press'
import type { PressHost, PressOutcome } from './host-press'
import { rowsInPlace } from './session-presses'
import { clipLabel } from './text'

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

/** `s` without the closed items and findings that no row draws in place, which the look folds under its closed count. */
function withoutFoldedClosed(s: Session): Session {
  const inPlace = rowsInPlace(s)
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
  const trimmed = JSON.stringify(herdrEnvelope(source, withoutFoldedClosed(session), true))
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
export async function unpublishSession(files: PublishFiles, appHome: string, sessionId: string): Promise<void> {
  await Promise.all([
    files.remove(publishedSessionPath(appHome, sessionId)),
    files.removeFolder(pressFolder(appHome, sessionId)),
  ])
}

/**
 * Applies one press for `sessionId`. False leaves its file for later, as when the host no longer runs that session.
 * A rejection is logged, and the file is removed as for an applied press.
 */
export type ApplyPress = (sessionId: string, file: PressFile) => Promise<boolean>

/** The most characters of a name or reason from a press file that a log line holds. */
const LOGGED_CHARS = 100

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const logged = (text: string) => clipLabel(text, LOGGED_CHARS)

/**
 * Returns a drain: it applies each press file waiting for a session, oldest press first, and removes the file. It
 * reads a folder only when `owns` says this process runs the session there. It takes each file first by moving it to a
 * name only this process uses and no list keeps, so of two processes draining one folder only one applies a press. A
 * file `pressFile` refuses or that cannot be read is logged and removed. One drain of a folder runs at a time, and a
 * drain asked for while one runs runs once more after it, so a press that lands mid-drain is not missed.
 */
export function pressDrainer(
  files: PressFiles,
  owns: (sessionId: string) => Promise<boolean>,
  apply: ApplyPress,
  log: (text: string) => void,
): (appHome: string, sessionId: string) => Promise<void> {
  const takenMark = `.${Math.random().toString(36).slice(2)}.taken`
  const draining = new Map<string, { again: boolean; done: Promise<void> }>()

  const drainOnce = async (folder: string, sessionId: string) => {
    const names = [...(await files.list(folder).catch(() => []))].filter(name => name.endsWith('.json')).sort()
    if (names.length === 0 || !(await owns(sessionId).catch(() => false))) return
    const waiting: { path: string; taken: string; file: PressFile }[] = []
    for (const name of names) {
      const path = `${folder}/${name}`
      const taken = `${path}${takenMark}`
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
    for (const { path, taken, file } of waiting.sort((a, b) => a.file.pressedAt - b.file.pressedAt)) {
      const isTaken = await apply(sessionId, file).catch((err: unknown) => {
        log(`Herdr press ${logged(file.id)} failed: ${message(err)}`)
        return true
      })
      if (isTaken) {
        await files
          .remove(taken)
          .catch((err: unknown) => log(`Herdr press ${logged(file.id)} not removed: ${message(err)}`))
      } else {
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

/**
 * Applies a press the Herdr look wrote, then saves it as the session's `lastHerdrPress`, so the next publish tells the
 * look the outcome even when the press changed nothing. When the look ran the press's opens and copies, `perform`
 * answers with their result instead of running them again.
 */
export async function applyLookPress<S extends Session>(host: PressHost<S>, file: PressFile): Promise<PressOutcome> {
  const { result } = file
  const outcome = await press(
    result ? { ...host, perform: async () => result.error } : host,
    file.press,
    false,
    file.holds,
  )
  const lastHerdrPress = { id: file.id, outcome: outcome.note === 'stale' ? 'stale' : 'applied' } as const
  await host.update(s => ({ ...s, lastHerdrPress }))

  return outcome
}
