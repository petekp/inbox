import type { Run } from './gh'
import { TIMED_OUT_CODE, UNSTARTABLE_CODE } from './gh'
import type { HerdrTarget } from './herdr'

const HERDR_APP_TIMEOUT_MS = 5000

/**
 * The terminal label that names the pane showing the Herdr look beside it. Herdr keeps a mod pane with its tab, so the
 * panel outlives the host that opened it, and every host in the terminal reads this label.
 */
const PANEL_LABEL = 'inbox.panel'

/** What `herdr-app do pane.focus` prints for a pane id the app no longer has. */
const NO_SUCH_PANE = 'no such pane'

type AppTerminal = Extract<HerdrTarget, { kind: 'terminal' }>

/**
 * What the host's open action did in a Herdr app terminal. `opened` split a new panel beside the terminal. `focused`
 * focused the panel the label or the last open named, and `shown` found that panel still there but could not focus it.
 * `unsure` ran a split that may have opened a panel without naming it.
 */
type HerdrOpen = { is: 'opened' | 'focused' | 'shown'; pane: string } | { is: 'not-opened' | 'unsure'; why: string }

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

/** A field of the JSON object a command printed, or null. */
function printed(r: Ran, field: string): unknown {
  try {
    return (JSON.parse(r.stdout) as Record<string, unknown> | null)?.[field] ?? null
  } catch {
    return null
  }
}

function printedText(r: Ran, field: string): string | null {
  const value = printed(r, field)

  return typeof value === 'string' && value ? value : null
}

/** Why a command failed, in one line: the `{ "error" }` it prints, else its stderr or exit code. */
function failure(r: Ran): string {
  if (r.code === TIMED_OUT_CODE) return `it did not answer within ${HERDR_APP_TIMEOUT_MS / 1000} s`
  const why = printedText(r, 'error') ?? (r.stderr.trim() || `exit ${r.code}`)

  return why.split('\n')[0]!.trim()
}

const runFor = (calls: HerdrOpenCalls, argv: string[]) => calls.run(argv, { cwd: '/', timeoutMs: HERDR_APP_TIMEOUT_MS })

/** Runs `args` with the first of `commands` that starts, or resolves null when none does. */
async function firstStarted(calls: HerdrOpenCalls, commands: readonly string[], args: string[]) {
  for (const command of commands) {
    const r = await runFor(calls, [command, ...args])
    if (r.code !== UNSTARTABLE_CODE) return { command, r }
  }

  return null
}

/** The pane the terminal's `inbox.panel` label names, read with `hc get --json`, or null. */
async function labelledPanel(calls: HerdrOpenCalls, target: AppTerminal): Promise<string | null> {
  const got = await firstStarted(calls, target.hc, ['get', target.terminal, '--json'])
  const labels = got?.r.code === 0 ? printed(got.r, 'labels') : null
  const pane = labels && typeof labels === 'object' ? (labels as Record<string, unknown>)[PANEL_LABEL] : null

  return typeof pane === 'string' && pane ? pane : null
}

/** Sets the terminal's `inbox.panel` label, or removes it when `pane` is empty. */
const labelPanel = (calls: HerdrOpenCalls, target: AppTerminal, pane: string) =>
  firstStarted(calls, target.hc, ['label', target.terminal, `${PANEL_LABEL}=${pane}`])

/** Whether the Herdr app home holds the inbox mod, which `pane.split` needs. */
export function hasHerdrMod(isFile: HerdrOpenCalls['isFile'], target: AppTerminal): Promise<boolean> {
  return target.appHome ? isFile(`${target.appHome}/mods/inbox/main.js`).catch(() => false) : Promise.resolve(false)
}

const noModWhy = (target: AppTerminal) =>
  `the Herdr app has no inbox mod in ${target.appHome ?? 'its settings folder'}/mods`

