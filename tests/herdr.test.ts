import { describe, expect } from 'claude-code/testing'
import { test } from './test-with-timeout'
import { UNSTARTABLE_CODE } from '../core/domain/gh'
import type { Run } from '../core/domain/gh'
import { CLEARED_TOKENS, herdrLabels, herdrReporter, herdrTarget } from '../core/remote/herdr'
import { herdrEnvelope } from '../core/remote/herdr-envelope'
import { pressFile } from '../core/remote/herdr-press-file'
import type { HerdrFile } from '../core/remote/herdr-press-file'
import { memoryViewerStores } from '../core/runtime/remote-viewers'
import type { EnvelopeSource } from '../core/remote/herdr-envelope'
import { publishSession, startHerdrFile } from '../core/remote/herdr-app'
import type { HerdrFileHost, PublishFiles } from '../core/remote/herdr-app'
import type { Session } from '../types'
import { emptySession } from '../core/view/session-files'

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
      herdrApp: ['herdr-app', '/home/person/.local/bin/herdr-app'],
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
  test('keeps presentation state and omits private command and viewer records and the inbox model’s last answers', () => {
    const session = emptySession()
    const {
      remoteCommands: _commands,
      remoteCommandFloor: _floor,
      commandWrite: _write,
      lastAnswers: _answers,
      ...presentation
    } = session
    const hostState = { ...session, herdrReport: { seq: 4 }, revision: 9 }

    expect(JSON.parse(JSON.stringify(herdrEnvelope(SOURCE, hostState)))).toEqual({
      format: 1,
      ...SOURCE,
      session: JSON.parse(JSON.stringify(presentation)),
    })
  })

  test('carries the project folder only when it is an absolute path', () => {
    const folderOf = (projectFolder: string) =>
      herdrEnvelope({ ...SOURCE, projectFolder }, emptySession()).projectFolder

    expect([folderOf('/work/app'), folderOf('work/app'), folderOf('')]).toEqual(['/work/app', undefined, undefined])
  })

  test('says a PR fetch runs only while one does, beside the session, which it leaves as it is', () => {
    const session = emptySession()
    const fetching = herdrEnvelope({ ...SOURCE, isFetchingPrs: true }, session)
    const idle = herdrEnvelope({ ...SOURCE, isFetchingPrs: false }, session)

    expect(fetching.isFetchingPrs).toBe(true)
    expect('isFetchingPrs' in idle).toBe(false)
    expect(fetching.session).toEqual(idle.session)
  })

  test('says Claude Code holds the inbox messages only while it does', () => {
    const held = herdrEnvelope({ ...SOURCE, isSendHeld: true }, emptySession())
    const free = herdrEnvelope({ ...SOURCE, isSendHeld: false }, emptySession())

    expect(held.isSendHeld).toBe(true)
    expect('isSendHeld' in free).toBe(false)
  })
})

describe('pressFile', () => {
  test('a press file reads back with its press and holds, and no list use when the look reported none', () => {
    const read = (file: object) => ({ ok: true, file: { ...file, holds: { ...PRESS.holds, listInput: null } } })
    expect(pressFile(JSON.stringify(PRESS))).toEqual(read(PRESS))
    for (const action of ['pr-rank-again', 'pr-clear-finished']) {
      const tabPress = { ...PRESS, press: { action } }
      expect(pressFile(JSON.stringify(tabPress))).toEqual(read(tabPress))
    }
    for (const error of [null, 'no browser']) {
      const opened = { ...PRESS, result: { error } }
      expect(pressFile(JSON.stringify(opened))).toEqual(read(opened))
    }
    const checked = {
      ...PRESS,
      when: [
        { kind: 'row-version', row: 'q3', version: 'a1' },
        { kind: 'expires-at', at: 99 },
      ],
    }
    expect(pressFile(JSON.stringify(checked))).toEqual(read(checked))
  })

  test('the list use a press file reports is kept, and a malformed one reads as none', () => {
    const withInput = (listInput: unknown) =>
      pressFile(JSON.stringify({ ...PRESS, holds: { ...PRESS.holds, listInput } }))
    const listInputOf = (read: ReturnType<typeof pressFile>) =>
      read.ok && 'holds' in read.file ? read.file.holds.listInput : 'refused'
    expect(listInputOf(withInput({ since: 5, last: 9 }))).toEqual({ since: 5, last: 9 })
    for (const bad of [{ since: 5 }, { since: '5', last: 9 }, 'now', null])
      expect(listInputOf(withInput(bad))).toBeNull()
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
      [{ ...PRESS, when: 'now' }, 'when is not a list of known checks'],
      [{ ...PRESS, when: [{ kind: 'row-version', row: 'q3' }] }, 'when is not a list of known checks'],
      [{ ...PRESS, when: [{ kind: 'launch-at', at: 99 }] }, 'when is not a list of known checks'],
    ]
    for (const [file, reason] of refused) expect(pressFile(JSON.stringify(file))).toEqual({ ok: false, reason })
    expect(pressFile('{"format":1,')).toEqual({ ok: false, reason: 'not JSON' })
  })
})

describe('a report that the Herdr look shows the PRs tab', () => {
  const REPORT = { format: 1, id: 'r1', prsShown: { at: 10 } }

  test('is read, and refused without a time', () => {
    expect(pressFile(JSON.stringify(REPORT))).toEqual({ ok: true, file: REPORT })
    expect(pressFile(JSON.stringify({ ...REPORT, prsShown: {} }))).toEqual({
      ok: false,
      reason: 'prsShown without a time',
    })
  })

  test('makes the host read the session’s PRs if they are due, and changes nothing else', async () => {
    let refreshes = 0
    let updates = 0
    const host = {
      update: async () => void (updates += 1),
      refreshPrsIfDue: async () => void (refreshes += 1),
    } as unknown as HerdrFileHost<Session>
    const file = pressFile(JSON.stringify(REPORT))
    if (!file.ok) throw new Error(file.reason)

    await startHerdrFile(host, file.file, 's1')

    expect([refreshes, updates]).toEqual([1, 0])
  })
})

describe('a viewer heartbeat from the Herdr look', () => {
  const HEARTBEAT: HerdrFile = {
    format: 2,
    kind: 'viewer',
    id: 'viewer-1',
    session: 's1',
    issuedAt: 1_000,
    generation: 1,
    sequence: 1,
    active: true,
    replies: ['q1'],
    tab: 'needsYou',
    shownRows: [],
    listActive: false,
  }

  test('keeps its lease in the viewer store, republishes once, and saves nothing to the session', async () => {
    let updates = 0
    let republished = 0
    const store = memoryViewerStores()
    const host = {
      now: async () => 1_000,
      update: async () => void (updates += 1),
      viewers: store.of('s1', () => void (republished += 1)),
    } as unknown as HerdrFileHost<Session>

    await startHerdrFile(host, HEARTBEAT, 's1')
    await startHerdrFile(host, HEARTBEAT, 's1')

    expect([updates, republished]).toEqual([0, 1])
    expect(Object.keys(store.peek('s1'))).toEqual(['viewer-1'])
  })
})
