import { open } from 'node:fs/promises'

type SessionMeta = {
  type?: string
  payload?: {
    originator?: string
    source?: string
    forked_from_id?: unknown
    parent_thread_id?: unknown
    cwd?: unknown
    history_base?: { thread_id?: unknown; end_byte_offset?: unknown }
  }
}

/** The rollout's first row, `session_meta`. Null when the file or the row cannot be read. */
export async function readSessionMeta(path: string): Promise<SessionMeta | null> {
  try {
    const file = await open(path, 'r')
    try {
      const buf = Buffer.alloc(64 * 1024)
      const { bytesRead } = await file.read(buf, 0, buf.length, 0)
      const first = buf.subarray(0, bytesRead).toString('utf8').split('\n')[0] ?? ''
      const meta = JSON.parse(first) as SessionMeta

      return meta.type === 'session_meta' ? meta : null
    } finally {
      await file.close()
    }
  } catch {
    return null
  }
}

/** What a hook reads from the rollout's first row, `session_meta`. */
type RolloutMeta = {
  /**
   * Whether the session is a run no person chats in, where the hooks do nothing.
   * An ephemeral thread, such as the Codex app's own background jobs that
   * suggest a next message, saves no transcript, so its hooks get a null path.
   * A `codex exec` run names its originator in `session_meta`, which covers the
   * inbox's own update call and runs other tools start.
   */
  isNonInteractive: boolean
  /** The folder the session started in. Null when the row names none. */
  folder: string | null
}

export async function rolloutMeta(path: string | null): Promise<RolloutMeta> {
  if (path === null) return { isNonInteractive: true, folder: null }
  const meta = await readSessionMeta(path)
  const cwd = meta?.payload?.cwd

  return { isNonInteractive: isExecMeta(meta), folder: typeof cwd === 'string' && cwd !== '' ? cwd : null }
}

export function isExecMeta(meta: SessionMeta | null): boolean {
  return meta?.payload?.originator === 'codex_exec' || meta?.payload?.source === 'exec'
}

/**
 * The session a forked chat was forked from, from `forked_from_id` in the rollout's first row. A fork's rollout also
 * holds the parent's own `session_meta` later on, so only the first row counts.
 */
export async function forkedFromId(path: string): Promise<string | null> {
  const id = (await readSessionMeta(path))?.payload?.forked_from_id

  return typeof id === 'string' && id !== '' ? id : null
}

export type RowPayload = NonNullable<TranscriptLine['payload']>

export type TranscriptLine = {
  type?: string
  payload?: {
    type?: string
    name?: string
    arguments?: unknown
    turn_id?: string
    call_id?: string
    output?: unknown
    action?: { command?: unknown }
    role?: string
    content?: unknown
    item?: { type?: string; command?: unknown; aggregated_output?: unknown; content?: unknown }
  }
}

export const isText = (v: unknown): v is string => typeof v === 'string'

export type Payload = Record<string, unknown>

export type RolloutRow = { type?: unknown; payload?: Payload }

export const record = (v: unknown): Payload => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Payload) : {})

export const textOf = (v: unknown): string => (isText(v) ? v : '')

export const contentText = (content: unknown): string =>
  (Array.isArray(content) ? content : [])
    .map(part => textOf(record(part).text))
    .filter(Boolean)
    .join('\n')
    .trim()

export const jsonRecord = (raw: unknown): Payload => {
  try {
    return record(JSON.parse(textOf(raw)))
  } catch {
    return {}
  }
}
