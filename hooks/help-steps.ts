import type { Help, Item } from '../types'
import { baseName } from './open-targets'
import { messages } from './press-messages'
import type { Effect } from './press-reducer'
import { namedPrs, parseRef } from './prs'
import { clipLabel } from './text'

function helpLabel(help: Help): string {
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

export type HelpStep = { label: string; step: Help[] }

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

type TrackedPr = { ref: string; url: string | null }

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

export function stepsOf(item: Item, extraSteps: HelpStep[]): HelpStep[] {
  return [...steps(item.helps), ...extraSteps]
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
