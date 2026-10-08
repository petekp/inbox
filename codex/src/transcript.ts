// Reads Codex's session transcript, a JSONL file whose path every hook gets.

import { createReadStream } from 'node:fs'
import { open } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

/** A shell command that finished, as the transcript records it. */
export type CommandEnd = {
  id: string
  command: string
  cwd: string
  exitCode: number | null
  output: string
}

/**
 * Whether the session is a `codex exec` run: the transcript's first line,
 * `session_meta`, names its originator. The hooks do nothing there, which
 * covers the inbox's own update call and runs other tools start.
 */
export async function isExecRun(path: string | undefined): Promise<boolean> {
  if (!path) return false
  try {
    const file = await open(path, 'r')
    try {
      const buf = Buffer.alloc(64 * 1024)
      const { bytesRead } = await file.read(buf, 0, buf.length, 0)
      const first = buf.subarray(0, bytesRead).toString('utf8').split('\n')[0] ?? ''
      const meta = JSON.parse(first) as { type?: string; payload?: { originator?: string; source?: string } }

      return (
        meta.type === 'session_meta' && (meta.payload?.originator === 'codex_exec' || meta.payload?.source === 'exec')
      )
    } finally {
      await file.close()
    }
  } catch {
    return false
  }
}

/** The folder a command ran in, which Codex writes as a path or a file:// URL. */
function folderOf(cwd: unknown): string {
  if (typeof cwd !== 'string') return ''
  try {
    return cwd.startsWith('file://') ? fileURLToPath(cwd) : cwd
  } catch {
    return ''
  }
}

/** The command a shell ran, without the shell's own words: `/bin/zsh -lc "npm test"` is `npm test`. */
function shellCommand(argv: unknown): string {
  if (typeof argv === 'string') return argv
  if (!Array.isArray(argv)) return ''
  const words = argv.filter((w): w is string => typeof w === 'string')
  const i = words.findIndex(w => /^-\w*c$/.test(w))
  if (i >= 1 && /(^|\/)(ba|z|da|k)?sh$/.test(words[0] ?? '')) return words[i + 1] ?? ''

  return words.join(' ')
}

/**
 * The shell commands that finished in one turn, oldest first. In the desktop
 * app a long command returns to the model before it ends, and its
 * PostToolUse never fires, but its end is still recorded here.
 */
export async function commandEnds(path: string, turnId: string): Promise<CommandEnd[]> {
  const ends: CommandEnd[] = []
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.includes('"CommandExecution"') || !line.includes(turnId)) continue
    try {
      const row = JSON.parse(line) as {
        payload?: { type?: string; turn_id?: string; item?: Record<string, unknown> }
      }
      const item = row.payload?.item
      if (row.payload?.type !== 'item_completed' || row.payload.turn_id !== turnId || item?.type !== 'CommandExecution')
        continue
      const output = typeof item.aggregated_output === 'string' ? item.aggregated_output : ''
      ends.push({
        id: String(item.id ?? ''),
        command: shellCommand(item.command),
        cwd: folderOf(item.cwd),
        exitCode: typeof item.exit_code === 'number' ? item.exit_code : null,
        output,
      })
    } catch {
      continue
    }
  }

  return ends
}
