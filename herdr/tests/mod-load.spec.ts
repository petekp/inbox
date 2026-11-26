import { expect, setSystemTime, test } from 'bun:test'
import { join } from 'node:path'

import { demoSession } from '../../core/view/demo'
import type { Session } from '../../types'
import { AGENT, NOW } from './fixtures'
import { allOf, appModules, openPanel, standInWindow } from './gpui-stand-in'
import { HERDR_GLOBALS, globalsOf, herdrContext, loadBuiltMod } from './herdr-runtime'

setSystemTime(new Date(NOW))

const BUILT_MOD = join(import.meta.dir, '..', 'mod', 'inbox', 'main.js')

test('the load context holds exactly the globals of Herdr’s mod runtime', () => {
  expect(globalsOf(herdrContext(standInWindow))).toEqual(HERDR_GLOBALS.toSorted())
})

test('the built mod loads with only Herdr’s globals and draws the session it follows', async () => {
  const Inbox = await loadBuiltMod(BUILT_MOD, herdrContext(standInWindow), appModules)

  expect(Object.getPrototypeOf(Inbox)).toBe(appModules['gpui-kit'].View)
  const panel = await openPanel(Inbox as Parameters<typeof openPanel>[0])
  expect(allOf(panel.paint()).some(n => n.id === 'inbox-list')).toBe(true)
})

function countedList<T extends object>(list: T[], reads: { n: number }): T[] {
  return new Proxy(list, {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads.n++
      return Reflect.get(target, key, receiver)
    },
  })
}

function longSession(copies: number, reads: { n: number }): Session {
  const s = demoSession(NOW, AGENT)
  const l = s.ledger
  const many = <T extends { id: string }>(list: T[], prefix: string) =>
    countedList(
      Array.from({ length: copies }, (_, c) => list.map(x => ({ ...x, id: `${prefix}${c}-${x.id}` }))).flat(),
      reads,
    )

  return {
    ...s,
    ledger: {
      ...l,
      items: many(l.items, 'i'),
      findings: many(l.findings, 'f'),
      closed: many(l.closed, 'c'),
      closedFindings: many(l.closedFindings, 'g'),
    },
  }
}

async function rowsReadByDraws(copies: number): Promise<Record<string, number>> {
  const reads = { n: 0 }
  const { paint, publish, click } = await openPanel()
  publish(longSession(copies, reads))
  const byTab: Record<string, number> = {}
  for (const tab of ['Asks', 'Status', 'Finds', 'PRs']) {
    const tabButton = allOf(paint()).find(n => n.label?.startsWith(tab))
    if (!tabButton) throw new Error(`the panel drew no ${tab} tab`)
    click(tabButton)
    reads.n = 0
    paint()
    paint()
    byTab[tab] = reads.n
  }

  return byTab
}

test('a draw of a long session reads no more of its rows than a draw of a short one, on every tab', async () => {
  expect(await rowsReadByDraws(40)).toEqual(await rowsReadByDraws(5))
})
