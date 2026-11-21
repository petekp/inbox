import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { collapsedRows, withCollapse } from '../core/view/collapse'
import { closeFinding, closeItem } from '../core/domain/ledger-close'
import { prCheckId, prThreadId } from '../core/view/pr-rows'
import { emptySession, upgradeSession } from '../core/view/session-files'
import type { Item, PrCheck, PrThread, PrView, Session } from '../types'
import { BLOCKED_PR, FIX_REF } from './session-helpers'

const item = (id: string, reportedAt?: number): Item => ({
  id,
  kind: 'question',
  label: null,
  ask: `Question ${id}`,
  options: [],
  rec: null,
  helps: [],
  turn: 1,
  at: 1,
  from: 'record',
  ...(reportedAt !== undefined && { reportedAt }),
})

const thread = (reply: PrThread['reply']): PrThread => ({
  id: 't1',
  author: 'reviewer',
  reply,
  isWaiting: true,
  isOutdated: false,
  isLinesChanged: false,
  path: 'cli.ts',
  line: 3,
  body: 'Name this flag',
  url: 'https://github.com/acme/app/pull/12#discussion_r1',
  at: 1,
})

const check = (run: Partial<PrCheck>): PrCheck => ({ name: 'test', bucket: 'fail', url: null, ...run })

function session(items: Item[], pr: Partial<PrView> = {}): Session {
  const base = emptySession()

  return {
    ...base,
    ledger: { ...base.ledger, items },
    prViews: { ...base.prViews, views: { [FIX_REF]: { ...BLOCKED_PR, ...pr } } },
  }
}

const COLLAPSED_AT = 100
const LATER = 200

test('a collapsed row stays collapsed while nothing new arrives on it, and a press on another row changes nothing', () => {
  const s = withCollapse(session([item('i1', 50), item('i2')]), 'i1', true, COLLAPSED_AT)
  const pressed = {
    ...s,
    lastActions: { i2: { kind: 'talk' as const, action: 'explain', text: 'Explain', at: LATER } },
  }

  expect(collapsedRows(s)).toEqual(['i1'])
  expect(collapsedRows(pressed)).toEqual(['i1'])
  expect(collapsedRows(withCollapse(s, 'i1', false, LATER))).toEqual([])
})

test('a collapsed row opens on a new report of its question, a new comment on its thread, and a new failed run of its check', () => {
  const t = (at: number) => thread({ author: 'reviewer', body: 'Still?', url: `https://x/${at}`, at })
  const s = session([item('i1')], { threads: [t(50)], checks: [check({ finishedAt: 50 })] })
  const threadId = prThreadId(s.prViews.views[FIX_REF]!, t(50))
  const checkId = prCheckId(s.prViews.views[FIX_REF]!, check({}))
  const collapsed = [threadId, checkId, 'i1'].reduce((c, id) => withCollapse(c, id, true, COLLAPSED_AT), s)
  const pr = collapsed.prViews.views[FIX_REF]!

  expect(collapsedRows(collapsed).sort()).toEqual([checkId, threadId, 'i1'].sort())
  expect(collapsedRows({ ...collapsed, ledger: { ...collapsed.ledger, items: [item('i1', LATER)] } })).not.toContain(
    'i1',
  )
  const replied = { ...pr, threads: [t(LATER)] }
  expect(
    collapsedRows({ ...collapsed, prViews: { ...collapsed.prViews, views: { [FIX_REF]: replied } } }),
  ).not.toContain(threadId)
  const failedAgain = { ...pr, checks: [check({ finishedAt: LATER })] }
  expect(
    collapsedRows({ ...collapsed, prViews: { ...collapsed.prViews, views: { [FIX_REF]: failedAgain } } }),
  ).not.toContain(checkId)
})

test('a comment or a failed run GitHub gave no time counts as new once it is not the one there at the collapse', () => {
  const t = (url: string) => thread({ author: 'reviewer', body: 'Still?', url, at: null })
  const s = session([], { threads: [t('https://x/1')], checks: [check({ url: 'https://x/run/1' })] })
  const pr = s.prViews.views[FIX_REF]!
  const threadId = prThreadId(pr, t('https://x/1'))
  const checkId = prCheckId(pr, check({}))
  const collapsed = withCollapse(withCollapse(s, threadId, true, COLLAPSED_AT), checkId, true, COLLAPSED_AT)
  const withPr = (next: Partial<PrView>) => ({
    ...collapsed,
    prViews: { ...collapsed.prViews, views: { [FIX_REF]: { ...pr, ...next } } },
  })

  expect(collapsedRows(collapsed).sort()).toEqual([checkId, threadId].sort())
  expect(collapsedRows(withPr({ threads: [t('https://x/2')] }))).toEqual([checkId])
  expect(collapsedRows(withPr({ checks: [check({ url: 'https://x/run/2' })] }))).toEqual([threadId])
})

test('a finding a dismissed question gave back counts as new, so its collapsed row opens', () => {
  const base = emptySession()
  const finding = {
    id: 'f1',
    kind: 'issue' as const,
    title: 'README is stale',
    detail: 'Old command.',
    path: null,
    at: 1,
  }
  const open = { ...base, ledger: { ...base.ledger, findings: [finding] } }
  const collapsed = withCollapse(open, 'f1', true, COLLAPSED_AT)
  const asked = closeFinding(
    { ...collapsed.ledger, items: [item('i5')] },
    'f1',
    { how: 'claude', outcome: 'asked as a question' },
    150,
    'i5',
  )
  const given = closeItem(asked, 'i5', { how: 'dismissed', outcome: 'dismissed' }, LATER)

  expect(given.findings.map(f => f.id)).toEqual(['f1'])
  expect(collapsedRows({ ...collapsed, ledger: given })).toEqual([])
})

test('a collapse keeps the entries only of rows a tab still lists, and a session saved without collapsed rows loads with none', () => {
  const s = withCollapse(session([item('i1'), item('i2')]), 'i1', true, COLLAPSED_AT)
  const gone = { ...s, ledger: { ...s.ledger, items: [item('i2')] } }

  expect(Object.keys(withCollapse(gone, 'i2', true, LATER).collapsed)).toEqual(['i2'])
  expect(Object.keys(withCollapse(s, 'i2', true, LATER).collapsed).sort()).toEqual(['i1', 'i2'])
  const { collapsed: _collapsed, ...saved } = s
  expect(upgradeSession(saved).collapsed).toEqual({})
})
