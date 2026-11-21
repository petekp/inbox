import { parseStatus } from '../core/domain/status'
import type { Op } from '../core/domain/status'
import { applyOps } from '../core/domain/status-ops'
import { emptySession } from '../core/view/session-files'
import { countsText } from '../core/view/status-folds'
import { statusPage } from '../core/view/status-page'
import type { StatusRow } from '../core/view/status-page'
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
      ? `${r.mark} ${r.name}${r.text ? `: ${r.text}` : ''}${r.waitsOn ? ` · ${r.waitsOn}` : r.stall ? ` · ${r.stall.text}` : ''}${r.hasChildren ? ' ┐' : ''}`
      : r.kind === 'child'
        ? `${r.branch ? ARMS[r.branch] : ''}${r.mark} ${r.name}`
        : r.kind === 'more'
          ? `${r.branch ? ARMS[r.branch] : ''}${r.text}`
          : r.kind === 'part'
            ? `== ${r.text}`
            : r.kind === 'counts'
              ? `${countsText(r.counts)} ›`
              : r.kind === 'done-fold'
                ? `› ${r.text}`
                : `${r.mark} ${r.text}`,
  )
