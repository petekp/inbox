import { createHash, randomUUID } from 'node:crypto'
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  rmdir,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { screenText } from '../../hooks/model-text'
import {
  askOverConversation,
  orderedKeys,
  reconcileUpdateStatus as reconcileStatus,
  refreshOverview as refreshSessionOverview,
  runUpdates as runSessionUpdates,
} from '../../hooks/session-host'
import type { Ask, OverviewRecords, RecordFiles } from '../../hooks/session-host'
import { screenTabOf } from '../../hooks/view'
import { isTabOpen } from './core'
import { codexStore } from './host'
import type { OnWrite } from './host'
import { statePath, updateState, withLock } from './state'
import type { ModelFailure, SessionState } from './state'
import { CODEX } from './texts'
import { readRollout } from './transcript'
import type { RunWithInput } from './run'

/** The inbox model, at low reasoning effort. gpt-6-luna is faster but closed a finding the reply only mentioned. */
export const MODEL = 'gpt-6.1-sol'
const TIMEOUT_MS = 120_000
/** How long a results call waits for the earlier ones: a few calls at their longest. */
const RESULTS_WAIT_MS = 4 * TIMEOUT_MS
/** Keeps one process's results calls in the order they arrived. The file lock orders them across processes. */
const resultsOrder = orderedKeys()

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

/** How much of a failed call's stderr is kept: its end, where codex prints the error. */
const FAILURE_TAIL_CHARS = 2000

/**
 * Null when it fails, after passing the failure to `onFailure`. `personHome` is the person's Codex home, which holds
 * their sign-in.
 */
export function codexAsk(
  exec: RunWithInput,
  cli: string,
  dir: string,
  personHome: string,
  onFailure: (failure: Omit<ModelFailure, 'at'>) => Promise<void> = async () => {},
): Ask {
  return async (prompt, instructions, report) => {
    const work = join(dir, 'exec')
    const system = join(dir, `inbox-system-${createHash('sha256').update(instructions).digest('hex').slice(0, 12)}.md`)
    const out = join(work, `reply-${randomUUID()}.txt`)
    await mkdir(work, { recursive: true })
    const home = await modelHome(dir, personHome)
    if ((await readFile(system, 'utf8').catch(() => '')) !== instructions) await writeFile(system, instructions)
    let off = [...OFF]
    for (let tries = 0; tries <= OFF.length; tries += 1) {
      await rm(out, { force: true })
      // `-` reads the prompt from stdin. No argument can hold a NUL byte, and the conversation in a prompt can.
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
          '-',
        ],
        { cwd: work, timeoutMs: TIMEOUT_MS, env: home ? { CODEX_HOME: home } : {}, input: prompt },
      )
      const unknown = r.stderr.match(/Unknown feature flag: (\S+)/)?.[1]
      if (r.code !== 0 && unknown && off.includes(unknown)) {
        off = off.filter(f => f !== unknown)
        continue
      }
      const text = r.code === 0 ? await readFile(out, 'utf8').catch(() => null) : null
      await rm(out, { force: true })
      const stderr = r.stderr.slice(-FAILURE_TAIL_CHARS)
      report?.({ model: MODEL, ...(text === null ? { error: `codex exec exited ${r.code}: ${stderr.trim()}` } : {}) })
      if (text === null) await onFailure({ cli, code: r.code, stderr })

      return text
    }
    report?.({ model: MODEL, error: 'codex exec refused every feature flag the inbox turns off' })

    return null
  }
}

/** Saves a failed call as the session's `lastModelFailure`. */
export const recordModelFailure =
  (dir: string, sessionId: string, now: () => number) =>
  async (failure: Omit<ModelFailure, 'at'>): Promise<void> => {
    await updateState(dir, sessionId, s => ({ ...s, lastModelFailure: { ...failure, at: now() } }))
  }

export const reconcileUpdateStatus = (dir: string, sessionId: string): Promise<SessionState> =>
  reconcileStatus(codexStore(dir, sessionId, Date.now))

/** Runs `fn` once the session's earlier Overview calls have finished, in this process and in any other. */
const inOrderFor =
  (dir: string, sessionId: string) =>
  <T>(fn: () => Promise<T>): Promise<T> =>
    resultsOrder.run(statePath(dir, sessionId), () =>
      withLock(`${statePath(dir, sessionId)}.results`, fn, RESULTS_WAIT_MS),
    )

const recordFiles: RecordFiles = {
  write: async (path, text) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text)
  },
  list: folder => readdir(folder).catch(() => []),
  removeFiles: async paths => void (await Promise.all(paths.map(p => rm(p, { force: true })))),
  removeFolder: path => rmdir(path),
}

/** A next build's Overview call records for the session, in the plugin's data folder. */
export const overviewRecords = (dir: string, sessionId: string): OverviewRecords => ({
  host: 'codex',
  folder: join(dir, 'overview-calls'),
  session: sessionId,
  files: recordFiles,
})

/** Runs the Overview call that a hook claimed for the running turn. */
export const refreshOverview = (
  dir: string,
  sessionId: string,
  ask: Ask,
  now: () => number,
  onWrite?: OnWrite,
  records?: OverviewRecords,
): Promise<void> =>
  refreshSessionOverview({
    ...codexStore(dir, sessionId, now, onWrite),
    ask,
    inOrder: inOrderFor(dir, sessionId),
    records,
  })

export const runUpdates = (
  dir: string,
  sessionId: string,
  ask: Ask,
  now: () => number,
  onWrite?: OnWrite,
  records?: OverviewRecords,
): Promise<void> =>
  runSessionUpdates({
    ...codexStore(dir, sessionId, now, onWrite),
    ask,
    names: CODEX,
    inOrder: inOrderFor(dir, sessionId),
    records,
    catchUp: async s =>
      askOverConversation(
        ask,
        CODEX,
        s,
        screenText(CODEX, isTabOpen(s, now()), screenTabOf(s.shownTab)),
        (await readRollout(s.transcriptPath, s.root))?.conversation ?? null,
      ),
  })
