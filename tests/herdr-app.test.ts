import { describe, expect, test } from 'claude-code/testing'
import type { EnvelopeSource } from '../hooks/herdr'
import { pressDrainer, publishedText, PUBLISH_LIMIT_BYTES } from '../hooks/herdr-app'
import type { PressFiles } from '../hooks/herdr-app'
import { emptySession } from '../hooks/session-files'
import type { Closed } from '../types'

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
    const envelope = JSON.parse(publishedText(SOURCE, session))

    expect(envelope.trimmed).toBeUndefined()
    expect(envelope.session.ledger.closed).toHaveLength(1)
  })

  test('a session over the limit leaves out the closed items no row draws in place, and says it trimmed', () => {
    const long = 'x'.repeat(1000)
    const folded = Array.from({ length: 1100 }, (_, i) => closed(`c${i}`, 50, long))
    const ledger = { ...emptySession().ledger, closed: [...folded, closed('kept', 200)] }
    const session = { ...emptySession(), ledger, shownSince: 100 }
    const text = publishedText(SOURCE, session)
    const envelope = JSON.parse(text)

    expect(JSON.stringify({ session }).length).toBeGreaterThan(PUBLISH_LIMIT_BYTES)
    expect(text.length).toBeLessThan(PUBLISH_LIMIT_BYTES)
    expect(envelope.trimmed).toBe(true)
    expect(envelope.session.ledger.closed.map((c: Closed) => c.id)).toEqual(['kept'])
  })
})

describe('pressDrainer', () => {
  const pressText = (id: string, pressedAt: number) =>
    JSON.stringify({ format: 1, id, pressedAt, press: { action: 'done', id: `i-${id}` }, holds: HOLDS })

  function folder(files: Record<string, string>): PressFiles {
    return {
      list: async path =>
        Object.keys(files).flatMap(name => (name.startsWith(`${path}/`) ? [name.slice(path.length + 1)] : [])),
      read: async path => files[path] ?? Promise.reject(new Error('ENOENT')),
      remove: async path => {
        delete files[path]
      },
    }
  }

  test('applies presses oldest first and removes each, and removes a file it refuses with the reason logged', async () => {
    const dir = '/app/inbox/presses/s1'
    const files = {
      [`${dir}/a.json`]: pressText('late', 20),
      [`${dir}/b.json`]: pressText('early', 10),
      [`${dir}/c.json`]: '{"format":2}',
      [`${dir}/d.json.tmp`]: pressText('partial', 5),
    }
    const applied: string[] = []
    const logged: string[] = []
    const drain = pressDrainer(
      folder(files),
      async (_id, file) => {
        applied.push(file.id)
        return true
      },
      text => logged.push(text),
    )

    await drain('/app', 's1')

    expect(applied).toEqual(['early', 'late'])
    expect(Object.keys(files)).toEqual([`${dir}/d.json.tmp`])
    expect(logged).toEqual(['Herdr press c.json refused: unknown format 2'])
  })

  test('a press the host does not take stays for a later drain, and a press it took is not applied twice', async () => {
    const dir = '/app/inbox/presses/s1'
    const files: Record<string, string> = { [`${dir}/a.json`]: pressText('p1', 10) }
    let isTaking = false
    const applied: string[] = []
    const drain = pressDrainer(
      folder(files),
      async (_id, file) => {
        if (isTaking) applied.push(file.id)
        return isTaking
      },
      () => undefined,
    )

    await drain('/app', 's1')
    expect(Object.keys(files)).toEqual([`${dir}/a.json`])

    isTaking = true
    await drain('/app', 's1')
    files[`${dir}/a.json`] = pressText('p1', 10)
    await drain('/app', 's1')

    expect(applied).toEqual(['p1'])
    expect(files).toEqual({})
  })
})
