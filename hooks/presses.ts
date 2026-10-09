// What the person's presses send and how their buttons are labeled, the same
// in every host: each message goes to the agent as the person's own words.

import type { Finding, Help, Item } from '../types'

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

/**
 * A task handed to the agent waits on the agent until the update for a turn
 * started after the press has applied. Still open then, the agent's reply did
 * not finish it, so it waits on the person again. Counts lower than at the
 * press were reset, so the task no longer folds.
 */
export function isTaskHandedOff(
  last: { isHandoff?: boolean; turnsStarted?: number } | undefined,
  turns: { turnsStarted: number; turnsApplied: number },
): boolean {
  const pressed = last?.isHandoff === true ? last.turnsStarted : undefined

  return pressed !== undefined && pressed <= turns.turnsStarted && turns.turnsApplied <= pressed
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
