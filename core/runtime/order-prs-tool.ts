import type { Host } from '../domain/model-text'
import { MAX_ORDERED_PRS, tabPrs } from '../domain/pr-fetch'
import { ORDER_LIMITS, tooLongText } from '../domain/field-limits'
import { isDismissed } from '../view/pr-views'
import type { LastAction, Ledger } from '../../types'
import { type ToolAnswer, trimmed, unchanged } from './tool-answer'

export function orderDescription(host: Host): string {
  return `Set the order of the user's PRs in ${host.prsIn}, when the user asks for an order there. Those PRs show first, in this order. Each call replaces the order, and an empty numbers list clears it.`
}

const REPO = /^[\w.-]+\/[\w.-]+$/

/** A PR number as the agent gave it, as 3401 or "#3401", or null when it is not one. */
function prNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim().replace(/^#/, '')) : NaN

  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Sets the PRs tab's order from an `order_prs` call. The tab shows and fetches each PR the order ranks, without
 * linking it, so a new order or an empty list, which clears it, takes the old order's PRs off the tab. A PR the
 * person or a fetch dismissed stays off it.
 */
export function orderPrs(
  host: Host,
  ledger: Ledger,
  input: Record<string, unknown>,
  now: number,
  lastActions: Record<string, LastAction>,
): ToolAnswer {
  if (!Array.isArray(input.numbers)) return unchanged(ledger, 'Not set: numbers must be a list of PR numbers.')
  if (input.numbers.length === 0) {
    if (ledger.prOrder === null) return unchanged(ledger, 'No order was set.')

    return {
      ledger: { ...ledger, prOrder: null },
      result: `Cleared. The PRs show in their usual order in ${host.prsIn}.`,
      personLine: 'PR order cleared',
    }
  }
  const numbers = input.numbers.map(prNumber)
  if (numbers.includes(null)) return unchanged(ledger, 'Not set: numbers must be PR numbers, such as 3401.')
  const repo = trimmed(input.repo)
  if (!REPO.test(repo)) return unchanged(ledger, 'Not set: give repo as owner/name.')
  const refs = [...new Set(numbers.map(n => `${repo}#${n}`))]
  if (refs.length > MAX_ORDERED_PRS) return unchanged(ledger, `Not set: an order ranks at most ${MAX_ORDERED_PRS} PRs.`)
  const label = trimmed(input.label)
  if (!label) return unchanged(ledger, 'Not set: give label, what the user does with the order.')
  const why = trimmed(input.why)
  if (!why) return unchanged(ledger, 'Not set: give why, the reason for this order.')
  const tooLong = tooLongText(input, ORDER_LIMITS)
  if (tooLong) return unchanged(ledger, `Not set: ${tooLong}`)
  const dismissed = refs.filter(ref => isDismissed(lastActions, ref) || ledger.prOrder?.dismissed.includes(ref))
  const onTab = tabPrs(ledger)
  const added = refs.filter(ref => !onTab.includes(ref))
  const addedText =
    added.length === 0
      ? ''
      : added.length === 1
        ? " 1 of them was not in the tab yet. It shows after the tab's next refresh, if the user wrote it and it is open."
        : ` ${added.length} of them were not in the tab yet. They show after the tab's next refresh, if the user wrote them and they are open.`

  return {
    ledger: {
      ...ledger,
      prOrder: { refs, label, why, statuses: {}, dismissed, by: host.agent, at: now },
    },
    result: `Set. These ${refs.length} PRs show first in ${host.prsIn}, in this order.${addedText}`,
    personLine: `PR order: ${label}, ${refs.length} ${refs.length === 1 ? 'PR' : 'PRs'}`,
  }
}
