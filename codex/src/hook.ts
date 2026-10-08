// Every hook runs this file. It reads the event from stdin, changes the
// session's state, and prints what Codex reads back. A hook that fails prints
// nothing and exits 0, so Codex goes on as if the plugin weren't installed.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'

import { addRepo } from '../../hooks/check-tracking'
import { resolvePath } from '../../hooks/checks'
import {
  activityOf,
  checkFromRun,
  claimCheck,
  cleared,
  endTurn,
  isCompoundCheck,
  noteActivity,
  notePrompt,
  patchFiles,
  recordRun,
  startContext,
} from './core'
import { readState, updateState } from './state'
import type { SessionState } from './state'
import { CHECK_REFUSAL } from './texts'
import { commandEnds, isExecRun } from './transcript'
import { refreshTree, repoOf } from './tree'
import type { Run } from './tree'

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
  exec: Run
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
      const top = root ? await repoOf(deps.exec, root) : null
      const s = await updateState(dir, id, s => {
        const base = input.source === 'clear' ? cleared(s) : s
        const checks = top ? addRepo(base.checks, top) : base.checks

        return withCli({ ...base, root, top, checks })
      })

      const context = startContext(s, input.source)

      return context ? { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } } : null
    }
    case 'UserPromptSubmit': {
      let notes: string[] = []
      await updateState(dir, id, s => {
        const r = notePrompt(withCli(s), input.prompt ?? '', now())
        notes = r.notes

        return r.state
      })

      return notes.length === 0
        ? null
        : { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: notes.join('\n\n') } }
    }
    case 'PreToolUse': {
      const tool = input.tool_name ?? ''
      const toolInput = input.tool_input ?? {}
      const command = typeof toolInput.command === 'string' ? toolInput.command : ''
      if (tool === 'Bash' && isCompoundCheck(command))
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: CHECK_REFUSAL,
          },
        }
      if (tool === 'apply_patch') {
        const cwd = input.cwd ?? ''
        const files = patchFiles(command).map(f => resolvePath(cwd || '/', f))
        // A file Codex edits makes its repo one of the session's.
        const repos = await Promise.all(
          [...new Set(files.map(f => dirname(f)))].map(d => repoOf(deps.exec, existingFolder(d))),
        )
        await updateState(dir, id, s =>
          files.reduce((x, f) => noteActivity(x, `edited ${f}`), {
            ...s,
            checks: repos.reduce((c, r) => (r ? addRepo(c, r) : c), s.checks),
          }),
        )

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

/** The folder, or its nearest parent that exists: a patch can add a file in a folder it creates. */
function existingFolder(folder: string): string {
  let f = folder
  while (f !== dirname(f) && !existsSync(f)) f = dirname(f)

  return f
}

/**
 * Records the turn's checks from the transcript, sends Codex back once over a
 * reply that a check result contradicts, and otherwise ends the turn and
 * starts the per-reply update.
 */
async function stop(
  input: HookInput,
  deps: HookDeps,
  withCli: (s: SessionState) => SessionState,
): Promise<Record<string, unknown> | null> {
  const { dir, now } = deps
  const id = input.session_id
  const reply = input.last_assistant_message ?? ''
  const before = await readState(dir, id)
  const ends = input.transcript_path && input.turn_id ? await commandEnds(input.transcript_path, input.turn_id) : []
  const done = new Set(before.recordedRuns)
  const runs = ends.flatMap(end => {
    const c = done.has(end.id) ? null : checkFromRun(end, before)
    return c ? [{ end, c }] : []
  })
  // Git runs outside the lock: each run's repo, then a reading of every checked repo.
  const repos = await Promise.all(runs.map(r => repoOf(deps.exec, r.c.folder)))
  let s = before
  for (const [i, r] of runs.entries()) {
    const repo = repos[i] ?? null
    // Edits made before the check count as before it.
    const tree = await refreshTree(deps.exec, s, repo ? [repo] : [])
    s = recordRun({ ...s, ...tree }, r.end.id, r.c, repo, now())
  }
  const tree = await refreshTree(deps.exec, s)
  // Read outside the lock, so a press that changed the checks in the second this took is overwritten.
  const gathered = { checks: tree.checks, snapshots: tree.snapshots, recordedRuns: s.recordedRuns }
  let block: string | null = null
  const written = await updateState(dir, id, current => {
    const merged = withCli({ ...current, ...gathered })
    if (!input.stop_hook_active && reply.trim()) {
      const claim = claimCheck(merged, reply)
      block = claim.block
      if (block) return claim.state
    }

    return endTurn(merged, reply, now())
  })
  if (block) return { decision: 'block', reason: block }
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
