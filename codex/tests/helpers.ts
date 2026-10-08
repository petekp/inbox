import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { HookDeps, HookInput } from '../src/hook'
import type { Run } from '../src/tree'
import { run } from '../src/tree'

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'inbox-codex-'))
}

/** A git repo with one commit, holding `files`. */
export function tempRepo(files: Record<string, string>): string {
  const repo = tempDir()
  for (const [name, text] of Object.entries(files)) writeFileSync(join(repo, name), text)
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' })
  git('init', '-q')
  git('add', '-A')
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init')

  return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: repo, encoding: 'utf8' }).trim()
}

/** Runs git for real and records every other command, answering it with `answer`. */
export function fakeRunner(answer: (args: string[]) => { code: number; stdout: string; stderr: string }) {
  const calls: string[][] = []
  const exec: Run = (args, opts) => {
    if (args[0] === 'git') return run(args, opts)
    calls.push(args)
    return Promise.resolve(answer(args))
  }

  return { exec, calls }
}

/** One transcript line recording a finished shell command, as Codex writes it. */
export function commandEndLine(
  turnId: string,
  id: string,
  command: string,
  cwd: string,
  exitCode: number,
  output: string,
) {
  return JSON.stringify({
    timestamp: '2026-01-01T00:00:00.000Z',
    type: 'event_msg',
    payload: {
      type: 'item_completed',
      thread_id: 's1',
      turn_id: turnId,
      item: {
        type: 'CommandExecution',
        id,
        command: ['/bin/zsh', '-lc', command],
        cwd: `file://${cwd}`,
        status: 'completed',
        aggregated_output: output,
        exit_code: exitCode,
      },
    },
  })
}

export function hookDeps(dir: string, exec: Run, now = () => 1000): HookDeps & { updates: string[] } {
  const updates: string[] = []

  return {
    dir,
    env: { CODEX_CLI_PATH: '/apps/codex' },
    now,
    exec,
    startUpdate: id => updates.push(id),
    updates,
  }
}

export function input(event: string, fields: Partial<HookInput> = {}): HookInput {
  return { hook_event_name: event, session_id: 's1', ...fields }
}
