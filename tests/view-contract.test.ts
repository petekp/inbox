import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'
import type { LookTable } from '../hooks/client-features'
import { CLIENTS, PUBLISHED_LOOKS } from '../hooks/clients'
import type { Look } from '../hooks/rows'
import { sessionView } from '../hooks/session-view'
import { NO_HOLDS, SETTLED_MS } from '../hooks/timing'
import { contractSessions } from './view-contract-sessions'
import { LOOK_GAPS, repeatedTexts, rowTexts, statusFoldIds, statusTexts, textFields } from './view-contract'

const NOW = 1_000_000_000
const DAY = 86_400_000
const LOOKS = Object.keys(LOOK_GAPS) as Look[]
const SUMMARIES = new Set(['goal.milestonesFold'])

const TABLE_OF: Record<Look, LookTable['support']> = {
  terminal: CLIENTS['claude-code'].support,
  desktop: CLIENTS['claude-code'].support,
  codex: CLIENTS.codex.support,
  omp: CLIENTS.omp.support,
  herdr: PUBLISHED_LOOKS.herdr.support,
}

test('the contract sessions give every field a look shows as words at least once', () => {
  const given = new Set(
    contractSessions(NOW, 'Claude').flatMap(({ session }) => {
      const v = sessionView(session, NOW, SETTLED_MS, { ...NO_HOLDS, shownSince: NOW - DAY })
      const rows = [...v.needsYou.questions, ...v.needsYou.tasks, ...v.findings.rows]
      const open = statusFoldIds(v.statusPage)

      return LOOKS.flatMap(look => [
        ...rows.flatMap(r => rowTexts(r, { look, now: NOW })),
        ...statusTexts(v.statusPage, { look, now: NOW }, id => open.includes(id)),
      ]).map(e => e.field)
    }),
  )

  expect(textFields().filter(f => !given.has(f))).toEqual([])
})

test('each field a look leaves out names a feature its parity table does not mark full', () => {
  const marked = LOOKS.flatMap(look =>
    Object.entries(LOOK_GAPS[look]).map(([field, feature]) => `${look} ${field} ${TABLE_OF[look][feature!].kind}`),
  )

  expect(marked.filter(m => m.endsWith(' full') || m.endsWith(' host'))).toEqual([])
})

test('no text a row or the Status page must draw shows anywhere else on its screen', () => {
  const repeats = contractSessions(NOW, 'Claude').flatMap(({ name, session }) => {
    const v = sessionView(session, NOW, SETTLED_MS, { ...NO_HOLDS, shownSince: NOW - DAY })
    const tabs = [[...v.needsYou.questions, ...v.needsYou.tasks], v.findings.rows]
    const open = statusFoldIds(v.statusPage)

    return LOOKS.flatMap(look => {
      const rows = tabs.flatMap(tab =>
        tab.flatMap(row => {
          const others = [
            ...tab.filter(r => r !== row).flatMap(r => rowTexts(r, { look, now: NOW }).map(e => e.text)),
            ...row.actions.map(a => a.label),
          ]

          return repeatedTexts(rowTexts(row, { look, now: NOW }), others).map(
            e => `${name} ${look} ${row.id} ${e.field} "${e.text}"`,
          )
        }),
      )
      const page = statusTexts(v.statusPage, { look, now: NOW }, id => open.includes(id))
      const status = page.flatMap((e, n) =>
        repeatedTexts(
          [e],
          page.filter((o, m) => m !== n && !SUMMARIES.has(o.field)).map(o => o.text),
        ).map(r => `${name} ${look} Status ${r.field} "${r.text}"`),
      )

      return [...rows, ...status]
    })
  })

  expect([...new Set(repeats)]).toEqual([])
})
