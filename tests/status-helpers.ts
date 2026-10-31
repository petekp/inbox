import { parseStatus } from '../hooks/status'
import type { Op } from '../hooks/status'
import { applyOps } from '../hooks/status-ops'
import { emptySession } from '../hooks/session-files'
import { statusPage } from '../hooks/status-page'
import type { StatusRow } from '../hooks/status-page'
import type { Item, SessionStatus, Session } from '../types'

export const MIN = 60_000

export const opsOf = (text: string): Op[] => {
  const answer = parseStatus(text)
  if (answer?.kind !== 'ops') throw new Error(`not ops: ${text}`)

  return answer.ops
}

export const NO_ASKS: ReadonlySet<string> = new Set()

export const after = (last: SessionStatus | null, text: string, now: number, askIds = NO_ASKS) =>
  applyOps(last, opsOf(text), now, askIds)

export const askItem = (id: string): Item => ({
  id,
  kind: 'question',
  label: null,
  ask: `Ask ${id}?`,
  options: [],
  rec: null,
  helps: [],
  turn: 1,
  at: null,
  from: 'record',
})

const presence = (over: Partial<Session['presence']> = {}): Session['presence'] => ({
  ...emptySession().presence,
  ...over,
})

export const page = (
  sessionStatus: SessionStatus | null,
  now: number,
  over: Partial<Session['presence']> = {},
  items: Item[] = [],
) => statusPage({ ledger: { overview: sessionStatus, items }, presence: presence(over) }, now)

const ARMS = { mid: '├ ', last: '└ ' } as const

export const shape = (rows: StatusRow[]) =>
  rows.map(r =>
    r.kind === 'subject'
      ? `${r.mark} ${r.name}${r.text ? `: ${r.text}` : ''}${r.stall ? ` · ${r.stall.text}` : ''}${r.hasChildren ? ' ┐' : ''}`
      : r.kind === 'child'
        ? `${r.branch ? ARMS[r.branch] : ''}${r.mark} ${r.name}${r.stall ? ` · ${r.stall.text}` : ''}`
        : r.kind === 'look'
          ? `-- ${r.text}`
          : r.kind === 'more'
            ? `${ARMS[r.branch]}${r.text}`
            : `${r.mark} ${r.text}`,
  )
