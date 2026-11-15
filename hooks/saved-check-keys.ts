import type { PrCheck, PrView, Session } from '../types'
import { checkKey } from './prs'
import { checkRowId } from './pr-rows'

/**
 * The `checkKey` of the check a saved name stands for, among the checks of the PR's saved view. Earlier builds named a
 * check by its name alone. A name that is already a key stays, so converting twice changes nothing. So does a name no
 * check has, or several checks have, since it cannot say which one it meant.
 */
function savedCheckKey(checks: PrCheck[], name: string): string {
  if (checks.some(c => checkKey(c) === name)) return name
  const named = checks.filter(c => c.name === name)

  return named.length === 1 ? checkKey(named[0]!) : name
}

/** A PR's ref has no spaces, so a check row id splits at its first " check ". */
const CHECK_ROW_ID = /^(\S+) check (.+)$/

function savedRowId(id: string, views: Record<string, PrView>): string {
  const m = CHECK_ROW_ID.exec(id)

  return m ? checkRowId(m[1]!, savedCheckKey(views[m[1]!]?.checks ?? [], m[2]!)) : id
}

/**
 * The session with each check that earlier builds saved by its name, in a row's last action, a sent message's row and
 * a ranked PR's recorded failing checks, named by its `checkKey` instead.
 */
export function withCheckKeys<S extends Pick<Session, 'ledger' | 'sent' | 'lastActions'>>(
  s: S,
  views: Record<string, PrView>,
): S {
  const order = s.ledger.prOrder
  const statuses = order?.statuses
  const upgradedStatuses =
    statuses &&
    Object.fromEntries(
      Object.entries(statuses).map(([ref, status]) => [
        ref,
        { ...status, failing: status.failing.map(name => savedCheckKey(views[ref]?.checks ?? [], name)) },
      ]),
    )

  return {
    ...s,
    ledger: order ? { ...s.ledger, prOrder: { ...order, statuses: upgradedStatuses } } : s.ledger,
    sent: s.sent.map(x => (x.row === null ? x : { ...x, row: savedRowId(x.row, views) })),
    lastActions: Object.fromEntries(
      Object.entries(s.lastActions).map(([id, last]) => {
        const upgraded = savedRowId(id, views)
        return [upgraded in s.lastActions ? id : upgraded, last]
      }),
    ),
  }
}
