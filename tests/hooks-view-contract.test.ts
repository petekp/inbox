import { expect, mock } from 'claude-code/testing'
import type { Session } from '../types'
import { test } from './test-with-timeout'
import { SESSION_VERSION } from '../hooks/session-version'
import { sessionView } from '../hooks/session-view'
import type { TabsProps } from '../hooks/tabs-client'
import { NO_HOLDS, PRESS_GUARD_MS, SETTLED_MS } from '../hooks/timing'
import { contractSessions } from './view-contract-sessions'
import { drawnGaps, missingTexts, rowTexts, statusFoldIds, statusTexts } from './view-contract'
import type { Expected } from './view-contract'
import { w, world } from './hooks-world'
import { PANE } from './hooks-helpers'

type Node = { type: string; key?: string; props?: Record<string, unknown>; children?: unknown[] }
type ModLook = 'terminal' | 'desktop'

const NOW = 1_000_000_000
const WIDE_COLUMNS = 120
const SHOWN_BEFORE_MS = 10_000

const stringsIn = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(stringsIn)
      : typeof value === 'object' && value !== null
        ? Object.values(value).flatMap(stringsIn)
        : []

const textOf = (n: unknown): string => {
  if (typeof n === 'string') return n
  if (typeof n !== 'object' || n === null) return ''
  const node = n as Node
  const own =
    node.type === 'Client' ? stringsIn(node.props?.props) : node.type === 'Button' ? stringsIn(node.props?.label) : []
  const isInline = node.type === 'Text'

  return [...own, ...(node.children ?? []).map(textOf)].join(isInline ? '' : ' ')
}

const failures = (look: ModLook, expected: Expected[], drawn: string) => ({
  missing: missingTexts(look, expected, drawn),
  gapsDrawn: drawnGaps(look, expected, drawn),
})

for (const look of ['terminal', 'desktop'] as const)
  for (const { name, session } of contractSessions(NOW, 'Claude'))
    test(`the ${look} look draws every field of each open row and of the Status page with its folds open: ${name}`, async ($, on) => {
      const clock = mock.clock(on, { now: NOW - SHOWN_BEFORE_MS })
      let now = NOW
      const settle = async () => {
        await clock.settle()
        await clock.advance(PRESS_GUARD_MS)
        now += PRESS_GUARD_MS
      }
      world($, on, [])
      w.paneState = { isShown: true, isFocused: true }
      w.surfaces = [look]
      const stored: Session = { ...session, place: { folder: '/tmp/project', branch: null } }
      w.stored.set('s:session-1', JSON.stringify({ version: SESSION_VERSION, savedAt: NOW, ...stored }))
      await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
      const pane = await $.ui.mount({ ...PANE, surface: look, props: { ...PANE.props, bodyColumns: WIDE_COLUMNS } })
      await clock.advance(SHOWN_BEFORE_MS)
      const viewNow = () => sessionView(stored, now, SETTLED_MS, { ...NO_HOLDS, shownSince: NOW - SHOWN_BEFORE_MS })
      const openTab = async (id: string) => {
        if (look === 'terminal') {
          if (await pane.find({ key: `tab-${id}` })) await pane.press({ key: `tab-${id}` })
        } else {
          const { tabs, gap } = (await pane.find({ key: 'tabs' }))?.props.props as TabsProps
          const x = tabs
            .slice(
              0,
              tabs.findIndex(t => t.id === id),
            )
            .reduce((sum, t) => sum + t.width + gap, 0)
          await pane.pointer({ type: 'down', x, y: 1, button: 'left', in: 'tabs' })
        }
        await settle()
      }
      const drawn = async () => textOf(await pane.drawn())

      const { needsYou, findings } = viewNow()
      const tabs = [
        ['needsYou', [...needsYou.questions, ...needsYou.tasks].map(r => r.id)],
        ['findings', findings.rows.map(r => r.id)],
      ] as const
      const results: unknown[] = []
      for (const [tab, ids] of tabs) {
        await openTab(tab)
        for (const id of ids) {
          const select = look === 'terminal' ? `title-${id}` : `select-${id}`
          if (await pane.find({ key: select }))
            if (look === 'terminal') await pane.press({ key: select })
            else await pane.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: select })
          await settle()
          const view = viewNow()
          const row = [...view.needsYou.questions, ...view.needsYou.tasks, ...view.findings.rows].find(
            r => r.id === id,
          )!
          results.push({ part: id, ...failures(look, rowTexts(row, { look, now }), await drawn()) })
        }
      }

      await openTab('overview')
      for (const id of statusFoldIds(viewNow().statusPage)) {
        const key = `fold-status-${id}`
        if (look === 'desktop') await pane.post({ isUnfolded: true }, { in: key })
        else if (String((await pane.find({ key }))?.props?.label ?? '').endsWith('›')) await pane.press({ key })
        await settle()
      }
      const page = viewNow().statusPage
      const open = statusFoldIds(page)
      const expected = statusTexts(page, { look, now }, id => open.includes(id))
      results.push({ part: 'Status', ...failures(look, expected, await drawn()) })

      expect(results).toEqual(results.map(r => ({ ...(r as object), missing: [], gapsDrawn: [] })))
    })
