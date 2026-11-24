import type { Help, Item } from '../../types'
import { baseName } from './open-targets'
import { messages } from './press-messages'
import type { Effect } from '../view/press-reducer'
import { namedPrs, parseRef, prRefs } from './prs'
import { clipLabel } from './text'

/**
 * A command can be any length, and its button copies or runs all of it, so a step with no name shows the command's start:
 * three lines of a button in a 300 px Codex tab.
 */
const COMMAND_LABEL_CHARS = 64

const commandLabel = (command: string) => clipLabel(command, COMMAND_LABEL_CHARS)

function helpLabel(help: Help): string {
  return help.kind === 'open'
    ? `Open ${baseName(help.path)}`
    : help.kind === 'copy'
      ? `Copy ${help.name ?? 'snippet'}`
      : help.kind === 'run'
        ? `Run ${help.name ?? commandLabel(help.command)}`
        : help.kind === 'terminal'
          ? `Copy ${help.name ?? commandLabel(help.command)}`
          : `Open ${help.name ?? new URL(help.url).host}`
}

export type HelpStep = { label: string; step: Help[] }

type TrackedPr = { ref: string; url: string | null }

/** The PRs the session tracks, each with its address once a fetch read it, and the session's repository. */
export type SessionPrs = { tracked: TrackedPr[]; repo: string | null }

export const NO_SESSION_PRS: SessionPrs = { tracked: [], repo: null }

function steps(helps: Help[]): HelpStep[] {
  const copy = helps.find(h => h.kind === 'copy')
  const open = helps.find(h => h.kind === 'open')
  if (!copy || !open || copy.kind !== 'copy' || open.kind !== 'open')
    return helps.map(h => ({ label: helpLabel(h), step: [h] }))

  return helps
    .filter(h => h !== copy)
    .map(h =>
      h === open
        ? { label: `Copy ${copy.name ?? 'snippet'} and open ${baseName(open.path)}`, step: [copy, open] }
        : { label: helpLabel(h), step: [h] },
    )
}

/**
 * The name a PR link takes on its button. A PR the session tracks is "PR #12". One it does not track may be an issue,
 * since GitHub sends a pull link of an issue's number to the issue, so it is "#12", or "repo#12" outside `repo`.
 */
function prLinkName(ref: string, isTracked: boolean, repo: string | null): string {
  const { repo: refRepo, name, number } = parseRef(ref)

  const isSessionRepo = refRepo.toLowerCase() === repo?.toLowerCase()

  return isTracked ? `PR #${number}` : isSessionRepo ? `#${number}` : `${name}#${number}`
}

const GITHUB_PR_OR_ISSUE_URL = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(pull|issues)\/(\d+)(?:[/?#]|$)/

/** A link with no name to a GitHub PR or issue, named as its Open PR step would name it, so its button says which. */
function withPrName(help: Help, { tracked, repo }: SessionPrs): Help {
  if (help.kind !== 'link' || help.name) return help
  const m = help.url.match(GITHUB_PR_OR_ISSUE_URL)
  if (!m) return help
  const [, refRepo, path, number] = m
  const ref = `${refRepo}#${number}`
  const isTracked = path === 'pull' && tracked.some(pr => pr.ref.toLowerCase() === ref.toLowerCase())

  return { ...help, name: prLinkName(ref, isTracked, repo) }
}

/**
 * One step that opens each PR the item's ask or context names, by `namedPrs`, that none of its steps links already.
 * The session's repository is for a PR named by its number alone.
 */
function prSteps(item: Item, { tracked, repo }: SessionPrs): HelpStep[] {
  const urls = new Map(tracked.map(pr => [pr.ref, pr.url]))
  const isLinked = (ref: string, url: string) =>
    item.helps.some(
      h => h.kind === 'link' && (h.url === url || prRefs(h.url).some(r => r.toLowerCase() === ref.toLowerCase())),
    )
  const named = namedPrs([item.ask, item.context ?? ''].join('\n'), [...urls.keys()], repo).flatMap(ref => {
    const { repo: refRepo, number } = parseRef(ref)
    const url = urls.get(ref) ?? `https://github.com/${refRepo}/pull/${number}`
    return isLinked(ref, url) ? [] : [{ ref, url }]
  })
  const links = named.map(({ ref, url }) => ({
    kind: 'link' as const,
    url,
    name: prLinkName(ref, urls.has(ref), repo),
  }))
  const [only] = links
  if (!only) return []
  const isAllTracked = named.every(({ ref }) => urls.has(ref))
  const label =
    links.length === 1
      ? helpLabel(only)
      : isAllTracked
        ? `Open ${links.length} PRs`
        : clipLabel(`Open ${links.map(l => l.name).join(', ')}`, COMMAND_LABEL_CHARS)

  return [{ label, step: links }]
}

export function stepsOf(item: Item, prs: SessionPrs): HelpStep[] {
  return [...steps(item.helps.map(h => withPrName(h, prs))), ...prSteps(item, prs)]
}

export function stepIconKind(step: HelpStep | undefined): 'run' | 'copy' | 'open' | undefined {
  if (!step) return undefined
  if (step.step.some(h => h.kind === 'run')) return 'run'
  const first = step.step[0]?.kind
  return first === 'copy' || first === 'terminal' ? 'copy' : first === 'open' || first === 'link' ? 'open' : undefined
}

function helpEffect(item: Item, help: Help): Effect {
  switch (help.kind) {
    case 'run':
      return { kind: 'send', text: messages.run(item, help.command), by: { id: item.id, action: 'run' } }
    case 'open':
      return { kind: 'open', target: help.path, name: baseName(help.path) }
    case 'link':
      return { kind: 'open', target: help.url, name: help.name ?? help.url }
    case 'copy':
      return { kind: 'copy', text: help.text, name: help.name ?? 'snippet', isCommand: false }
    case 'terminal':
      return { kind: 'copy', text: help.command, name: help.name ?? clipLabel(help.command, 32), isCommand: true }
  }
}

export function stepEffects(item: Item, step: HelpStep): Effect[] {
  return step.step.map(h => helpEffect(item, h))
}
