import { expect, mock } from 'claude-code/testing'
import type { Session } from '../types'
import { test } from './test-with-timeout'
import { SESSION_VERSION } from '../core/domain/session-version'
import { sessionView } from '../core/view/session-view'
import Fold from '../hooks/pane/fold-client'
import Links from '../hooks/pane/links-client'
import Parent from '../hooks/pane/parent-client'
import Press from '../hooks/pane/press-client'
import RowClient from '../hooks/pane/row-client'
import Tabs from '../hooks/pane/tabs-client'
import type { TabsProps } from '../hooks/pane/tabs-client'
import Title from '../hooks/pane/title-client'
import { NO_HOLDS, PRESS_GUARD_MS, SETTLED_MS } from '../core/view/timing'
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

const MODULES: Record<string, unknown> = {
  'hooks/pane/fold-client.tsx': Fold,
  'hooks/pane/links-client.tsx': Links,
  'hooks/pane/parent-client.tsx': Parent,
  'hooks/pane/press-client.tsx': Press,
  'hooks/pane/row-client.tsx': RowClient,
  'hooks/pane/tabs-client.tsx': Tabs,
  'hooks/pane/title-client.tsx': Title,
}

const element =
  (type: string) =>
  (props: Record<string, unknown>): Node => ({ type, props, children: [props.children ?? []].flat() })

const SURFACE = {
  elements: { Box: element('Box'), Text: element('Text') },
  state: undefined,
  setState: () => {},
  onPointer: () => {},
  post: () => {},
  columns: 0,
  rows: 0,
}

function drawnBy(node: Node): Node {
  const module = MODULES[String(node.props?.module)]
  if (!module) throw new Error(`No Client module ${String(node.props?.module)} in the test.`)

  return (module as unknown as (props: unknown, surface: typeof SURFACE) => Node)(node.props?.props, SURFACE)
}

const textOf = (n: unknown): string => {
  if (typeof n === 'string') return n
  if (typeof n !== 'object' || n === null) return ''
  const node = n as Node
  if (node.type === 'Client') return textOf(drawnBy(node))
  const label = node.type === 'Button' && typeof node.props?.label === 'string' ? [node.props.label] : []
  const isInline = node.type === 'Text'

  return [...label, ...(node.children ?? []).map(textOf)].join(isInline ? '' : ' ')
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
          else if (!(await pane.find({ key: `view-${id}` })) && !(await pane.find({ key: `settled-${id}` })))
            throw new Error(`Row ${id} is not drawn.`)
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
