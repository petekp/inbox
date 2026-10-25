import { resolve } from 'node:path'

import { dialogActivity } from '../../hooks/model-text'
import { cleared, needsUpdate, noteActivity, noteCommandOutput, startContext } from '../../hooks/session'
import { activityOf, endTurn, noteHook, notePrompt, patchFiles } from './core'
import { noteDialogs } from './dialogs'
import { withEarlierHistory } from './history'
import { updateState } from './state'
import type { SessionState } from './state'
import { CODEX } from './texts'
import { isNonInteractiveRun, turnIn } from './transcript'

export type HookInput = {
  hook_event_name: string
  session_id: string
  turn_id?: string
  /** Set when a subagent's hook fires. It carries the parent's session id. */
  agent_id?: string
  transcript_path: string | null
  cwd?: string
  source?: string
  prompt?: string
  tool_name?: string
  tool_input?: Record<string, unknown>
  last_assistant_message?: string | null
}

export type HookDeps = {
  dir: string
  env: NodeJS.ProcessEnv
  now: () => number
  startUpdate: (sessionId: string) => void
}

export async function handleHook(input: HookInput, deps: HookDeps): Promise<Record<string, unknown> | null> {
  const id = input.session_id
  const { dir, env, now } = deps
  // INBOX_IN_EXEC lets a test drive a whole session through `codex exec`.
  if (!id || (!env.INBOX_IN_EXEC && (await isNonInteractiveRun(input.transcript_path)))) return null
  const cliPath = env.CODEX_CLI_PATH || null
  const withCli = (s: SessionState): SessionState => (cliPath && s.cliPath !== cliPath ? { ...s, cliPath } : s)
  // A subagent's hook names its own rollout, not the session's.
  const rolloutPath = input.agent_id ? null : input.transcript_path
  const withRollout = (s: SessionState): SessionState =>
    rolloutPath !== null && s.transcriptPath !== rolloutPath ? { ...s, transcriptPath: rolloutPath } : s
  const withHost = (s: SessionState): SessionState => withRollout(withCli(s))
  let isMarkedBehind = false
  /** A compaction start runs in the middle of a turn, so it marks nothing behind. */
  const withHistory = async (s: SessionState): Promise<SessionState> => {
    if (rolloutPath === null) return s
    const r = await withEarlierHistory(s, {
      dir,
      rolloutPath,
      cwd: input.cwd ?? s.root,
      currentTurnId: input.turn_id,
      canMarkBehind: input.source !== 'compact',
    })
    isMarkedBehind = r.isBehind

    return r.state
  }

  switch (input.hook_event_name) {
    case 'SessionStart': {
      const root = input.cwd ?? ''
      const s = await updateState(dir, id, async s =>
        noteHook(withHost(await withHistory({ ...(input.source === 'clear' ? cleared(s) : s), root })), 'start', now()),
      )
      if (isMarkedBehind) deps.startUpdate(id)

      const context = startContext(CODEX, s, input.source)

      return context ? { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } } : null
    }
    case 'UserPromptSubmit': {
      let notes: string[] = []
      await updateState(dir, id, async s => {
        const r = notePrompt(withHost(await withHistory(s)), input.prompt ?? '', now())
        notes = r.notes

        return input.agent_id ? r.state : noteHook(r.state, 'prompt', now(), input.turn_id)
      })
      if (isMarkedBehind) deps.startUpdate(id)

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
        await updateState(dir, id, s => files.reduce((x, f) => noteActivity(x, `edited ${f}`), withRollout(s)))

        return null
      }
      const line = activityOf(tool, toolInput)
      if (line) await updateState(dir, id, s => noteActivity(withRollout(s), line))

      return null
    }
    case 'Stop': {
      const reply = input.last_assistant_message ?? ''
      const { dialogs, commands } = await turnIn(input.transcript_path, input.turn_id)
      const lines = dialogs.map(d => dialogActivity(d.questions, { kind: 'open' }))
      const written = await updateState(dir, id, async s => {
        const withLines = lines.reduce(
          (x, line) => noteActivity(x, line),
          noteDialogs(withHost(await withHistory(s)), dialogs),
        )
        const withOutput = commands.reduce((x, c) => noteCommandOutput(x, c.command, c.output), withLines)

        return noteHook(endTurn(withOutput, reply, now()), 'stop', now())
      })
      if (needsUpdate(written)) deps.startUpdate(id)

      return null
    }
  }

  return null
}
