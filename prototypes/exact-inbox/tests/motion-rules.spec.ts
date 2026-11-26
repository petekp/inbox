import { afterAll, beforeAll, expect, test } from 'bun:test'
import { advanceMotion } from '../tools/motion-rules'
import { startFixture } from './fixture-server'
import type { Result } from '../app.contract'

let session = ''
let view: Result<'loadInbox'>
let stopFixture = async () => {}

beforeAll(async () => {
  const fixture = await startFixture()
  ;({ session, view } = fixture)
  stopFixture = fixture.stop
})
afterAll(() => stopFixture())

test('advanceMotion emits boolean hasPanel for all asks, findings, and PR rows', () => {
  const emptyFrame: Result<'advanceMotion'> = {
    session: '',
    signature: '',
    asks: [],
    finds: [],
    prs: [],
    deadline: 0,
  }
  const openAsk = view.asks.find(row => row.waiting)?.id ?? ''
  const openFind = view.findings.find(row => row.waiting)?.id ?? ''
  const selectedPr = view.prLines.find(row => (row.kind === 'thread' || row.kind === 'check') && row.waiting)?.id ?? ''
  const signature = `${session}:${view.rowVersion}:${view.prVersion}:${openAsk}:${openFind}:${selectedPr}:false:false:`
  const frame = advanceMotion([signature, view, openAsk, openFind, selectedPr, '', '', emptyFrame, 1000, false])

  expect(frame.session).toBe(session)
  expect(frame.signature).toBe(signature)
  expect(frame.asks.flatMap(g => g.rows).length).toBeGreaterThan(0)
  expect(frame.finds.flatMap(g => g.rows).length).toBeGreaterThan(0)
  expect(frame.prs.length).toBeGreaterThan(0)

  for (const row of [...frame.asks.flatMap(g => g.rows), ...frame.finds.flatMap(g => g.rows), ...frame.prs]) {
    expect(typeof row.hasPanel).toBe('boolean')
    expect(typeof row.phase).toBe('string')
    expect(typeof row.since).toBe('number')
  }

  const next = advanceMotion([signature + ':2', view, '', openFind, '', '', '', frame, 1020, false])
  expect(next.session).toBe(session)
  const closedAsk = next.asks.flatMap(g => g.rows).find(row => row.id === openAsk)
  expect(closedAsk?.phase).toBe('closing')
  expect(closedAsk?.hasPanel).toBe(true)
})
