import type { Timer } from 'claude-code'
import { describe, expect } from 'claude-code/testing'
import { test } from './test-with-timeout'
import type { EnvelopeSource } from '../core/remote/herdr-envelope'
import { pressDrainer, publishedText, PUBLISH_LIMIT_BYTES, startedFile, startHerdrFile } from '../core/remote/herdr-app'
import type { PressFiles } from '../core/remote/herdr-app'
import { listenForHerdrPresses } from '../hooks/mod/mod-herdr'
import type { HerdrCalls } from '../hooks/mod/mod-herdr'
import { CLAUDE_CODE } from '../core/domain/model-text'
import { emptySession } from '../core/view/session-files'
import { recorded } from '../core/runtime/session-presses'
import { TOOL_FIELDS } from '../core/domain/tool-schemas'
import type { Closed, Session } from '../types'
import { fakeHost } from './session-fake-host'
import { memoryViewerStores } from '../core/runtime/remote-viewers'
import { remoteRowVersion } from '../core/remote/remote-commands'
import type { RemoteCommand } from '../core/remote/remote-commands'
import { remoteReceipts } from '../core/runtime/remote-command-state'
import { memoryCommandStore } from './memory-command-store'

const SOURCE: EnvelopeSource = { host: 'omp', agent: 'omp', sessionId: 's1', terminal: 't1', writtenAt: 5 }

const HOLDS = { replies: {}, discarded: {}, shownSince: null }

const closed = (id: string, at: number, ask = 'Ship it?'): Closed => ({
  id,
  kind: 'question',
  ask,
  outcome: 'yes',
  how: 'answered',
  at,
})

describe('publishedText', () => {
  test('a session under the limit is published whole, without trimmed', () => {
    const session = { ...emptySession(), ledger: { ...emptySession().ledger, closed: [closed('c1', 50)] } }
    const envelope = JSON.parse(publishedText(SOURCE, session, () => undefined))

    expect(envelope.trimmed).toBeUndefined()
    expect(envelope.session.ledger.closed).toHaveLength(1)
  })

  test('a session over the limit leaves out the closed items no row draws in place, and says it trimmed', () => {
    const long = 'x'.repeat(1000)
    const folded = Array.from({ length: 1100 }, (_, i) => closed(`c${i}`, 50, long))
    const ledger = { ...emptySession().ledger, closed: [...folded, closed('kept', 200)] }
    const session = { ...emptySession(), ledger, shownSince: 100 }
    const text = publishedText(SOURCE, session, () => undefined)
    const envelope = JSON.parse(text)

    expect(JSON.stringify({ session }).length).toBeGreaterThan(PUBLISH_LIMIT_BYTES)
    expect(text.length).toBeLessThan(PUBLISH_LIMIT_BYTES)
    expect(envelope.trimmed).toBe(true)
    expect(envelope.session.ledger.closed.map((c: Closed) => c.id)).toEqual(['kept'])
  })
})

test('a session still over the limit after trimming is published whole and logged', () => {
  const long = 'x'.repeat(1000)
  const ledger = {
    ...emptySession().ledger,
    closed: Array.from({ length: 1100 }, (_, i) => closed(`c${i}`, 200, long)),
  }
  const logged: string[] = []
  const text = publishedText(SOURCE, { ...emptySession(), ledger, shownSince: 100 }, line => logged.push(line))

  expect(JSON.parse(text).session.ledger.closed).toHaveLength(1100)
  expect(logged).toEqual([
    `Herdr publish is over ${PUBLISH_LIMIT_BYTES} bytes after trimming, so the look cannot read it`,
  ])
})

