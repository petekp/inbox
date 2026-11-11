import { expect, test } from 'bun:test'

import { HERDR_FORMAT } from '../../hooks/herdr'
import { isSessionChange, readSession, sessionPath } from '../src/files'
import { AGENT, demoEnvelopeText } from './fixtures'

test('a published session reads back with its source and its rows', () => {
  const read = readSession(demoEnvelopeText())
  if (read.is !== 'read') throw new Error(`read as ${read.is}`)
  expect(read.envelope).toMatchObject({ host: 'claude-code', agent: AGENT, sessionId: 's1', terminal: 't1' })
  expect(read.session.ledger.items.length).toBeGreaterThan(0)
  expect(read.isTrimmed).toBe(false)
  expect(read.lastPress).toBeNull()
  expect(read.projectFolder).toBeNull()
})

test('a session the host trimmed to fit reads as trimmed', () => {
  const read = readSession(demoEnvelopeText({ trimmed: true }))
  expect(read.is === 'read' && read.isTrimmed).toBe(true)
})

test('the project folder reads back when absolute, and a relative one reads as none', () => {
  const read = readSession(demoEnvelopeText({ projectFolder: '/work/app' }))
  expect(read.is === 'read' && read.projectFolder).toBe('/work/app')
  const relative = readSession(demoEnvelopeText({ projectFolder: 'work/app' }))
  expect(relative.is === 'read' && relative.projectFolder).toBeNull()
})

test('the host’s last press reads back, and one in an unknown shape reads as none', () => {
  const lastPress = { id: 'p1', outcome: 'stale' } as const
  const read = readSession(demoEnvelopeText({ lastPress }))
  expect(read.is === 'read' && read.lastPress).toEqual(lastPress)
  const odd = readSession(demoEnvelopeText({ lastPress: { id: 'p1', outcome: 'lost' } }))
  expect(odd.is === 'read' && odd.lastPress).toBeNull()
})

test('the file of a session lives under the app home’s inbox folder, named by its id', () => {
  expect(sessionPath('/home/app', 's1')).toBe('/home/app/inbox/sessions/s1.json')
})

test('no file reads as missing, and a file cut off mid-write reads as torn', () => {
  expect(readSession(null)).toEqual({ is: 'missing' })
  expect(readSession(demoEnvelopeText().slice(0, 40))).toEqual({ is: 'torn' })
})

test('a file from a newer host says its format, so the look can ask for an update', () => {
  expect(readSession(demoEnvelopeText({ format: HERDR_FORMAT + 1 }))).toEqual({ is: 'newer', format: HERDR_FORMAT + 1 })
})

test('a file without its source or its session is refused with the field it lacks', () => {
  expect(readSession(demoEnvelopeText({ agent: '' }))).toEqual({ is: 'refused', reason: 'no agent' })
  expect(readSession(demoEnvelopeText({ session: null }))).toEqual({ is: 'refused', reason: 'no session' })
  expect(readSession('[]')).toEqual({ is: 'refused', reason: 'not an object' })
  expect(readSession(demoEnvelopeText({ format: 0 }))).toEqual({ is: 'refused', reason: 'unknown format 0' })
})

test('the session rereads on a change to its own file or the whole folder, not on a host’s temporary file', () => {
  const folder = '/home/app/inbox/sessions'
  expect(isSessionChange([`${folder}/s1.json`], '/home/app', 's1')).toBe(true)
  expect(isSessionChange([folder], '/home/app', 's1')).toBe(true)
  expect(isSessionChange([`${folder}/s1.json.1731240000000-a1b2.tmp`], '/home/app', 's1')).toBe(false)
  expect(isSessionChange([`${folder}/s2.json`], '/home/app', 's1')).toBe(false)
})
