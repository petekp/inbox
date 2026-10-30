// Reads Codex's session transcript, a JSONL file whose path every hook gets.

import { open, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { forkedFromId, isExecMeta, readSessionMeta } from './rollout-rows'
import { rolloutOfLines, turnEventOf, turnOf, turnRowsOf } from './rollout-turns'
import type { Rollout, TurnEvent, TurnRow, TurnRows } from './rollout-turns'

/** The names under `dir` that match `pattern`, newest first. Empty when the folder cannot be read. */
async function namesIn(dir: string, pattern: RegExp): Promise<string[]> {
  const names = await readdir(dir).catch(() => [])

  return names
    .filter(n => pattern.test(n))
    .sort()
    .reverse()
}

/** The newest file under `sessions/YYYY/MM/DD/` whose name `isWanted` accepts. Null when there is none. */
async function newestRollout(sessions: string, isWanted: (name: string) => boolean): Promise<string | null> {
  for (const year of await namesIn(sessions, /^\d{4}$/))
    for (const month of await namesIn(join(sessions, year), /^\d{2}$/))
      for (const day of await namesIn(join(sessions, year, month), /^\d{2}$/)) {
        const folder = join(sessions, year, month, day)
        const [name] = (await namesIn(folder, /^rollout-.+\.jsonl$/)).filter(isWanted)
        if (name !== undefined) return join(folder, name)
      }

  return null
}

/**
 * A chat's rollout, found by its thread id in Codex's `sessions/YYYY/MM/DD/rollout-<time>-<thread id>.jsonl`. A chat
 * Codex reverted continues in `rollout-<time>-<thread id>_<rollout id>.jsonl`, and the newest file wins: `readRollout`
 * reads the history it continues. Null when no readable file holds it, or when the newest one belongs to a subagent or
 * a run no person chats in. A rollout Codex has compressed (`.zst`) is not read. `cwd` is the folder the chat runs in,
 * from its first row.
 */
export async function rolloutFor(codexHome: string, threadId: string): Promise<{ path: string; cwd: string } | null> {
  if (threadId === '') return null
  const path = await newestRollout(
    join(codexHome, 'sessions'),
    name => name.endsWith(`-${threadId}.jsonl`) || name.includes(`-${threadId}_`),
  )
  if (path === null) return null
  const meta = await readSessionMeta(path)
  const isOwnChat = meta !== null && !meta.payload?.parent_thread_id && !isExecMeta(meta)

  return isOwnChat ? { path, cwd: typeof meta.payload?.cwd === 'string' ? meta.payload.cwd : '' } : null
}

/**
 * The earlier rollout a reverted chat's rollout continues, and the byte offset where its kept history ends, from
 * `history_base` in the first row. The base is named by its rollout id: a chat's first rollout has the thread id's
 * name, and a later one ends in `_<rollout id>`. Null for a rollout that continues none, or whose base is not found.
 */
async function historyBase(path: string): Promise<{ path: string; end: number } | null> {
  const base = (await readSessionMeta(path))?.payload?.history_base
  const id = base?.thread_id
  const end = base?.end_byte_offset
  if (typeof id !== 'string' || id === '' || typeof end !== 'number' || end <= 0) return null
  const sessions = dirname(dirname(dirname(dirname(path))))
  const basePath = await newestRollout(sessions, name => name.endsWith(`-${id}.jsonl`) || name.endsWith(`_${id}.jsonl`))

  return basePath === null ? null : { path: basePath, end }
}

const TAIL_BYTES = 4 * 1024 * 1024

/**
 * The last `bytes` before `end` in a file, as lines, with the offset they start at and the bytes read. A cut first line
 * is dropped.
 */
async function linesBefore(
  path: string,
  bytes: number,
  end = Infinity,
): Promise<{ lines: string[]; start: number; read: number }> {
  const file = await open(path, 'r')
  try {
    const stop = Math.min(end, (await file.stat()).size)
    const start = Math.max(0, stop - bytes)
    const buf = Buffer.alloc(stop - start)
    const { bytesRead } = await file.read(buf, 0, buf.length, start)
    const lines = buf.subarray(0, bytesRead).toString('utf8').split('\n')
    if (start > 0) lines.shift()

    return { lines, start, read: bytesRead }
  } finally {
    await file.close()
  }
}

const TURN_ROW_BYTES = 64 * 1024

/**
 * The rollout's newest turn event. Its turn still runs when it is a start. Stop does not run for an interrupted turn,
 * and another plugin's Stop can continue a turn after the inbox's Stop ran, so only the rollout says whether the turn
 * runs. Only the last `TURN_ROW_BYTES` are read. Null when they hold no turn event or the file cannot be read.
 */
export async function newestTurnEvent(path: string): Promise<TurnEvent | null> {
  try {
    for (const line of (await tailLines(path, TURN_ROW_BYTES)).reverse()) {
      const event = turnEventOf(line)
      if (event !== null) return event
    }

    return null
  } catch {
    return null
  }
}

/** The last `bytes` of a file as lines. A cut first line is dropped. */
async function tailLines(path: string, bytes: number): Promise<string[]> {
  return (await linesBefore(path, bytes)).lines
}

/**
 * The newest `bytes` of a chat's history, as lines. A reverted chat's rollout holds only the turns after the revert,
 * and its history goes on in the kept part of the rollout it continues, as Codex reads it in `rollout_lineage.rs`. An
 * earlier rollout that cannot be found or read, such as a compressed one, ends the history there.
 */
async function historyLines(path: string, bytes: number): Promise<string[]> {
  const first = await linesBefore(path, bytes)
  const parts = [first.lines]
  const seen = new Set([path])
  let budget = bytes - first.read
  let isWhole = first.start === 0
  let current = path
  while (isWhole && budget > 0) {
    const base = await historyBase(current).catch(() => null)
    if (base === null || seen.has(base.path)) break
    seen.add(base.path)
    const part = await linesBefore(base.path, budget, base.end).catch(() => null)
    if (part === null) break
    parts.unshift(part.lines)
    budget -= part.read
    isWhole = part.start === 0
    current = base.path
  }

  return parts.flat()
}

/**
 * What the agent did in a turn, oldest first, read from the transcript. Codex runs no hook for its dialog tool,
 * and a shell command's output reaches no hook at all when the command runs long, so both show only here.
 * The turn is the one with `turnId`, or the newest when none is given. Only the last few megabytes are read. When
 * they hold no turn start, they count as the turn. A transcript that cannot be read gives an empty turn.
 *
 * `dialogs` holds each dialog the agent opened. Its answer arrives later, as a user message.
 * `commands` holds each shell command that finished. The `CommandExecution` rows of Codex CLI 0.163 and later give
 * them. A turn with none falls back to older shell calls and their outputs.
 */
export async function turnIn(path: string | null, turnId: string | undefined): Promise<TurnRows> {
  return turnOf(await rolloutTail(path), turnId)
}

/** The last few megabytes of a rollout, as lines. Empty when the file cannot be read. */
export async function rolloutTail(path: string | null): Promise<string[]> {
  return path === null ? [] : tailLines(path, TAIL_BYTES).catch(() => [])
}

const ROLLOUT_BYTES = 8 * 1024 * 1024

/** The windows at the end of a rollout that `RolloutReads.turns` reads, smallest first, before the whole history. */
const TURN_WINDOW_BYTES = [TURN_ROW_BYTES, 512 * 1024, TAIL_BYTES]

export type RolloutReads = {
  /**
   * The rollout's turns, oldest first. They come from the smallest window at the end of the rollout whose turns satisfy
   * `isEnough`, else from the whole history the catch-up reads. Null when the file cannot be read.
   */
  turns(isEnough: (turns: TurnRow[]) => boolean): Promise<TurnRow[] | null>
  /** The conversation over the whole history, as `readRollout` gives it. */
  rollout(cwd: string, currentTurnId?: string): Promise<Rollout | null>
  /** The session the chat was forked from, as `forkedFromId` gives it. */
  forkedFromId(): Promise<string | null>
}

/**
 * One hook's reads of a rollout. Each read is kept, so a check made again under the state lock reads only what the
 * state it checks newly needs. `tail` is the end of the rollout the hook has read already, from `rolloutTail`, and takes
 * the place of the windows.
 */
export function rolloutReads(path: string, tail?: string[]): RolloutReads {
  let history: Promise<string[]> | null = null
  let read: { turns: TurnRow[]; isWhole: boolean } | null = null
  const rollouts = new Map<string, Promise<Rollout | null>>()
  let forkedFrom: Promise<string | null> | null = null
  const wholeHistory = () => (history ??= historyLines(path, ROLLOUT_BYTES))

  async function windowTurns(isEnough: (turns: TurnRow[]) => boolean): Promise<TurnRow[] | null> {
    if (tail !== undefined) {
      const turns = turnRowsOf(tail, true)
      return isEnough(turns) ? turns : null
    }
    for (const bytes of TURN_WINDOW_BYTES) {
      const { lines, start } = await linesBefore(path, bytes)
      const turns = turnRowsOf(lines, true)
      if (isEnough(turns)) return turns
      if (start === 0) break
    }

    return null
  }

  return {
    async turns(isEnough) {
      try {
        if (read === null || !(read.isWhole || isEnough(read.turns))) {
          const window = history === null ? await windowTurns(isEnough) : null
          read =
            window === null
              ? { turns: turnRowsOf(await wholeHistory(), false), isWhole: true }
              : { turns: window, isWhole: false }
        }

        return read.turns
      } catch {
        return null
      }
    },
    rollout(cwd, currentTurnId) {
      const key = JSON.stringify([cwd, currentTurnId ?? null])
      const known = rollouts.get(key)
      if (known !== undefined) return known
      const rollout = wholeHistory()
        .then(lines => rolloutOfLines(lines, cwd, currentTurnId))
        .catch(() => null)
      rollouts.set(key, rollout)

      return rollout
    },
    forkedFromId() {
      return (forkedFrom ??= forkedFromId(path))
    },
  }
}

/**
 * The session's conversation, read from its rollout and, for a reverted chat, the history it continues. A history over
 * a few megabytes keeps its newest part. Codex does
 * not document the rollout, so a row of a kind not read is skipped. `currentTurnId` names the turn a hook runs in, which
 * is not an earlier turn. Null when the file cannot be read.
 */
export async function readRollout(path: string | null, cwd: string, currentTurnId?: string): Promise<Rollout | null> {
  if (path === null) return null
  try {
    return rolloutOfLines(await historyLines(path, ROLLOUT_BYTES), cwd, currentTurnId)
  } catch {
    return null
  }
}
