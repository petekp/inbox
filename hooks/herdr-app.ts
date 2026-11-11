import type { Session } from '../types'
import { herdrEnvelope, pressFile } from './herdr'
import type { EnvelopeSource, PressFile } from './herdr'
import { sessionFile } from './session-files'
import { rowsInPlace } from './session-presses'

/** The file calls a host publishes with. `move` replaces `to` in one step, so the Herdr look never reads half a file. */
export type PublishFiles = {
  write: (path: string, text: string) => Promise<void>
  move: (from: string, to: string) => Promise<void>
  remove: (path: string) => Promise<void>
}

/** The file calls a host reads presses with. `list` gives a folder's file names, and rejects for a missing folder. */
export type PressFiles = Pick<PublishFiles, 'remove'> & {
  list: (folder: string) => Promise<readonly string[]>
  read: (path: string) => Promise<string>
}

/** The most a published file may hold, since Herdr's `readTextFile` reads at most 1 MiB. */
export const PUBLISH_LIMIT_BYTES = 1024 * 1024

/** Where a host publishes a session for the Herdr look, under the app's settings folder. Throws for an unsafe id. */
export function publishedSessionPath(appHome: string, sessionId: string): string {
  return `${appHome}/inbox/sessions/${sessionFile(sessionId)}`
}

/** The folder the Herdr look writes a session's presses to. Throws for an unsafe id. */
export function pressFolder(appHome: string, sessionId: string): string {
  sessionFile(sessionId)

  return `${appHome}/inbox/presses/${sessionId}`
}

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

/** The text of the session's envelope. Over `PUBLISH_LIMIT_BYTES`, it leaves out the folded closed items, as `trimmed`. */
export function publishedText(source: EnvelopeSource, session: Session): string {
  const text = JSON.stringify(herdrEnvelope(source, session))

  return isOverLimit(text) ? JSON.stringify(herdrEnvelope(source, withoutFoldedClosed(session), true)) : text
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
): Promise<void> {
  const path = publishedSessionPath(appHome, source.sessionId)
  const temporary = `${path}.${source.writtenAt}-${Math.random().toString(36).slice(2)}.tmp`
  try {
    await files.write(temporary, publishedText(source, session))
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

  return publishSession(files, appHome, source, session).then(
    () => true,
    (err: unknown) => {
      log(`Herdr publish failed: ${err instanceof Error ? err.message : String(err)}`)
      return false
    },
  )
}

/** Removes the session's published file, as when the session ends. */
export async function unpublishSession(files: PublishFiles, appHome: string, sessionId: string): Promise<void> {
  return files.remove(publishedSessionPath(appHome, sessionId))
}

/**
 * Applies one press for `sessionId`. False leaves its file for later, as when the host no longer runs that session.
 * A rejection is logged, and the file is removed as for an applied press.
 */
export type ApplyPress = (sessionId: string, file: PressFile) => Promise<boolean>

/** How many applied press ids a drain remembers, so a press whose file could not be removed is not applied again. */
const REMEMBERED_PRESSES = 200

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/**
 * Returns a drain: it applies each press file waiting for a session, oldest press first, and removes the file. A file
 * `pressFile` refuses is logged and removed. One drain of a folder runs at a time, and a drain asked for while one runs
 * runs once more after it, so a press that lands mid-drain is not missed.
 */
export function pressDrainer(
  files: PressFiles,
  apply: ApplyPress,
  log: (text: string) => void,
): (appHome: string, sessionId: string) => Promise<void> {
  const applied: string[] = []
  const draining = new Map<string, { again: boolean; done: Promise<void> }>()

  const drainOnce = async (folder: string, sessionId: string) => {
    const names = [...(await files.list(folder).catch(() => []))].filter(name => name.endsWith('.json')).sort()
    const waiting: { path: string; file: PressFile }[] = []
    for (const name of names) {
      const path = `${folder}/${name}`
      const text = await files.read(path).catch(() => null)
      if (text === null) continue
      const read = pressFile(text)
      if (read.ok) waiting.push({ path, file: read.file })
      else {
        log(`Herdr press ${name} refused: ${read.reason}`)
        await files.remove(path).catch(() => undefined)
      }
    }
    for (const { path, file } of waiting.sort((a, b) => a.file.pressedAt - b.file.pressedAt)) {
      if (!applied.includes(file.id)) {
        const isTaken = await apply(sessionId, file).catch((err: unknown) => {
          log(`Herdr press ${file.id} failed: ${message(err)}`)
          return true
        })
        if (!isTaken) continue
        applied.push(file.id)
        if (applied.length > REMEMBERED_PRESSES) applied.shift()
      }
      await files.remove(path).catch((err: unknown) => log(`Herdr press ${file.id} not removed: ${message(err)}`))
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
