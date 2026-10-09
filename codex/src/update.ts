// The per-reply update: the inbox model reads each finished exchange and
// updates the ledger. It runs in a process the Stop hook starts and leaves
// running, one at a time per session.

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { applyUpdate, buildPrompt, parseReply, systemText } from '../../hooks/ledger'
import { readState, statePath, updateState } from './state'
import type { SessionState } from './state'
import { CODEX } from './texts'
import type { Run } from './tree'

/** The inbox model, at low reasoning effort. gpt-6-luna is faster but closed a finding the reply only mentioned. */
export const MODEL = 'gpt-6.1-sol'
const TIMEOUT_MS = 120_000

/**
 * Everything `codex exec` can leave out for a one-shot text answer. A
 * release that drops one of these rejects it by name, so askModel drops any
 * name rejected and tries again.
 */
const OFF = [
  'shell_tool',
  'unified_exec',
  'code_mode_host',
  'apps',
  'plugins',
  'memories',
  'multi_agent',
  'image_generation',
  'browser_use',
  'computer_use',
  'tool_suggest',
  'skill_search',
  'view_image',
  'goals',
  'sleep_tool',
  'personality',
]

export type Ask = (prompt: string) => Promise<string | null>

/**
 * Asks the inbox model through the desktop app's own `codex exec`, with
 * systemText as its only instructions, in an empty folder, with no saved session,
 * user config, hooks or tools. Null when it fails.
 */
export function codexAsk(exec: Run, cli: string, dir: string, model = MODEL): Ask {
  return async prompt => {
    const work = join(dir, 'exec')
    const system = join(dir, 'inbox-system.md')
    const out = join(work, `reply-${randomUUID()}.txt`)
    await mkdir(work, { recursive: true })
    const instructions = systemText(CODEX)
    if ((await readFile(system, 'utf8').catch(() => '')) !== instructions) await writeFile(system, instructions)
    let off = [...OFF]
    for (let tries = 0; tries <= OFF.length; tries += 1) {
      await rm(out, { force: true })
      const r = await exec(
        [
          cli,
          'exec',
          '--ephemeral',
          '--ignore-user-config',
          '--ignore-rules',
          '--skip-git-repo-check',
          '-s',
          'read-only',
          '-C',
          work,
          '-m',
          model,
          '-c',
          'model_reasoning_effort="low"',
          '-c',
          `model_instructions_file=${JSON.stringify(system)}`,
          '-c',
          'project_doc_max_bytes=0',
          ...off.flatMap(f => ['--disable', f]),
          '-o',
          out,
          prompt,
        ],
        { cwd: work, timeoutMs: TIMEOUT_MS },
      )
      const unknown = r.stderr.match(/Unknown feature flag: (\S+)/)?.[1]
      if (r.code !== 0 && unknown && off.includes(unknown)) {
        off = off.filter(f => f !== unknown)
        continue
      }
      if (r.code !== 0) return null
      const text = await readFile(out, 'utf8').catch(() => null)
      await rm(out, { force: true })

      return text
    }

    return null
  }
}

/** Applies the model's answer for the oldest pending exchange, and drops that exchange. */
export function applied(s: SessionState, reply: string | null, now: number, promptAt: number): SessionState {
  const next = s.pending[0]
  if (!next) return s
  const { ex } = next
  const parsed = reply === null ? null : parseReply(reply, [ex.reply, ...ex.activity].join('\n'))
  // An Explain turn talks about its item without deciding it.
  const explained = ex.press?.action === 'explain' ? ex.press.id : null
  const ledger = parsed
    ? applyUpdate(
        s.ledger,
        { ...parsed, closed: parsed.closed.filter(c => c.id !== explained) },
        now,
        ex.turn,
        promptAt,
      )
    : s.ledger

  return {
    ...s,
    ledger,
    pending: s.pending.slice(1),
    presence: {
      ...s.presence,
      ledgerState: parsed ? 'current' : 'failed',
      // A failed turn counts as summarized too: with no catch-up yet, a task
      // handed to Codex would otherwise stay folded for good.
      turnsApplied: Math.max(s.presence.turnsApplied, next.turnsStarted),
    },
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Takes the session's update lock, a folder holding the owner's pid; false when a live process holds it. */
async function takeUpdateLock(path: string): Promise<boolean> {
  for (let tries = 0; tries < 2; tries += 1) {
    try {
      await mkdir(path)
      await writeFile(join(path, 'pid'), String(process.pid))
      return true
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      const pid = Number(await readFile(join(path, 'pid'), 'utf8').catch(() => ''))
      // A lock with no pid yet was just taken.
      if (!pid || isAlive(pid)) return false
      await rm(path, { recursive: true, force: true })
    }
  }

  return false
}

/**
 * Runs the pending exchanges, oldest first, while this process holds the
 * update lock. An update started meanwhile finds the lock held and exits, so
 * the pending list is read again after the lock is released.
 */
export async function runUpdates(dir: string, sessionId: string, ask: Ask, now: () => number): Promise<void> {
  const lock = `${statePath(dir, sessionId)}.updating`
  while ((await readState(dir, sessionId)).pending.length > 0) {
    if (!(await takeUpdateLock(lock))) return
    try {
      for (;;) {
        const s = await updateState(dir, sessionId, x => ({
          ...x,
          presence: { ...x.presence, isUpdating: x.pending.length > 0 },
        }))
        const next = s.pending[0]
        if (!next) break
        const promptAt = now()
        const reply = await ask(buildPrompt(s.ledger, next.ex)).catch(() => null)
        await updateState(dir, sessionId, x =>
          // A cleared conversation dropped the exchange while the model ran.
          x.pending[0]?.turnsStarted === next.turnsStarted && x.pending[0].ex.turn === next.ex.turn
            ? applied(x, reply, now(), promptAt)
            : x,
        )
      }
    } finally {
      await updateState(dir, sessionId, x => ({ ...x, presence: { ...x.presence, isUpdating: false } }))
      await rm(lock, { recursive: true, force: true })
    }
  }
}
