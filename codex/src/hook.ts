// Every hook runs this file. It reads the event from stdin, changes the
// session's state, and prints what Codex reads back. A hook that fails prints
// nothing and exits 0, so Codex goes on as if the plugin weren't installed.

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

import { activityOf, cleared, endTurn, noteActivity, noteHook, notePrompt, patchFiles, startContext } from './core'
import { updateState } from './state'
import type { SessionState } from './state'
import { isExecRun } from './transcript'

export type HookInput = {
  hook_event_name: string
  session_id: string
  turn_id?: string
  transcript_path?: string
  cwd?: string
  source?: string
  prompt?: string
  tool_name?: string
  tool_input?: Record<string, unknown>
  last_assistant_message?: string | null
  stop_hook_active?: boolean
}

export type HookDeps = {
  dir: string
  env: NodeJS.ProcessEnv
  now: () => number
  /** Starts the per-reply update in a process that outlives the hook. */
  startUpdate: (sessionId: string) => void
}

/** What a hook prints, or null to print nothing. */
export async function handleHook(input: HookInput, deps: HookDeps): Promise<Record<string, unknown> | null> {
  const id = input.session_id
  const { dir, env, now } = deps
  // INBOX_IN_EXEC lets a test drive a whole session through `codex exec`.
  if (!id || (!env.INBOX_IN_EXEC && (await isExecRun(input.transcript_path)))) return null
  // Every hook learns the codex binary the desktop app runs, for the server's `codex queue` and the update's `codex exec`.
  const cliPath = env.CODEX_CLI_PATH || null
  const withCli = (s: SessionState): SessionState => (cliPath && s.cliPath !== cliPath ? { ...s, cliPath } : s)

  switch (input.hook_event_name) {
    case 'SessionStart': {
      const root = input.cwd ?? ''
      const s = await updateState(dir, id, s =>
        noteHook(withCli({ ...(input.source === 'clear' ? cleared(s) : s), root }), 'start', now()),
      )

      const context = startContext(s, input.source)

      return context ? { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } } : null
    }
    case 'UserPromptSubmit': {
      let notes: string[] = []
      await updateState(dir, id, s => {
        const r = notePrompt(withCli(s), input.prompt ?? '', now())
        notes = r.notes

        return noteHook(r.state, 'prompt', now(), input.turn_id)
      })

      return notes.length === 0
        ? null
        : { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: notes.join('\n\n') } }
    }
    case 'PreToolUse': {
      const tool = input.tool_name ?? ''
      const toolInput = input.tool_input ?? {}
      const command = typeof toolInput.command === 'string' ? toolInput.command : ''
      if (tool === 'apply_patch') {
        const files = patchFiles(command).map(f => resolve(input.cwd || '/', f))
        await updateState(dir, id, s => files.reduce((x, f) => noteActivity(x, `edited ${f}`), s))

        return null
      }
      const line = activityOf(tool, toolInput)
      if (line) await updateState(dir, id, s => noteActivity(s, line))

      return null
    }
    case 'Stop':
      return stop(input, deps, withCli)
  }

  return null
}

/** Ends the turn and starts the per-reply update. */
async function stop(
  input: HookInput,
  deps: HookDeps,
  withCli: (s: SessionState) => SessionState,
): Promise<Record<string, unknown> | null> {
  const { dir, now } = deps
  const id = input.session_id
  const reply = input.last_assistant_message ?? ''
  const written = await updateState(dir, id, current =>
    noteHook(endTurn(withCli(current), reply, now()), 'stop', now()),
  )
  if (written.pending.length > 0) deps.startUpdate(id)

  return null
}

/** Starts the update in a detached process, so a model call longer than the hook's limit still finishes. */
export function detachedUpdate(dir: string, env: NodeJS.ProcessEnv, script: string): (sessionId: string) => void {
  return sessionId => {
    const child = spawn(process.execPath, [script, sessionId], {
      detached: true,
      stdio: 'ignore',
      env: { ...env, INBOX_DATA: dir },
    })
    child.unref()
  }
}
