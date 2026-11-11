import type { Feedback } from '../../hooks/feedback'
import type { Run } from '../../hooks/gh'
import { openTarget } from '../../hooks/open-targets'
import type { PathProbe } from '../../hooks/open-targets'
import type { Effect } from '../../hooks/press-reducer'
import { pendingResult } from '../../hooks/pressed'

type HereEffect = Extract<Effect, { kind: 'open' | 'copy' }>

/**
 * Whether the look opens a target itself: a link, or a path from the root or home. A path relative to the project
 * goes to the host, since the published session does not say where the project is.
 */
const isOpenedHere = (target: string) =>
  /^https?:\/\//.test(target) || target.startsWith('/') || target.startsWith('~/')

/** Whether the look runs a press's effects itself: it has some, and each is a copy or an open it can do. */
export function isRunHere(effects: readonly Effect[]): effects is HereEffect[] {
  return effects.length > 0 && effects.every(e => e.kind === 'copy' || (e.kind === 'open' && isOpenedHere(e.target)))
}

/** What a press's row reads while its opens, copies or refreshes run, or null for one that only sends. */
export function pendingOf(effects: readonly Effect[], at: number): Feedback | null {
  return effects.length > 0 ? { is: 'local', result: pendingResult([...effects], at) } : null
}

/** What the look runs effects with: Herdr's programs, its file checks, the home folder, and the clipboard. */
export type HereIo = { run: Run; probe: PathProbe; home: string; copy: (text: string) => void }

/** Runs a press's opens and copies in order. Returns why one could not run, or null when all did. */
export async function runHere(effects: readonly HereEffect[], io: HereIo): Promise<string | null> {
  for (const e of effects) {
    if (e.kind === 'copy') {
      io.copy(e.text)
      continue
    }
    const error = await openTarget(io.run, io.probe, e.target, '/', io.home)
    if (error) return error
  }

  return null
}
