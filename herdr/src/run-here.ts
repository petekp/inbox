import type { Feedback } from '../../hooks/feedback'
import type { Run } from '../../hooks/gh'
import { openTarget } from '../../hooks/open-targets'
import type { PathProbe } from '../../hooks/open-targets'
import type { Effect } from '../../hooks/press-reducer'
import { pendingResult } from '../../hooks/pressed'
import type { LocalResult } from '../../types'

/** An open or a copy, the effects the look can run itself. */
export type HereEffect = Extract<Effect, { kind: 'open' | 'copy' }>

/**
 * Whether the look opens a target itself: a link, a path from the root or home, or a relative path when the session
 * names its project folder. Without one, a relative path goes to the host.
 */
const isOpenedHere = (target: string, projectFolder: string | null) =>
  /^https?:\/\//.test(target) || target.startsWith('/') || target.startsWith('~/') || projectFolder !== null

/** Whether the look runs a press's effects itself: it has some, and each is a copy or an open it can do. */
export function isRunHere(effects: readonly Effect[], projectFolder: string | null): effects is HereEffect[] {
  return (
    effects.length > 0 &&
    effects.every(e => e.kind === 'copy' || (e.kind === 'open' && isOpenedHere(e.target, projectFolder)))
  )
}

/** What a press's row reads while its opens, copies or refreshes run, or null for one that only sends. */
export function pendingOf(effects: readonly Effect[], at: number): Feedback | null {
  return effects.length > 0 ? { is: 'local', result: pendingResult([...effects], at) } : null
}

/**
 * What the look runs effects with: Herdr's programs, its file checks, the home folder, the folder relative paths open
 * against, and the clipboard.
 */
export type HereIo = {
  run: Run
  probe: PathProbe
  home: string
  projectFolder: string | null
  copy: (text: string) => void
}

/**
 * Runs a press's opens and copies in order, and gives the finished result the row draws, from the `pending` result the
 * row read while they ran. Each part's `error` says why it could not run. The first failure stops the rest.
 */
export async function runHere(effects: readonly HereEffect[], pending: LocalResult, io: HereIo): Promise<LocalResult> {
  const parts = pending.parts.map(p => ({ ...p }))
  for (const [i, e] of effects.entries()) {
    if (e.kind === 'copy') {
      io.copy(e.text)
      continue
    }
    const error = await openTarget(io.run, io.probe, e.target, io.projectFolder ?? '/', io.home)
    if (error === null) continue
    parts[i] = { ...parts[i]!, error }
    return { ...pending, state: 'failed', parts: parts.slice(0, i + 1) }
  }

  return { ...pending, state: 'done', parts }
}

/** The first reason a finished result gives, which the press file carries for the host, or null when all ran. */
export const firstError = (r: LocalResult): string | null => r.parts.find(p => p.error !== null)?.error ?? null
