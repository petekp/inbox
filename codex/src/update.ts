import { createHash, randomUUID } from 'node:crypto'
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'

import { screenText } from '../../hooks/model-text'
import {
  askOverConversation,
  reconcileUpdateStatus as reconcileStatus,
  runUpdates as runSessionUpdates,
} from '../../hooks/session-host'
import type { Ask } from '../../hooks/session-host'
import { isTabOpen, screenTabOf } from './core'
import { codexStore } from './host'
import { statePath, withLock } from './state'
import type { SessionState } from './state'
import { CODEX } from './texts'
import { readRollout } from './transcript'
import type { Run } from '../../hooks/gh'

/** The inbox model, at low reasoning effort. gpt-6-luna is faster but closed a finding the reply only mentioned. */
export const MODEL = 'gpt-6.1-sol'
const TIMEOUT_MS = 120_000
/** How long a results call waits for the earlier ones: a few calls at their longest. */
const RESULTS_WAIT_MS = 4 * TIMEOUT_MS

/** A release that drops one of these rejects it by name, so askModel drops any name rejected and tries again. */
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

/**
 * A Codex home for the inbox model that holds only a link to the person's `auth.json`. Codex reads the home's
 * `AGENTS.md` even with `--ignore-user-config` and `project_doc_max_bytes=0`, so the person's own instructions would
 * reach the inbox model. Codex's file store saves a refreshed sign-in by writing `auth.json` in place, which goes
 * through the link, so the call names that store: a keyring store keys by the home's path, and would save the refresh
 * where the person's own Codex never reads it. Null when the person has no `auth.json`, as with a keyring sign-in, or
 * when the link cannot be made: the model then runs in their own home.
 */
async function modelHome(dir: string, personHome: string): Promise<string | null> {
  const auth = join(personHome, 'auth.json')
  const hasSignInFile = await access(auth).then(
    () => true,
    () => false,
  )
  if (!hasSignInFile) return null
  const home = join(dir, 'model-home')
  const link = join(home, 'auth.json')
  try {
    await mkdir(home, { recursive: true })
    const isLinked = (await readlink(link).catch(() => null)) === auth
    if (isLinked) return home
    await keepNewerSignIn(link, auth)
    const made = `${link}.${randomUUID()}`
    await symlink(auth, made)
    await rename(made, link)

    return home
  } catch {
    return null
  }
}

/**
 * A Codex that saved a refresh by replacing the link with a file left the only fresh tokens there. Copies that file
 * over the person's `auth.json` when it is the newer, so relinking does not discard them.
 */
async function keepNewerSignIn(link: string, auth: string): Promise<void> {
  const saved = await lstat(link).catch(() => null)
  if (!saved?.isFile()) return
  const theirs = await stat(auth)
  if (saved.mtimeMs > theirs.mtimeMs) await copyFile(link, auth)
}

/** Null when it fails. `personHome` is the person's Codex home, which holds their sign-in. */
export function codexAsk(exec: Run, cli: string, dir: string, personHome: string): Ask {
  return async (prompt, instructions) => {
    const work = join(dir, 'exec')
    const system = join(dir, `inbox-system-${createHash('sha256').update(instructions).digest('hex').slice(0, 12)}.md`)
    const out = join(work, `reply-${randomUUID()}.txt`)
    await mkdir(work, { recursive: true })
    const home = await modelHome(dir, personHome)
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
          MODEL,
          '-c',
          'model_reasoning_effort="low"',
          '-c',
          `model_instructions_file=${JSON.stringify(system)}`,
          '-c',
          'project_doc_max_bytes=0',
          ...(home ? ['-c', 'cli_auth_credentials_store="file"'] : []),
          ...off.flatMap(f => ['--disable', f]),
          '-o',
          out,
          prompt,
        ],
        { cwd: work, timeoutMs: TIMEOUT_MS, env: home ? { CODEX_HOME: home } : {} },
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

export const reconcileUpdateStatus = (dir: string, sessionId: string): Promise<SessionState> =>
  reconcileStatus(codexStore(dir, sessionId, Date.now))

export const runUpdates = (dir: string, sessionId: string, ask: Ask, now: () => number): Promise<void> =>
  runSessionUpdates({
    ...codexStore(dir, sessionId, now),
    ask,
    names: CODEX,
    inOrder: fn => withLock(`${statePath(dir, sessionId)}.results`, fn, RESULTS_WAIT_MS),
    catchUp: async s =>
      askOverConversation(
        ask,
        CODEX,
        s,
        screenText(CODEX, isTabOpen(s, now()), screenTabOf(s)),
        (await readRollout(s.transcriptPath, s.root))?.conversation ?? null,
      ),
  })
