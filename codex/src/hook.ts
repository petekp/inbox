import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

import { dialogActivity } from '../../hooks/model-text'
import { subagentStep } from '../../hooks/view'
import {
  activityOf,
  changeSubagent,
  cleared,
  endTurn,
  noteActivity,
  noteHook,
  notePrompt,
  noteSpawn,
  patchFiles,
  settledSubagents,
  startContext,
  startSubagent,
} from './core'
import { updateState } from './state'
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
            ...(endsTurn ? { ...turnEnded(s), subagents: [], spawning: [] } : {}),
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
              settledSubagents({ ...r.state, presence: { ...r.state.presence, isTurnRunning: true } }),
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
      if (agentId && step) await updateState(dir, id, s => changeSubagent(s, agentId, { step }, now()))
      if (!agentId && /spawn_agent$/.test(tool) && typeof toolInput.task_name === 'string') {
        const taskName = toolInput.task_name
        await updateState(dir, id, s => noteSpawn(s, taskName))

        return null
      }
      if (tool === 'apply_patch') {
        const files = patchFiles(command).map(f => resolve(input.cwd || '/', f))
        await updateState(dir, id, s => files.reduce((x, f) => noteActivity(x, `edited ${f}`), s))

        return null
      }
      const line = activityOf(tool, toolInput)
      if (line) await updateState(dir, id, s => noteActivity(s, line))

      return null
    }
    case 'Stop': {
      const reply = input.last_assistant_message ?? ''
      const dialogs = await dialogsInTurn(input.transcript_path, input.turn_id)
      const lines = dialogs.map(questions => dialogActivity(questions, { kind: 'open' }))
      const written = await updateState(dir, id, s =>
        noteHook(
          endTurn(
            lines.reduce((x, line) => noteActivity(x, line), withCli(settledSubagents({ ...s, ...turnEnded(s) }))),
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
      if (agentId) await updateState(dir, id, s => startSubagent(s, agentId, now()))

      return null
    }
    case 'SubagentStop': {
      const agentId = input.agent_id
      if (agentId) await updateState(dir, id, s => changeSubagent(s, agentId, { state: 'done' }, now()))

      return null
    }
  }

  return null
}

function turnEnded(s: SessionState): Pick<SessionState, 'presence'> {
  return { presence: { ...s.presence, isTurnRunning: false } }
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