describe('pressDrainer', () => {
  const dir = '/app/inbox/presses/s1'
  const pressText = (id: string, pressedAt: number, action = 'done') =>
    JSON.stringify({ format: 1, id, pressedAt, press: { action, id: `i-${id}` }, holds: HOLDS })
  const owned = async () => true
  const DONE = { waiting: null }

  function folder(files: Record<string, string>, unreadable: string[] = []): PressFiles {
    return {
      list: async path =>
        Object.keys(files).flatMap(name => (name.startsWith(`${path}/`) ? [name.slice(path.length + 1)] : [])),
      read: async path =>
        unreadable.some(name => path.startsWith(`${dir}/${name}`))
          ? Promise.reject(new Error('not a file'))
          : (files[path] ?? Promise.reject(new Error('ENOENT'))),
      move: async (from, to) => {
        if (!(from in files)) throw new Error('ENOENT')
        files[to] = files[from]!
        delete files[from]
      },
      remove: async path => {
        delete files[path]
      },
    }
  }

  test('applies presses oldest first and removes each, and removes a file it refuses with the reason logged', async () => {
    const files = {
      [`${dir}/a.json`]: pressText('late', 20),
      [`${dir}/b.json`]: pressText('early', 10),
      [`${dir}/c.json`]: '{"format":2}',
      [`${dir}/d.json.tmp`]: pressText('partial', 5),
      [`${dir}/e.json`]: pressText('wide', 1, 'x'.repeat(500)),
      [`${dir}/f.json`]: pressText('fifo', 1),
    }
    const applied: string[] = []
    const logged: string[] = []
    const drain = pressDrainer(
      folder(files, ['f.json']),
      owned,
      async (_id, file) => {
        applied.push(file.id)
        return DONE
      },
      text => logged.push(text),
    )

    await drain('/app', 's1')

    expect(applied).toEqual(['early', 'late'])
    expect(Object.keys(files)).toEqual([`${dir}/d.json.tmp`])
    expect(logged).toEqual([
      'Herdr press c.json refused: unknown format 2',
      `Herdr press e.json refused: unknown action ${'x'.repeat(84)}…`,
      'Herdr press f.json refused: not read: not a file',
    ])
  })

  test('a look file is applied among the presses by when it ended, and one that ends before it starts is refused', async () => {
    const lookText = (id: string, startedAt: number, endedAt: number) =>
      JSON.stringify({ format: 1, id, look: { startedAt, endedAt, shown: { s1: startedAt }, drawnWrittenAt: endedAt } })
    const files = {
      [`${dir}/a.json`]: pressText('late', 20),
      [`${dir}/b.json`]: lookText('look', 5, 15),
      [`${dir}/c.json`]: pressText('early', 10),
      [`${dir}/d.json`]: lookText('backwards', 15, 5),
    }
    const applied: string[] = []
    const logged: string[] = []
    const drain = pressDrainer(
      folder(files),
      owned,
      async (_id, file) => {
        applied.push(file.id)
        return DONE
      },
      text => logged.push(text),
    )

    await drain('/app', 's1')

    expect(applied).toEqual(['early', 'look', 'late'])
    expect(files).toEqual({})
    expect(logged).toEqual(['Herdr press d.json refused: look ends before it starts'])
  })

  test('a press the host does not take goes back under its name for a later drain', async () => {
    const files: Record<string, string> = { [`${dir}/a.json`]: pressText('p1', 10) }
    let isTaking = false
    const applied: string[] = []
    const drain = pressDrainer(
      folder(files),
      owned,
      async (_id, file) => {
        if (isTaking) applied.push(file.id)
        return isTaking ? DONE : null
      },
      () => undefined,
    )

    await drain('/app', 's1')
    expect(Object.keys(files)).toEqual([`${dir}/a.json`])

    isTaking = true
    await drain('/app', 's1')

    expect(applied).toEqual(['p1'])
    expect(files).toEqual({})
  })

  test('of two processes draining one folder, one applies each press', async () => {
    const files: Record<string, string> = {
      [`${dir}/a.json`]: pressText('p1', 10),
      [`${dir}/b.json`]: pressText('p2', 20),
    }
    const applied: string[] = []
    const process = () =>
      pressDrainer(
        folder(files),
        owned,
        async (_id, file) => {
          applied.push(file.id)
          return DONE
        },
        () => undefined,
      )

    await Promise.all([process()('/app', 's1'), process()('/app', 's1')])

    expect(applied.sort()).toEqual(['p1', 'p2'])
    expect(files).toEqual({})
  })

  const settled = async () => {
    for (let i = 0; i < 200; i++) await Promise.resolve()
  }

  async function pressesDuringTurn(isDeliveryHeldUntilRun: boolean) {
    let endTurn = () => {}
    const turnEnds = new Promise<void>(resolve => {
      endTurn = resolve
    })
    const delivered: string[] = []
    const base = fakeHost(async () => null).host
    const host = {
      ...base,
      viewers: memoryViewerStores().of('s1', () => undefined),
      commands: memoryCommandStore(),
      readDurable: () => base.read(),
      isDeliveryHeldUntilRun,
      deliver: async (_s: Session, text: string) => {
        delivered.push(text)
        await turnEnds
        return { state: 'accepted' as const, queuedId: null }
      },
    }
    for (const ask of ['Sign in to npm', 'Rotate the key'])
      await host.update(s => recorded(CLAUDE_CODE, s, 'record', { kind: 'task', ask }, 1, TOOL_FIELDS, null).state)
    const rows = (await host.read()).ledger.items.map(i => i.id)
    const files: Record<string, string> = {}
    let pressedAt = 0
    const pressRow = (id: string, action: 'explain' | 'discuss', row: number) => {
      pressedAt += 10
      files[`${dir}/${id}.json`] = JSON.stringify({
        format: 1,
        id,
        pressedAt,
        press: { action, id: rows[row - 1] },
        holds: HOLDS,
      })
    }
    const drain = pressDrainer(
      folder(files),
      owned,
      async (id, file) => startedFile(await startHerdrFile(host, file, id), () => undefined),
      () => undefined,
    )
    const isDrained = (draining = drain('/app', 's1')) =>
      Promise.race([draining.then(() => true), settled().then(() => false)])
    const lastPress = async () => (await host.read()).lastHerdrPress?.id

    return { host, rows, delivered, endTurn, files, pressRow, drain, isDrained, lastPress }
  }

  test('a press whose message waits for the agent’s turn is named at once, and the presses after it apply meanwhile and send in order', async () => {
    const turn = await pressesDuringTurn(true)
    turn.pressRow('p1', 'explain', 1)
    expect(await turn.isDrained()).toBe(true)
    expect(await turn.lastPress()).toBe('p1')

    turn.pressRow('p2', 'discuss', 2)
    expect(await turn.isDrained()).toBe(true)
    expect(await turn.lastPress()).toBe('p2')

    turn.pressRow('p3', 'explain', 2)
    expect(await turn.isDrained()).toBe(true)
    await settled()
    expect([await turn.lastPress(), turn.delivered.length, turn.files]).toEqual(['p3', 1, {}])

    turn.endTurn()
    await settled()
    expect([await turn.lastPress(), turn.delivered.map(text => text.includes('Sign in to npm'))]).toEqual([
      'p3',
      [true, false],
    ])
  })

  test('a remote command whose message waits for the agent’s turn holds up no press behind it', async () => {
    const turn = await pressesDuringTurn(true)
    const [row] = turn.rows
    if (!row) throw new Error('The session has no row.')
    const command: RemoteCommand = {
      format: 2,
      kind: 'command',
      id: '1-remote-command-fixture',
      session: 's1',
      issuedAt: 1,
      expected: remoteRowVersion(await turn.host.read(), row),
      press: { action: 'explain', id: row },
    }
    turn.files[`${dir}/c1.json`] = JSON.stringify(command)
    turn.pressRow('p2', 'explain', 2)
    await turn.drain('/app', 's1')
    expect([await turn.lastPress(), turn.files]).toEqual(['p2', {}])

    turn.endTurn()
    await settled()
    expect(remoteReceipts(await turn.host.commands.read())[command.id]?.state).toBe('applied')
    expect(turn.delivered.map(text => text.includes('Sign in to npm'))).toEqual([true, false])
  })

  test('a press whose message the host confirms is applied in the drain and named once the message is delivered', async () => {
    const turn = await pressesDuringTurn(false)
    turn.pressRow('p1', 'explain', 1)
    const draining = turn.drain('/app', 's1')
    expect(await turn.isDrained(draining)).toBe(false)
    expect([await turn.lastPress(), turn.delivered.length]).toEqual([undefined, 1])

    turn.endTurn()
    await draining
    expect([await turn.lastPress(), turn.files]).toEqual(['p1', {}])
  })

  test('a folder whose session this process does not run is left as it is', async () => {
    const files: Record<string, string> = { [`${dir}/a.json`]: pressText('p1', 10) }
    const drain = pressDrainer(
      folder(files),
      async () => false,
      async () => DONE,
      () => undefined,
    )

    await drain('/app', 's1')

    expect(Object.keys(files)).toEqual([`${dir}/a.json`])
  })
})

