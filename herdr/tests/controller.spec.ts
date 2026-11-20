import { expect, setSystemTime, test } from 'bun:test'

import { demoSession } from '../../hooks/demo'
import { closeItem } from '../../hooks/ledger-close'
import { FOLD_QUIET_MS, PRESS_GUARD_MS, SETTLED_MS } from '../../hooks/timing'
import type { SessionView } from '../../hooks/session-view'
import { freshUi } from '../../hooks/ui-controller-types'
import type { UiEvent, UiState } from '../../hooks/ui-controller-types'
import type { Session } from '../../types'
import type { Block } from '../src/blocks'
import { HERDR_LOOK, applyEvents, lookUiOf } from '../src/controller'
import { rowWaits, tabBlocks } from '../src/draw'
import { AGENT, NOW, demoScreen, withDismissedAsk } from './fixtures'
import { allOf, focusTerminal, openPanel, typeIn } from './gpui-stand-in'

let clock = NOW
const later = (ms: number) => setSystemTime(new Date((clock += ms)))
setSystemTime(new Date(clock))

type Panel = Awaited<ReturnType<typeof openPanel>>

function found<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`${what} is not drawn`)

  return value
}

const nodeOf = (panel: Panel, id: string) =>
  found(
    allOf(panel.paint()).find(n => n.id === id),
    id,
  )
const buttonOf = (panel: Panel, rowId: string, label: string) =>
  found(
    allOf(nodeOf(panel, `row ${rowId}`)).find(n => n.label === label),
    `${label} on ${rowId}`,
  )
const useList = (panel: Panel, by: 'pointer' | 'wheel') =>
  found(nodeOf(panel, 'inbox-list')[by], `the list's ${by} handler`)({}, panel.cx as never)
const selectedIn = (blocks: Block[]) => blocks.find(b => b.kind === 'row' && b.isSelected)?.id ?? null
const isDrawn = (blocks: Block[], id: string) => blocks.some(b => b.kind === 'row' && b.id === id)

const demo = () => demoSession(NOW, AGENT)
const emptied = (s: Session): Session => ({ ...s, ledger: { ...s.ledger, items: [], findings: [] } })
const closedByAgent = (s: Session, id: string, at: number): Session => ({
  ...s,
  ledger: closeItem(s.ledger, id, { how: 'claude', outcome: 'handled' }, at),
})

async function opened() {
  later(SETTLED_MS)
  const panel = await openPanel()
  panel.paint()

  return panel
}

test('rows that arrive while the shown tab is empty move the look to their tab, once the list is quiet', async () => {
  const run = async (isPointing: boolean) => {
    const panel = await opened()
    panel.publish(emptied(demo()))
    later(2 * FOLD_QUIET_MS)
    const arrived = {
      ...emptied(demo()),
      ledger: { ...emptied(demo()).ledger, findings: demo().ledger.findings.slice(0, 1) },
    }
    if (isPointing) useList(panel, 'pointer')
    panel.publish(arrived)
    const atArrival = panel.panel.ui.tab
    later(FOLD_QUIET_MS)
    panel.run([{ type: 'tick' }])

    return [atArrival, panel.panel.ui.tab]
  }
  expect(await run(true)).toEqual(['needsYou', 'findings'])
  expect(await run(false)).toEqual(['findings', 'findings'])
})

test('following another session and coming back shows Asks when a row waits there', async () => {
  const panel = await opened()
  panel.click(nodeOf(panel, 'tab findings'))
  expect(panel.panel.ui.tab).toBe('findings')
  focusTerminal('t2')
  panel.paint()
  focusTerminal('t1')
  panel.paint()
  await panel.settle()
  expect(panel.panel.ui.tab).toBe('needsYou')
})

test('each tab keeps its own cursor', async () => {
  const panel = await opened()
  panel.click(nodeOf(panel, 'row d13'))
  panel.click(nodeOf(panel, 'tab findings'))
  panel.paint()
  panel.click(nodeOf(panel, 'row d21'))
  panel.paint()
  expect(selectedIn(panel.panel.blocks)).toBe('d21')
  panel.click(nodeOf(panel, 'tab needsYou'))
  panel.paint()
  expect(selectedIn(panel.panel.blocks)).toBe('d13')
})

test('a click that opens a row guards that row’s buttons for PRESS_GUARD_MS', async () => {
  const panel = await opened()
  panel.click(nodeOf(panel, 'row d13'))
  const explain = () => buttonOf(panel, 'd13', 'Explain')
  panel.click(explain())
  expect(panel.panel.queue.outs).toEqual([])
  later(PRESS_GUARD_MS + 1)
  panel.click(explain())
  expect(panel.panel.queue.outs.map(o => o.rowId)).toEqual(['d13'])
})

