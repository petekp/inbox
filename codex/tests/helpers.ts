import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { HookDeps, HookInput } from '../src/hook'
import type { Run } from '../src/run'

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'inbox-codex-'))
}

/** Records every command, answering it with `answer`. */
export function fakeRunner(answer: (args: string[]) => { code: number; stdout: string; stderr: string }) {
  const calls: string[][] = []
  const exec: Run = args => {
    calls.push(args)
    return Promise.resolve(answer(args))
  }

  return { exec, calls }
}

export function hookDeps(dir: string, now = () => 1000): HookDeps & { updates: string[] } {
  const updates: string[] = []

  return {
    dir,
    env: { CODEX_CLI_PATH: '/apps/codex' },
    now,
    startUpdate: id => updates.push(id),
    updates,
  }
}

export function input(event: string, fields: Partial<HookInput> = {}): HookInput {
  return { hook_event_name: event, session_id: 's1', ...fields }
}
