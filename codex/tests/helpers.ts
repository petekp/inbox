import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { HookDeps, HookInput } from '../src/hook'
import type { Run } from '../../hooks/gh'
import { OVERVIEW_SYSTEM } from '../../hooks/model-text'
import type { Ask } from '../../hooks/session-host'

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'inbox-codex-'))
}

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
  return { hook_event_name: event, session_id: 's1', transcript_path: join(tmpdir(), 'rollout.jsonl'), ...fields }
}

export const ROLLOUT_FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'rollout.jsonl')

export function rolloutCopy(): string {
  const path = join(tempDir(), 'rollout.jsonl')
  copyFileSync(ROLLOUT_FIXTURE, path)

  return path
}

export function rolloutAt(
  home: string,
  threadId: string,
  meta: Record<string, unknown> = {},
  { day = '2026/10/20', ext = 'jsonl' }: { day?: string; ext?: string } = {},
): string {
  const [first = '', ...rest] = readFileSync(ROLLOUT_FIXTURE, 'utf8').split('\n')
  const row = JSON.parse(first)
  const payload = { ...row.payload, id: threadId, originator: 'Codex Desktop', source: 'vscode', ...meta }
  const folder = join(home, 'sessions', day)
  mkdirSync(folder, { recursive: true })
  const path = join(folder, `rollout-${day.replaceAll('/', '-')}T05-01-10-${threadId}.${ext}`)
  writeFileSync(path, ext === 'jsonl' ? [JSON.stringify({ ...row, payload }), ...rest].join('\n') : 'compressed')

  return path
}

export function ledgerOnly(ask: (prompt: string) => Promise<string | null>): Ask {
  return (prompt, system) => (system === OVERVIEW_SYSTEM ? Promise.resolve(null) : ask(prompt))
}
