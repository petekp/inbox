import { describe, expect, test } from 'claude-code/testing'
import { UNSTARTABLE_CODE } from '../hooks/gh'
import type { Run } from '../hooks/gh'
import { CLEARED_TOKENS, herdrEnvelope, herdrLabels, herdrReporter, herdrTarget } from '../hooks/herdr'
import { pressFile } from '../hooks/herdr-press-file'
import type { EnvelopeSource } from '../hooks/herdr'
import { publishSession } from '../hooks/herdr-app'
import type { PublishFiles } from '../hooks/herdr-app'
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
    expect(herdrTarget({ HC_TERMINAL_ID: 't1', HOME: '/home/person' })).toEqual({
      kind: 'terminal',
      terminal: 't1',
      appHome: '/home/person/.config/herdr-app',
      hc: ['hc', '/home/person/.local/bin/hc'],
    })
    expect(herdrTarget({ HC_TERMINAL_ID: 't1', HERDR_APP_HOME: '/app' })).toMatchObject({ appHome: '/app', hc: ['hc'] })
    expect(herdrTarget({ HERDR_PANE_ID: '', HC_TERMINAL_ID: '' })).toBeNull()
  })

  test('an app home that is not an absolute path is none', () => {
    expect(herdrTarget({ HC_TERMINAL_ID: 't1', HERDR_APP_HOME: 'app', HOME: '/home/person' })).toMatchObject({
      appHome: null,
    })
    expect(herdrTarget({ HC_TERMINAL_ID: 't1', HOME: 'person' })).toMatchObject({ appHome: null, hc: ['hc'] })
  })
})

describe('publishSession', () => {
  test('a write that fails partway leaves no temporary file and rejects', async () => {
    const files: Record<string, string> = {}
    const publishFiles: PublishFiles = {
      write: async path => {
        files[path] = '{"format":1,'
        throw new Error('disk full')
      },
      move: async () => undefined,
      removeFolder: async () => undefined,
      remove: async path => {
        delete files[path]
      },
    }

    const failure = await publishSession(publishFiles, '/app', SOURCE, emptySession(), () => undefined).catch(
      (err: Error) => err.message,
    )
    expect(failure).toBe('disk full')
    expect(files).toEqual({})
  })
})

describe('herdrReporter', () => {
  test('logs why a report failed once, until one is taken or it fails another way', async () => {
    const target = herdrTarget({ HC_TERMINAL_ID: 't1', HOME: '/home/person' })!
    let code = UNSTARTABLE_CODE
    const run: Run = async () => ({ code, stdout: '', stderr: code === 1 ? 'no socket' : '' })
    const logged: string[] = []
    const report = herdrReporter(text => logged.push(text))
    const send = (inbox: string) => report(run, async () => ({ target, tokens: { inbox }, session: 's1' }))

    await send('a')
    await send('b')
    code = 1
    await send('c')
    code = 0
    await send('d')
    code = UNSTARTABLE_CODE
    await send('e')

    expect(logged).toEqual([
      'Herdr labels not set: no hc started. Tried hc, then /home/person/.local/bin/hc.',
      'Herdr report failed with exit 1: no socket',
      'Herdr labels not set: no hc started. Tried hc, then /home/person/.local/bin/hc.',
    ])
  })

  test('labels an app terminal with hc from PATH, else from ~/.local/bin, and keeps the one that started', async () => {
    const ran: string[][] = []
    const run: Run = async args => {
      ran.push(args)
      return { code: args[0] === 'hc' ? UNSTARTABLE_CODE : 0, stdout: '', stderr: '' }
    }
    const target = herdrTarget({ HC_TERMINAL_ID: 't1', HOME: '/home/person' })!
    const report = herdrReporter()

    expect(await report(run, async () => ({ target, tokens: { inbox: 'Ship\nit?' }, session: 's1' }))).toBe(true)
    expect(await report(run, async () => ({ target, tokens: { inbox: null }, session: null }))).toBe(true)
    expect(ran).toEqual([
      ['hc', 'label', 't1', 'inbox.session=s1', 'inbox.status=Ship it?'],
      ['/home/person/.local/bin/hc', 'label', 't1', 'inbox.session=s1', 'inbox.status=Ship it?'],
      ['/home/person/.local/bin/hc', 'label', 't1', 'inbox.session=', 'inbox.status='],
    ])
  })
})

describe('herdrLabels', () => {
  test('each token becomes an inbox. label, and a cleared token an empty value', () => {
    expect(herdrLabels({ ...CLEARED_TOKENS, inbox: '2 · Ship it?', 'inbox-needs-you': '2' })).toEqual({
      'inbox.status': '2 · Ship it?',
      'inbox.stop': '',
      'inbox.focus': '',
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

  test('carries the project folder only when it is an absolute path', () => {
    const folderOf = (projectFolder: string) =>
      herdrEnvelope({ ...SOURCE, projectFolder }, emptySession()).projectFolder

    expect([folderOf('/work/app'), folderOf('work/app'), folderOf('')]).toEqual(['/work/app', undefined, undefined])
  })
})

describe('pressFile', () => {
  test('a press file reads back with its press and holds, and no list use holding a row', () => {
    const read = (file: object) => ({ ok: true, file: { ...file, holds: { ...PRESS.holds, listInput: null } } })
    expect(pressFile(JSON.stringify(PRESS))).toEqual(read(PRESS))
    const rankAgain = { ...PRESS, press: { action: 'pr-rank-again' } }
    expect(pressFile(JSON.stringify(rankAgain))).toEqual(read(rankAgain))
    for (const error of [null, 'no browser']) {
      const opened = { ...PRESS, result: { error } }
      expect(pressFile(JSON.stringify(opened))).toEqual(read(opened))
    }
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
      [{ ...PRESS, result: { error: 3 } }, 'result without error'],
      [{ ...PRESS, result: null }, 'result without error'],
    ]
    for (const [file, reason] of refused) expect(pressFile(JSON.stringify(file))).toEqual({ ok: false, reason })
    expect(pressFile('{"format":1,')).toEqual({ ok: false, reason: 'not JSON' })
  })
})