/**
 * Opens the Herdr look to the right of the host's app terminal, with `pane.split` and the `inbox` mod. When the
 * terminal's `inbox.panel` label, or else `remembered`, names a panel, it focuses that panel instead. A focus that
 * fails with `no such pane` means the panel is gone, so it splits. Any other failure leaves the panel as it is.
 */
async function openHerdrPanel(
  calls: HerdrOpenCalls,
  target: AppTerminal,
  remembered: string | null,
): Promise<HerdrOpen> {
  const notOpened = (why: string): HerdrOpen => ({ is: 'not-opened', why })
  if (!(await hasHerdrMod(calls.isFile, target))) return notOpened(noModWhy(target))
  const ls = await firstStarted(calls, target.herdrApp, ['ls'])
  if (!ls) return notOpened(`no herdr-app started. Tried ${target.herdrApp.join(', then ')}`)
  if (ls.r.code !== 0) return notOpened(`herdr-app ls failed: ${failure(ls.r)}`)
  const pane = paneOf(ls.r.stdout, target.terminal)
  if (!pane) return notOpened(`herdr-app ls lists no pane for terminal ${target.terminal}`)
  const doCommand = (command: string, args: Record<string, string>) =>
    runFor(calls, [ls.command, 'do', command, JSON.stringify(args)])
  const known = (await labelledPanel(calls, target)) ?? remembered
  if (known) {
    const focus = await doCommand('pane.focus', { pane: known })
    if (focus.code === 0) return { is: 'focused', pane: known }
    if (printedText(focus, 'error') !== NO_SUCH_PANE) return { is: 'shown', pane: known }
    await labelPanel(calls, target, '')
  }
  const split = await doCommand('pane.split', { direction: 'right', pane, mod: 'inbox' })
  const panel = split.code === 0 ? printedText(split, 'pane') : null
  if (panel) {
    await labelPanel(calls, target, panel)
    return { is: 'opened', pane: panel }
  }
  if (split.code === 0) return { is: 'unsure', why: 'it named no new pane' }
  if (split.code === TIMED_OUT_CODE) return { is: 'unsure', why: failure(split) }

  return notOpened(`Herdr did not split the pane: ${failure(split)}`)
}

/** The one line a host shows for what its open action did. */
function herdrOpenText(open: HerdrOpen): string {
  if (open.is === 'not-opened') return `Opened the inbox here, since ${open.why}.`
  if (open.is === 'unsure')
    return `Opened the inbox here. Herdr's split may also have opened it to the right of this terminal, but ${open.why}.`
  if (open.is === 'opened') return 'Opened the inbox in Herdr, to the right of this terminal.'

  return open.is === 'focused'
    ? 'The inbox is already open in Herdr. Focused it.'
    : 'The inbox is already open in Herdr, to the right of this terminal.'
}

/** The line a host shows when it opens its own inbox because the Herdr app home has no inbox mod. */
export const noHerdrModText = (target: AppTerminal) => herdrOpenText({ is: 'not-opened', why: noModWhy(target) })

/**
 * A host's open action in a Herdr app terminal. Each call opens the Herdr look to the right of the terminal, or
 * focuses the panel already there. It resolves with whether the panel shows, and the line that says what happened.
 * When the panel does not show, the host opens its own inbox and shows that line. A call made while another runs gets
 * that call's result, so two quick presses open one panel.
 */
export function herdrPanelOpener(): (calls: HerdrOpenCalls, target: AppTerminal) => Promise<HerdrOpened> {
  let remembered: string | null = null
  let pending: Promise<HerdrOpened> | null = null

  const open = async (calls: HerdrOpenCalls, target: AppTerminal): Promise<HerdrOpened> => {
    const opened = await openHerdrPanel(calls, target, remembered).catch((err: unknown): HerdrOpen => ({
      is: 'not-opened',
      why: err instanceof Error ? err.message : String(err),
    }))
    if ('pane' in opened) remembered = opened.pane

    return { isShown: 'pane' in opened, text: herdrOpenText(opened) }
  }

  return (calls, target) =>
    (pending ??= open(calls, target).finally(() => {
      pending = null
    }))
}
