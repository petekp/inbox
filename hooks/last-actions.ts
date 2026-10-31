import type { LastAction, Turns } from '../types'

export function isAwaitingReply(
  last: Pick<LastAction, 'turnsStarted' | 'delivery'> | undefined,
  turns: Turns,
): boolean {
  const pressed = last?.delivery?.state !== 'failed' ? last?.turnsStarted : undefined

  return pressed !== undefined && pressed <= turns.turnsStarted && turns.turnsApplied <= pressed
}

export function isHandedOff(
  last: Pick<LastAction, 'kind' | 'turnsStarted' | 'delivery'> | undefined,
  turns: Turns,
): boolean {
  return last?.kind === 'handoff' && isAwaitingReply(last, turns)
}

export function isFoldingPress(id: string, last: Pick<LastAction, 'kind' | 'action'> | undefined): boolean {
  return !id.startsWith('pr:') && last?.kind === 'handoff' && last.action !== 'address'
}

export function isFixSent(last: LastAction | undefined): last is LastAction {
  return last?.action === 'address' && !last.isKept && last.delivery?.state !== 'failed'
}

/** Old stored actions that hand work off, for a last action saved before it said so. */
const HANDOFF_IDS = /^(address|type|step-\d+|thread-address|pr-conflicts|pr-address-all)$/

type Rename = [RegExp, string | ((old: string) => string)]

const PR_RENAMES: Rename[] = [
  [/^address-all-/, 'pr-address-all'],
  [/^resolve-/, 'pr-conflicts'],
]

const THREAD_RENAMES: Rename[] = [
  [/^address-/, 'thread-address'],
  [/^draft-/, 'thread-draft'],
  [/^discuss-/, 'thread-discuss'],
]

const ROW_RENAMES: Rename[] = [
  [/^explain(-|$)/, 'explain'],
  [/^(help-.+-|step-)\d+$/, old => `step-${old.split('-').pop()}`],
  [/^typed$/, 'type'],
  [/^address(-|$)/, 'address'],
  [/^discuss(-|$)/, 'discuss'],
]

/**
 * A last action saved by an earlier build in today's shape, or null when its
 * action no longer records one. The row's key says which table its old action
 * is read with, since `address-` and `discuss-` named both finding and thread actions.
 */
function upgradedLastAction(key: string, old: Omit<LastAction, 'kind'> & { isHandoff?: boolean }): LastAction | null {
  const renames = key.startsWith('pr:') ? PR_RENAMES : key.includes(' thread ') ? THREAD_RENAMES : ROW_RENAMES
  const found = renames.find(([pattern]) => pattern.test(old.action))
  const action = found ? (typeof found[1] === 'function' ? found[1](old.action) : found[1]) : null
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
    Object.entries(saved).flatMap(([key, entry]) => {
      // Earlier builds kept where a removed row stood, and its title, so it showed in place. Nothing reads them now.
      const {
        tab: _tab,
        title: _title,
        index: _index,
        ...last
      } = entry as LastAction & Partial<Record<'tab' | 'title' | 'index', unknown>>
      if ('kind' in last && last.kind) return [[key, last]]
      const upgraded = upgradedLastAction(key, last)
      return upgraded ? [[key, upgraded]] : []
    }),
  )
}
