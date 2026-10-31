import { describe, expect, test } from 'claude-code/testing'
import { CLEARED_TOKENS, herdrEnvelope, herdrLabels, herdrTarget, pressFile } from '../hooks/herdr'
import type { EnvelopeSource } from '../hooks/herdr'
import { emptySession } from '../hooks/session-files'

const SOURCE: EnvelopeSource = { host: 'codex', agent: 'Codex', sessionId: 's1', terminal: 't1', writtenAt: 5 }

const PRESS = {
  format: 1,
  id: 'p1',
  pressedAt: 10,
  press: { action: 'answer', id: 'q3', option: 'Yes' },
  holds: { replies: { q2: 4 }, discarded: { q1: 3 }, shownSince: 0 },
}

describe('herdrTarget', () => {
  test('a multiplexer pane wins over an app terminal, and neither means no target', () => {
    expect(herdrTarget({ HERDR_PANE_ID: 'p1', HC_TERMINAL_ID: 't1' })).toEqual({ kind: 'pane', pane: 'p1' })
    expect(herdrTarget({ HC_TERMINAL_ID: 't1' })).toEqual({ kind: 'terminal', terminal: 't1' })
    expect(herdrTarget({ HERDR_PANE_ID: '', HC_TERMINAL_ID: '' })).toBeNull()
  })
})

describe('herdrLabels', () => {
  test('each token becomes an inbox. label, and a cleared token an empty value', () => {
    expect(herdrLabels({ ...CLEARED_TOKENS, inbox: '2 · Ship it?', 'inbox-needs-you': '2' })).toEqual({
      'inbox.status': '2 · Ship it?',
      'inbox.stop': '',
      'inbox.needs-you': '2',
      'inbox.findings': '',
      'inbox.prs': '',
    })
  })
})

describe('herdrEnvelope', () => {
  test("keeps every shared session field and drops the host's own", () => {
    const session = emptySession()
    const hostState = { ...session, herdrReport: { seq: 4 }, revision: 9 }

    expect(JSON.parse(JSON.stringify(herdrEnvelope(SOURCE, hostState)))).toEqual({
      format: 1,
      ...SOURCE,
      session: JSON.parse(JSON.stringify(session)),
    })
  })
})

describe('pressFile', () => {
  test('a press file reads back with its press and holds', () => {
    expect(pressFile(JSON.stringify(PRESS))).toEqual({ ok: true, file: PRESS })
    const rankAgain = { ...PRESS, press: { action: 'pr-rank-again' } }
    expect(pressFile(JSON.stringify(rankAgain))).toEqual({ ok: true, file: rankAgain })
  })

  test('a file a host cannot apply is refused with its reason', () => {
    const refused: [unknown, string][] = [
      [{ ...PRESS, format: 2 }, 'unknown format 2'],
      [{ ...PRESS, id: '' }, 'no id'],
      [{ ...PRESS, pressedAt: '10' }, 'no pressedAt'],
      [{ ...PRESS, press: { action: 'launch', id: 'q3' } }, 'unknown action launch'],
      [{ ...PRESS, press: { action: 'toString', id: 'q3' } }, 'unknown action toString'],
      [{ ...PRESS, press: { action: 'done' } }, 'done has no id'],
      [{ ...PRESS, press: { action: 'pr-merge', id: 'q3' } }, 'pr-merge has no ref'],
      [{ ...PRESS, holds: { ...PRESS.holds, replies: { q2: 'now' } } }, 'holds without replies or discarded times'],
      [{ ...PRESS, holds: { ...PRESS.holds, shownSince: undefined } }, 'holds without shownSince'],
      [[PRESS], 'not an object'],
    ]
    for (const [file, reason] of refused) expect(pressFile(JSON.stringify(file))).toEqual({ ok: false, reason })
    expect(pressFile('{"format":1,')).toEqual({ ok: false, reason: 'not JSON' })
  })
})