describe('listenForHerdrPresses', () => {
  const settle = async () => {
    for (let i = 0; i < 50; i++) await Promise.resolve()
  }
  const published = JSON.stringify({ format: 1, host: 'claude-code', terminal: 't1' })

  function stream() {
    const pieces: string[] = []
    let waiting: ((piece: IteratorResult<{ text: string }>) => void) | null = null
    let isEnded = false
    const iterator: AsyncIterator<{ text: string }, unknown> = {
      next: () =>
        pieces.length > 0
          ? Promise.resolve({ done: false, value: { text: pieces.shift()! } })
          : isEnded
            ? Promise.resolve({ done: true, value: undefined })
            : new Promise(resolve => (waiting = resolve)),
      return: async () => {
        isEnded = true
        waiting?.({ done: true, value: undefined })
        return { done: true, value: undefined }
      },
    }
    const print = (text: string) =>
      waiting ? (waiting({ done: false, value: { text } }), (waiting = null)) : pieces.push(text)
    const end = () => {
      isEnded = true
      waiting?.({ done: true, value: undefined })
    }

    return { iterator, print, end }
  }

  function calls(env: (string | undefined)[], streams: Record<string, ReturnType<typeof stream>>) {
    const spawned: string[] = []
    const reads: string[] = []
    const c: HerdrCalls = {
      run: async () => ({ code: 0, stdout: '', stderr: '' }),
      env: async () => env,
      write: async () => undefined,
      read: async path => (path.endsWith('/sessions/s1.json') ? published : Promise.reject(new Error('ENOENT'))),
      list: async folder => {
        reads.push(folder)
        return [{ name: 'p.json', kind: 'file' }]
      },
      stat: async () => ({ kind: 'other', isLink: false }),
      spawn: argv => {
        spawned.push(argv[0]!)
        return streams[argv[0]!]!.iterator
      },
      now: async () => 0,
      after: () => undefined,
      every: () => ({ cancel: () => undefined }) as unknown as Timer,
      log: () => undefined,
      pluginRoot: '/plugin',
    }

    return { c, spawned, reads }
  }

  const label = (terminal: string, value: string) =>
    JSON.stringify({ params: { type: 'labels', terminal, data: { labels: { 'inbox.press': value } } } })

  test("reads the press folder when hc events first prints and when its terminal's press label changes", async () => {
    const events = stream()
    const { c, reads } = calls([undefined, 't1', '/app', undefined], { hc: events })
    const stop = await listenForHerdrPresses(
      c,
      () => 's1',
      async () => null,
    )
    await settle()
    expect(reads).toHaveLength(1)

    events.print('{"channel":"events","seq":0,"terminals":[]}\n')
    await settle()
    expect(reads).toHaveLength(2)

    const line = label('t1', 'p1')
    events.print(line.slice(0, 20))
    await settle()
    events.print(`${line.slice(20)}\n${label('t2', 'p2')}\n${label('t1', 'p1')}\n`)
    await settle()
    expect(reads).toHaveLength(3)

    events.print(`${label('t1', 'p3')}\n`)
    await settle()
    expect(reads).toHaveLength(4)
    stop()
  })

  test('an hc whose events end before printing gives way to the next hc', async () => {
    const empty = stream()
    const next = stream()
    const { c, spawned } = calls([undefined, 't1', '/app', '/home/person'], {
      hc: empty,
      '/home/person/.local/bin/hc': next,
    })
    const stop = await listenForHerdrPresses(
      c,
      () => 's1',
      async () => null,
    )
    empty.end()
    await settle()

    expect(spawned).toEqual(['hc', '/home/person/.local/bin/hc'])
    stop()
  })

  test('outside an app terminal it starts nothing', async () => {
    const { c, spawned, reads } = calls([undefined, undefined, '/app', '/home/person'], {})
    await listenForHerdrPresses(
      c,
      () => 's1',
      async () => null,
    )
    await settle()

    expect([spawned, reads]).toEqual([[], []])
  })
})