test('the agent’s close of the open row opens the next row only once the list was quiet for FOLD_QUIET_MS', async () => {
  const run = async (isScrolled: boolean) => {
    const panel = await opened()
    panel.click(nodeOf(panel, 'row d13'))
    later(2 * FOLD_QUIET_MS)
    if (isScrolled) useList(panel, 'wheel')
    panel.publish(closedByAgent(demo(), 'd13', clock))
    panel.paint()
    const atClose = selectedIn(panel.panel.blocks)
    later(FOLD_QUIET_MS)
    panel.run([{ type: 'tick' }])
    panel.paint()

    return [atClose, selectedIn(panel.panel.blocks)]
  }
  expect(await run(true)).toEqual([null, 'd15'])
  expect(await run(false)).toEqual(['d15', 'd15'])
})

test('a pointer moving over the list holds a row the agent closed past its fold, until the list is quiet', async () => {
  const run = async (isPointing: boolean) => {
    const panel = await opened()
    const closedAt = clock
    panel.publish(closedByAgent(demo(), 'd15', closedAt))
    later(SETTLED_MS - 300)
    const point = () => useList(panel, 'pointer')
    if (isPointing) point()
    later(400)
    if (isPointing) point()
    later(400)
    panel.run([{ type: 'tick' }])
    panel.paint()
    const isHeld = isDrawn(panel.panel.blocks, 'd15')
    later(FOLD_QUIET_MS)
    panel.run([{ type: 'tick' }])
    panel.paint()

    return [isHeld, isDrawn(panel.panel.blocks, 'd15')]
  }
  expect(await run(true)).toEqual([true, false])
  expect(await run(false)).toEqual([false, false])
})

test('a reply the queue refuses opens its field again with its words', async () => {
  const panel = await opened()
  panel.click(nodeOf(panel, 'row d13'))
  later(PRESS_GUARD_MS + 1)
  panel.click(buttonOf(panel, 'd13', 'Explain'))
  panel.click(buttonOf(panel, 'd13', 'Reply'))
  typeIn(found(panel.panel.input, 'the reply field').state, 'Use the cache')
  panel.click(buttonOf(panel, 'd13', 'Send'))
  expect(panel.panel.queue.lines.d13?.text).toBe('Not sent: the last press on this row has not finished.')
  expect(panel.panel.ui.typing).toBe('d13')
  expect(panel.panel.input?.state.value()).toBe('Use the cache')
})

const FACTS = { isFetchingPrs: false, hasAsksBlocker: false, lastTypedMessageAt: null }
const readOn = (ui: UiState, view: SessionView, at: number, more: UiEvent[] = []) =>
  applyEvents(ui, view, [{ type: 'read', host: FACTS }, ...more], at).ui
const pickedOn = (id: string) => {
  const { view } = demoScreen()
  const start = applyEvents(freshUi(HERDR_LOOK), view, [{ type: 'opened' }], NOW - 3000).ui

  return readOn(start, view, NOW - 2900, [{ type: 'select', tab: 'needsYou', id, by: 'key' }])
}

test('closing the open row opens the next row that waits after it, keeps it once the row folds, and Undo reopens it', () => {
  const closing = withDismissedAsk('d13', NOW - 500)
  const moved = readOn(pickedOn('d13'), closing.view, NOW)
  expect(selectedIn(tabBlocks(closing, lookUiOf(moved, closing.view)))).toBe('d15')
  const folded = withDismissedAsk('d13', NOW - SETTLED_MS - 5000)
  expect(selectedIn(tabBlocks(folded, lookUiOf(moved, folded.view)))).toBe('d15')
  const undo = applyEvents(
    moved,
    closing.view,
    [{ type: 'press', press: { action: 'undo', id: 'd13' }, by: 'key' }],
    NOW,
  )
  const outcome = { error: null, note: null, isUnconfirmed: false }
  const undone = readOn(undo.ui, demoScreen().view, NOW + 10, [{ type: 'press-settled', pressId: 1, outcome }])
  expect(selectedIn(tabBlocks(demoScreen(), lookUiOf(undone, demoScreen().view)))).toBe('d13')
})

test('a selected row that did not wait, such as a handed-off one, stays open', () => {
  const { view } = demoScreen()
  expect(rowWaits(demoScreen(), 'needsYou').find(r => r.id === 'd18')?.isWaiting).toBe(false)
  const ui = readOn(pickedOn('d18'), view, NOW)
  expect(selectedIn(tabBlocks(demoScreen(), lookUiOf(ui, view)))).toBe('d18')
})
