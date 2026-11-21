import './gpui-stand-in'
import { expect, test } from 'bun:test'
import { herdrEnvelope } from '../../core/remote/herdr-envelope'
import { NO_HOLDS } from '../../core/view/timing'
import type { Session } from '../../types'
import { contractSessions } from '../../tests/view-contract-sessions'
import { drawnGaps, missingTexts, rowTexts, statusFoldIds, statusTexts } from '../../tests/view-contract'
import type { Expected } from '../../tests/view-contract'
import { allOf, columnOf } from './gpui-stand-in'
import type { Painted } from './gpui-stand-in'
import { AGENT, NOW, uiOn } from './fixtures'
import type { LookUi } from '../src/draw'
import type { Followed } from '../src/follow'

const { layoutAtRest } = await import('./frames')
const { readSession } = await import('../src/files')
const { screenOf } = await import('../src/screen')
const { bannerEl } = await import('../src/paint-chrome')

const DAY = 86_400_000
const THEME = new Proxy({}, { get: () => '#808080' }) as never
const FOLLOWED: Followed = { is: 'session', terminal: 't1', sessionId: 's1' }
const PRESSES = { now: NOW, holds: { ...NO_HOLDS, shownSince: NOW - DAY }, notes: {}, queue: { outs: [], lines: {} } }

function drawn(session: Session, ui: LookUi) {
  const envelope = herdrEnvelope(
    { host: 'claude-code', agent: AGENT, sessionId: 's1', terminal: 't1', writtenAt: NOW },
    session,
  )
  const screen = screenOf(FOLLOWED, readSession(JSON.stringify(envelope)), ui, PRESSES)
  if (screen.is !== 'inbox') throw new Error(`the look drew no inbox: ${JSON.stringify(screen)}`)
  const anyNode = [...layoutAtRest(screen.blocks).placed.keys()][0]!
  let list: Painted = anyNode
  while (list.parent) list = list.parent
  const banners = columnOf(
    screen.banners.map(b => bannerEl(b, THEME)),
    '20px',
  )
  const text = [list, banners]
    .flatMap(allOf)
    .map(n => n.text ?? '')
    .join(' ')

  return { view: screen.view, text }
}

const failures = (expected: Expected[], text: string) => ({
  missing: missingTexts('herdr', expected, text),
  gapsDrawn: drawnGaps('herdr', expected, text),
})

for (const { name, session } of contractSessions(NOW, AGENT)) {
  test(`the Herdr look draws every field of each open row: ${name}`, () => {
    const { view } = drawn(session, uiOn('needsYou'))
    const tabs = [
      ['needsYou', [...view.needsYou.questions, ...view.needsYou.tasks]],
      ['findings', view.findings.rows],
    ] as const
    for (const [tab, rows] of tabs)
      for (const row of rows) {
        const { text } = drawn(session, uiOn(tab, { selected: row.id }))
        expect({ row: row.id, ...failures(rowTexts(row, { look: 'herdr', now: NOW }), text) }).toEqual({
          row: row.id,
          missing: [],
          gapsDrawn: [],
        })
      }
  })

  test(`the Herdr look draws every field of the Status page with its folds open: ${name}`, () => {
    const page = drawn(session, uiOn('overview')).view.statusPage
    const open = statusFoldIds(page)
    const { text } = drawn(session, uiOn('overview', { statusUnfolded: open }))
    const expected = statusTexts(page, { look: 'herdr', now: NOW }, id => open.includes(id))
    expect(failures(expected, text)).toEqual({ missing: [], gapsDrawn: [] })
  })
}
