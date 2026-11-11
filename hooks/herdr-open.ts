import type { Run } from './gh'
import { UNSTARTABLE_CODE } from './gh'
import type { HerdrTarget } from './herdr'

const HERDR_APP_TIMEOUT_MS = 5000

type AppTerminal = Extract<HerdrTarget, { kind: 'terminal' }>

/**
 * What the host's open action did in a Herdr app terminal. `opened` split a new panel beside the terminal, and
 * `focused` found the panel this host opened before still there. Both name the panel's pane.
 */
type HerdrOpen = { is: 'opened' | 'focused'; pane: string } | { is: 'not-opened'; why: string }

/**
 * What opening the panel needs from its host. `isFile` says whether a path names a file, following links, and writes
 * nothing, since a person's `mods/inbox` can be a link to a build they keep elsewhere.
 */
type HerdrOpenCalls = { run: Run; isFile: (path: string) => Promise<boolean> }

export type HerdrOpened = { isShown: boolean; text: string }

type Ran = Awaited<ReturnType<Run>>

/** The terminal's pane in `herdr-app ls`, which lists each space's tabs and their terminals. Remote spaces name a machine. */
function paneOf(ls: string, terminal: string): string | null {
  const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])
  try {
    const spaces = list<{ machine?: unknown; tabs?: unknown }>((JSON.parse(ls) as { spaces?: unknown })?.spaces)
    const rows = spaces
      .filter(space => space?.machine == null)
      .flatMap(space => list<{ terminals?: unknown }>(space.tabs))
      .flatMap(tab => list<{ terminal?: unknown; pane?: unknown }>(tab?.terminals))
    const pane = rows.find(row => row?.terminal === terminal)?.pane

    return typeof pane === 'string' && pane ? pane : null
  } catch {
    return null
  }
}

/** A string field of the JSON object `herdr-app` printed, or null. */
function printed(r: Ran, field: 'pane' | 'error'): string | null {
  try {
    const value = (JSON.parse(r.stdout) as Record<string, unknown> | null)?.[field]

    return typeof value === 'string' && value ? value : null
  } catch {
    return null
  }
}

/** Why a `herdr-app` command failed: the `{ "error" }` it prints, else its stderr or exit code. */
const failure = (r: Ran) => printed(r, 'error') ?? (r.stderr.trim() || `exit ${r.code}`)

/**
 * Opens the Herdr look to the right of the host's app terminal, with `pane.split` and the `inbox` mod. When
 * `shownPane`, the panel this host opened last, still answers `pane.focus`, it focuses that panel instead of opening a
 * second. `herdr-app ls` lists only terminals, so a panel another host opened in the tab is not found.
 */
async function openHerdrPanel(
  calls: HerdrOpenCalls,
  target: AppTerminal,
  shownPane: string | null,
): Promise<HerdrOpen> {
  const notOpened = (why: string): HerdrOpen => ({ is: 'not-opened', why })
  if (!target.appHome || !(await calls.isFile(`${target.appHome}/mods/inbox/main.js`).catch(() => false)))
    return notOpened(`the Herdr app has no inbox mod in ${target.appHome ?? 'its settings folder'}/mods`)
  let herdrApp: string | null = null
  let ls: Ran | null = null
  for (const command of target.herdrApp) {
    ls = await calls.run([command, 'ls'], { cwd: '/', timeoutMs: HERDR_APP_TIMEOUT_MS })
    if (ls.code === UNSTARTABLE_CODE) continue
    herdrApp = command
    break
  }
  if (!herdrApp || !ls) return notOpened(`no herdr-app started. Tried ${target.herdrApp.join(', then ')}`)
  if (ls.code !== 0) return notOpened(`herdr-app ls failed: ${failure(ls)}`)
  const pane = paneOf(ls.stdout, target.terminal)
  if (!pane) return notOpened(`herdr-app ls lists no pane for terminal ${target.terminal}`)
  const doCommand = (command: string, args: Record<string, string>) =>
    calls.run([herdrApp, 'do', command, JSON.stringify(args)], { cwd: '/', timeoutMs: HERDR_APP_TIMEOUT_MS })
  if (shownPane && (await doCommand('pane.focus', { pane: shownPane })).code === 0)
    return { is: 'focused', pane: shownPane }
  const split = await doCommand('pane.split', { direction: 'right', pane, mod: 'inbox' })
  const panel = split.code === 0 ? printed(split, 'pane') : null
  if (panel) return { is: 'opened', pane: panel }

  return notOpened(`Herdr did not split the pane: ${split.code === 0 ? 'it named no new pane' : failure(split)}`)
}

/** The one line a host shows for what its open action did. */
function herdrOpenText(open: HerdrOpen): string {
  if (open.is === 'not-opened') return `Opened the inbox here, since ${open.why}.`

  return open.is === 'opened'
    ? 'Opened the inbox in Herdr, to the right of this terminal.'
    : 'The inbox is already open in Herdr. Focused it.'
}

/**
 * A host's open action in a Herdr app terminal. Each call opens the Herdr look to the right of the terminal, or
 * focuses the panel the last call opened while it is still there. It resolves with whether the panel shows, and the
 * line that says what happened. When the panel does not show, the host opens its own inbox and shows that line.
 */
export function herdrPanelOpener(): (calls: HerdrOpenCalls, target: AppTerminal) => Promise<HerdrOpened> {
  let shownPane: string | null = null

  return async (calls, target) => {
    const open = await openHerdrPanel(calls, target, shownPane).catch((err: unknown): HerdrOpen => ({
      is: 'not-opened',
      why: err instanceof Error ? err.message : String(err),
    }))
    if (open.is !== 'not-opened') shownPane = open.pane

    return { isShown: open.is !== 'not-opened', text: herdrOpenText(open) }
  }
}
