import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

import { dialogActivity, progressRule } from '../../hooks/model-text'
import { subagentStep } from '../../hooks/view'
import {
  activityOf,
  cleared,
  endTurn,
  noteActivity,
  noteHook,
  notePrompt,
  noteSpawn,
  patchFiles,
  startContext,
  startSubagent,
  subagentResult,
  withoutSubagentsBefore,
  withSubagentChange,
} from './core'
import { updateState } from './state'
import { CODEX } from './texts'
import type { SessionState } from './state'
import { dialogsInTurn, isNonInteractiveRun } from './transcript'

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
  tool_response?: unknown
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

  switch (input.hook_event_name) {
    case 'SessionStart': {
      const root = input.cwd ?? ''
      // Codex runs SessionStart after compacting too, in the middle of a turn.
      const endsTurn = input.source !== 'compact'
      const s = await updateState(dir, id, s =>
        noteHook(
          withCli({
            ...(input.source === 'clear' ? cleared(s) : s),
            root,
            ...(endsTurn ? { ...turnEnded(s), subagents: [], spawnedTasks: [] } : {}),
          }),
          'start',
          now(),
        ),
      )

      const context = startContext(s, input.source)

      return context ? { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } } : null
    }
    case 'UserPromptSubmit': {
      let notes: string[] = []
      await updateState(dir, id, s => {
        const r = notePrompt(withCli(s), input.prompt ?? '', now())
        notes = r.notes

        return input.agent_id
          ? r.state
          : noteHook(
              withoutSubagentsBefore(
                { ...r.state, presence: { ...r.state.presence, isTurnRunning: true, progress: null } },
                s.heard.stopAt ?? 0,
              ),
              'prompt',
              now(),
              input.turn_id,
            )
      })

      return notes.length === 0
        ? null
        : { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: notes.join('\n\n') } }
    }
    case 'PreToolUse': {
      const tool = input.tool_name ?? ''
      const toolInput = input.tool_input ?? {}
      const command = typeof toolInput.command === 'string' ? toolInput.command : ''
      const agentId = input.agent_id
      const step = agentId ? subagentStep(tool, toolInput) : null
      if (agentId && step)
        await updateState(dir, id, s => withSubagentChange(s, agentId, { state: 'running', step }, now()))
      if (tool === 'apply_patch') {
        const files = patchFiles(command).map(f => resolve(input.cwd || '/', f))
        await updateState(dir, id, s => files.reduce((x, f) => noteActivity(x, `edited ${f}`), s))

        return null
      }
      const line = activityOf(tool, toolInput)
      if (line) await updateState(dir, id, s => noteActivity(s, line))

      return null
    }
    case 'PostToolUse': {
      const response = (input.tool_response ?? {}) as Record<string, unknown>
      const isSpawn = !input.agent_id && /spawn_agent$/.test(input.tool_name ?? '')
      if (isSpawn && typeof response.task_name === 'string') {
        const taskName = response.task_name
        await updateState(dir, id, s => noteSpawn(s, taskName))
      }

      return null
    }
    case 'Stop': {
      if (input.agent_id) return null
      const reply = input.last_assistant_message ?? ''
      const dialogs = await dialogsInTurn(input.transcript_path, input.turn_id)
      const lines = dialogs.map(questions => dialogActivity(questions, { kind: 'open' }))
      const written = await updateState(dir, id, s =>
        noteHook(
          endTurn(
            lines.reduce((x, line) => noteActivity(x, line), withCli({ ...s, ...turnEnded(s), spawnedTasks: [] })),
            reply,
            now(),
          ),
          'stop',
          now(),
        ),
      )
      if (written.pending.length > 0) deps.startUpdate(id)

      return null
    }
    case 'Interrupt': {
      await updateState(dir, id, s => ({
        ...s,
        ...turnEnded(s),
        subagents: s.subagents.map(x => (x.state === 'running' ? { ...x, state: 'stopped' as const, at: now() } : x)),
      }))

      return null
    }
    case 'SubagentStart': {
      const agentId = input.agent_id
      if (!agentId) return null
      await updateState(dir, id, s => startSubagent(s, agentId, now()))

      return { hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: progressRule(CODEX) } }
    }
    case 'SubagentStop': {
      const agentId = input.agent_id
      const result = subagentResult(input.last_assistant_message)
      if (agentId) await updateState(dir, id, s => withSubagentChange(s, agentId, { state: 'done', result }, now()))

      return null
    }
  }

  return null
}

function turnEnded(s: SessionState): Pick<SessionState, 'presence'> {
  return { presence: { ...s.presence, isTurnRunning: false, progress: null } }
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
