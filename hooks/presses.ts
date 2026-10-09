// What the person's presses send and how their buttons are labeled, the same
// in every host: each message goes to the agent as the person's own words.

import type { Finding, Help, Item, LastAction } from '../types'
import { namedPrs, parseRef } from './prs'

export function clipLabel(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function baseName(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path
}

export function helpLabel(help: Help): string {
  const label =
    help.kind === 'open'
      ? `Open ${baseName(help.path)}`
      : help.kind === 'copy'
        ? `Copy ${help.name ?? 'snippet'}`
        : help.kind === 'run'
          ? `Run ${help.name ?? help.command}`
          : help.kind === 'terminal'
            ? `Copy ${help.name ?? help.command}`
            : `Open ${help.name ?? new URL(help.url).host}`

  return clipLabel(label, 32)
}

/** A path an item names, made absolute: `~/` from the home folder, a relative one from the session's folder. */
export function localPath(raw: string, root: string, home: string): string {
  if (raw.startsWith('~/')) return home + raw.slice(1)
  if (raw.startsWith('/')) return raw

  return `${root.replace(/\/$/, '')}/${raw.replace(/^\.\//, '')}`
}

// Files macOS `open` would run or install instead of showing.
const LAUNCHES =
  /\.(app|command|tool|terminal|workflow|scpt|scptd|applescript|pkg|mpkg|dmg|webloc|inetloc|fileloc|prefpane|kext)$/i

/**
 * The commands that open a local path. A folder, an executable, or anything
 * `open` would launch is shown in Finder instead. A file opens in the app
 * macOS assigns to its type, and `fallback` opens one with no assigned app
 * in the default text editor.
 */
export function openCommands(
  path: string,
  isFile: boolean,
  isExecutable: boolean,
): { argv: string[]; fallback: string[] | null } {
  if (!isFile || isExecutable || LAUNCHES.test(path)) return { argv: ['open', '-R', path], fallback: null }

  return { argv: ['open', path], fallback: ['open', '-t', path] }
}

/** One button's helps, used in order by one press. */
export type HelpStep = { label: string; step: Help[] }

/**
 * The item's helps as buttons. A snippet to copy and a file to open become one
 * step, "Copy env line and open .env.local", since the snippet goes in that file.
 */
export function steps(helps: Help[]): HelpStep[] {
  const copy = helps.find(h => h.kind === 'copy')
  const open = helps.find(h => h.kind === 'open')
  if (!copy || !open || copy.kind !== 'copy' || open.kind !== 'open')
    return helps.map(h => ({ label: helpLabel(h), step: [h] }))

  return helps
    .filter(h => h !== copy)
    .map(h =>
      h === open
        ? { label: clipLabel(`Copy ${copy.name ?? 'snippet'} and open ${baseName(open.path)}`, 48), step: [copy, open] }
        : { label: helpLabel(h), step: [h] },
    )
}

/** A PR the session tracks, which an item's ask can name as "#123". */
export type TrackedPr = { ref: string; url: string | null }

/**
 * One step that opens the tracked PRs an item's ask names as "#123", as in
 * "Mark #12 ready for review". The reply that raised the item often names a PR
 * only by number, so the item has no link of its own. Several PRs share one
 * step, so a task naming five does not take five keys.
 */
export function prSteps(item: Item, tracked: TrackedPr[]): HelpStep[] {
  const urls = new Map(tracked.map(pr => [pr.ref, pr.url]))
  const links = namedPrs(item.ask, [...urls.keys()])
    .map(ref => {
      const { repo, number } = parseRef(ref)
      const url = urls.get(ref) ?? `https://github.com/${repo}/pull/${number}`
      return { kind: 'link' as const, url, name: `PR #${number}` }
    })
    .filter(l => !item.helps.some(h => h.kind === 'link' && h.url === l.url))

  return links.length === 0
    ? []
    : [{ label: links.length === 1 ? helpLabel(links[0]!) : `Open ${links.length} PRs`, step: links }]
}

/** An item's steps: its own helps, then the steps a host adds, such as `prSteps`. */
export function stepsOf(item: Item, extraSteps: HelpStep[]): HelpStep[] {
  return [...steps(item.helps), ...extraSteps]
}

/**
 * A task or finding handed to the agent waits on the agent until the update
 * for a turn started after the press has applied. Still open then, the agent's
 * reply did not finish it, so it waits on the person again. Counts lower than
 * at the press were reset, so the row no longer folds.
 */
export function isHandedOff(
  last: Pick<LastAction, 'kind' | 'turnsStarted'> | undefined,
  turns: { turnsStarted: number; turnsApplied: number },
): boolean {
  const pressed = last?.kind === 'handoff' ? last.turnsStarted : undefined

  return pressed !== undefined && pressed <= turns.turnsStarted && turns.turnsApplied <= pressed
}

/** A press on a question, task or finding row, in every host. An answer names its option by text. */
export type RowPress =
  | { action: 'answer'; id: string; option: string }
  | { action: 'type'; id: string; text: string }
  | { action: 'explain' | 'done' | 'dismiss' | 'address' | 'discuss' | 'undo'; id: string }
  | { action: 'step'; id: string; step: number; label: string }

/** The action ids of the mod's PR presses: on a review thread, on a PR block, and a check's Open log. */
export type PrActionId =
  | 'thread-address'
  | 'thread-draft'
  | 'thread-open'
  | 'thread-discuss'
  | 'pr-conflicts'
  | 'pr-address-all'
  | 'pr-open'
  | 'pr-dismiss'
  | 'log'

/** The id a press's last action stores, the same in every host: `explain`, `step-2`, `thread-address`. */
export function actionId(p: RowPress | { action: PrActionId }): string {
  return p.action === 'step' ? `step-${p.step}` : p.action
}

/** What a row reads after a ✓ once this press went through: "Explain", "Reply", or the step's own label. */
export function pressText(p: RowPress): string {
  switch (p.action) {
    case 'answer':
      return p.option
    case 'type':
      return 'Reply'
    case 'step':
      return p.label
    default:
      return capitalized(p.action)
  }
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Old stored actions that hand work off, for a last action saved before it said so. */
const HANDOFF_IDS = /^(address|type|step-\d+|thread-address|pr-conflicts|pr-address-all)$/

/**
 * A last action saved by an earlier build in today's shape, or null when its
 * action no longer records one. The row's key says which table its old action
 * is read with, since `address-` and `discuss-` named both finding and thread actions.
 */
function upgradedLastAction(key: string, old: Omit<LastAction, 'kind'> & { isHandoff?: boolean }): LastAction | null {
  const a = old.action
  const action = key.startsWith('pr:')
    ? a.startsWith('address-all-')
      ? 'pr-address-all'
      : a.startsWith('resolve-')
        ? 'pr-conflicts'
        : null
    : key.includes(' thread ')
      ? a.startsWith('address-')
        ? 'thread-address'
        : a.startsWith('draft-')
          ? 'thread-draft'
          : a.startsWith('discuss-')
            ? 'thread-discuss'
            : null
      : /^explain(-|$)/.test(a)
        ? 'explain'
        : /^(help-.+-|step-)\d+$/.test(a)
          ? `step-${a.split('-').pop()}`
          : a === 'typed'
            ? 'type'
            : /^address(-|$)/.test(a)
              ? 'address'
              : /^discuss(-|$)/.test(a)
                ? 'discuss'
                : null
  if (action === null) return null
  const { isHandoff, ...kept } = old
  const isHandedOff = isHandoff ?? HANDOFF_IDS.test(action)

  return {
    ...kept,
    kind: isHandedOff ? 'handoff' : 'talk',
    action,
    // Earlier builds saved "Explain sent" or "Sent to Claude to fix"; a last action is now the label pressed.
    text: /^Sent to (Claude|Codex) to /.test(old.text) ? 'Address' : old.text.replace(/ sent$/, ''),
  }
}

/**
 * Converts the last actions an earlier build saved, which have no `kind`, and
 * drops those whose action records nothing now. One that has a `kind` stays as
 * it is, so converting twice changes nothing.
 */
export function upgradeLastActions(saved: Record<string, LastAction>): Record<string, LastAction> {
  return Object.fromEntries(
    Object.entries(saved).flatMap(([key, last]) => {
      if ('kind' in last && last.kind) return [[key, last]]
      const upgraded = upgradedLastAction(key, last)
      return upgraded ? [[key, upgraded]] : []
    }),
  )
}

/** A finding as the agent reads it back: its kind and title, its detail, and its file. */
function findingBody(finding: Finding): string[] {
  return [
    `${finding.kind === 'issue' ? 'Issue' : 'Opportunity'}: ${finding.title}`,
    finding.detail,
    ...(finding.path ? [`File: ${finding.path}`] : []),
  ]
}

/** The message each press sends. */
export const messages = {
  answer: (item: Item, answer: string) => `Re "${item.ask}": ${answer}`,
  /** Asks what an item is about. The item stays open, since nothing was decided. */
  explain: (item: Item) => {
    const what = item.kind === 'task' ? 'this task you left for me' : 'this question you asked me'
    const options = item.options.length > 0 ? `\nOptions: ${item.options.join(' / ')}` : ''

    return `Remind me what ${what} is about: why it came up, and what each choice would mean. Don't act on it yet.\n"${item.ask}"${options}`
  },
  run: (item: Item, command: string) => `For "${item.ask}", run this:\n\`\`\`\n${command}\n\`\`\``,
  taskReply: (item: Item, words: string) => `Re the task you left for me, "${item.ask}": ${words}`,
  /** Sends a finding back to the agent: to fix it, to talk it through first, or with the person's own words. */
  finding: (finding: Finding, how: 'address' | 'discuss' | 'typed', words = '') => {
    const opening =
      how === 'address'
        ? 'Please address this finding you recorded:'
        : how === 'discuss'
          ? "Let's talk through this finding you recorded before changing anything:"
          : 'About this finding you recorded:'

    return [opening, ...findingBody(finding), ...(how === 'typed' ? ['', words] : [])].join('\n')
  },
}
