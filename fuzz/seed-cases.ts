import { demoSession } from '../core/view/demo'
import { emptySession } from '../core/view/session-files'
import type { Case, Ev } from './case'
import { START } from './gen'
import type { HostOutcomes } from './host'

const ACCEPTED: HostOutcomes = { deliver: ['accepted'], isHeldUntilRun: false, performFails: [false] }
export const UNCONFIRMED: HostOutcomes = { deliver: ['unconfirmed'], isHeldUntilRun: false, performFails: [false] }

export const herdr = (session: Case['session'], events: Ev[]): Case => ({
  look: 'herdr',
  session,
  outcomes: ACCEPTED,
  takeAfterMs: 80,
  width: 80,
  events,
})

export const omp = (events: Ev[]): Case => ({ ...herdr(emptySession(), events), look: 'omp' })

export const demo = demoSession(START, 'Claude')
/** The demo session with a fourth child under "Dismiss gesture", so its children end in a "+ 1 more" line. */
export const demoWithMore = ((): Case['session'] => {
  const overview = demo.ledger.overview
  const first = overview?.children[0]
  if (!overview || !first) throw new Error('the demo session has no Status child to copy')
  const child = { ...first, id: 'c9', ref: 'demo-second-pair', name: 'Try the pinch on a second pair' }

  return { ...demo, ledger: { ...demo.ledger, overview: { ...overview, children: [...overview.children, child] } } }
})()
/** The demo session with only the items `ids` and the PRs `prs`, and no findings or closed items. */
export const only = (ids: string[], prs: string[] = []): Case['session'] => ({
  ...demo,
  ledger: { ...demo.ledger, items: demo.ledger.items.filter(i => ids.includes(i.id)), findings: [], closed: [] },
  prViews: {
    ...demo.prViews,
    views: Object.fromEntries(Object.entries(demo.prViews.views).filter(([k]) => prs.includes(k))),
  },
})
