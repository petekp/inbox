import { CLAUDE_CODE } from '../core/domain/model-text'
import { parseStatus } from '../core/domain/status'
import { TOOL_FIELDS } from '../core/domain/tool-schemas'
import { recorded, withFetchedPrs } from '../core/runtime/session-presses'
import { appliedStatus } from '../core/runtime/session-status'
import { turnEnded, turnStarted } from '../core/runtime/session-turns'
import type { PrView, Session } from '../types'
import type { Ev } from './case'
import type { FuzzHost } from './host'

type AgentEv = Extract<Ev, { is: 'record' | 'close' | 'order' | 'status' | 'turn' | 'prs' }>

export const isAgentEv = (e: Ev): e is AgentEv =>
  e.is === 'record' || e.is === 'close' || e.is === 'order' || e.is === 'status' || e.is === 'turn' || e.is === 'prs'

/** The open rows the agent can close, items then findings. */
export const openIds = (s: Session): string[] => [...s.ledger.items.map(i => i.id), ...s.ledger.findings.map(f => f.id)]

const prList = (s: Session): PrView[] => Object.values(s.prViews.views)

function changedPr(v: PrView, change: Extract<Ev, { is: 'prs' }>['change']): PrView {
  if (change === 'clean') return { ...v, mergeable: 'MERGEABLE' }
  if (change === 'conflict') return { ...v, mergeable: 'CONFLICTING' }
  if (change === 'merged') return { ...v, state: 'MERGED' }
  if (change === 'closed') return { ...v, state: 'CLOSED' }
  if (change === 'threads-done') return { ...v, threads: v.threads.map(t => ({ ...t, isResolved: true })) }
  return { ...v, checks: v.checks.map(c => ({ ...c, conclusion: 'SUCCESS', status: 'COMPLETED' })) }
}

/** Runs one of the agent's or the host's events through the shared code the hosts run, at the process clock. */
export async function runAgent(host: FuzzHost, e: AgentEv): Promise<string> {
  const now = Date.now()
  const s = host.state()
  const call = (tool: 'record' | 'close' | 'order_prs', args: Record<string, unknown>) =>
    host.set(was => recorded(CLAUDE_CODE, was, tool, args, now, TOOL_FIELDS, null).state)
  if (e.is === 'record') {
    const before = new Set(openIds(s))
    call('record', e.args)
    return `recorded ${
      openIds(host.state())
        .filter(id => !before.has(id))
        .join(', ') || 'nothing'
    }`
  }
  if (e.is === 'close') {
    const ids = openIds(s)
    const id = ids[e.n % Math.max(1, ids.length)]
    if (id === undefined) return 'nothing to close'
    call('close', {
      id,
      ...(e.answer === undefined ? {} : { answer: e.answer }),
      ...(e.reason ? { reason: e.reason } : {}),
    })
    return `closed ${id}`
  }
  if (e.is === 'order') {
    const prs = prList(s)
    const picked = [...new Set(e.picks.map(i => prs[i % Math.max(1, prs.length)]).filter(p => p !== undefined))]
    const repo = picked[0]?.ref.split('#')[0] ?? prs[0]?.ref.split('#')[0]
    if (repo === undefined) return 'no PRs to order'
    call('order_prs', { repo, numbers: picked.map(p => p.number), label: e.label, why: e.why })
    return `ordered ${picked.map(p => p.ref).join(', ') || 'nothing'}`
  }
  if (e.is === 'status') {
    const answer = parseStatus(e.lines.join('\n'))
    if (answer === null) return 'the Status answer did not parse'
    host.set(was => appliedStatus(was, answer, was.presence.turnsApplied, now))
    return 'applied the Status answer'
  }
  if (e.is === 'turn') {
    if (e.to === 'start') return (host.set(was => turnStarted(was, now)), 'the turn started')
    host.set(was => turnEnded(was, now, now))
    const held = host.held.splice(0)
    for (const finish of held) await finish().catch(() => undefined)
    return `the turn ended, sending ${held.length} held presses`
  }
  const prs = prList(s)
  const pr = prs[e.n % Math.max(1, prs.length)]
  if (pr === undefined) return 'no PR to change'
  const views = { ...s.prViews.views, [pr.ref]: { ...changedPr(pr, e.change), fetchedAt: now } }
  host.set(was => withFetchedPrs(was, views, null, false, now))
  return `a fetch found ${pr.ref} ${e.change}`
}
