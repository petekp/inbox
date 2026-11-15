import { expect, test } from 'bun:test'

import { HERDR_FORMAT } from '../../hooks/herdr'
import { collapsedRows } from '../../hooks/collapse'
import { withCollapses, writeCollapse } from '../src/collapse'
import { isSessionChange, readSession } from '../src/files'
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

test('a session from a host that saves no collapsed rows reads with none collapsed, and a collapse made in the look stays drawn past the wait with no file written', async () => {
  const { session, ...envelope } = JSON.parse(demoEnvelopeText())
  const { collapsed: _collapsed, ...older } = session
  const read = readSession(JSON.stringify({ ...envelope, session: older }))
  if (read.is !== 'read') throw new Error(`read as ${read.is}`)
  expect(read.session.collapsed).toEqual({})
  const row = read.session.ledger.items[0]!.id
  const collapse = { isCollapsed: true, at: 1_000 }

  const later = withCollapses(read, { [row]: collapse }, collapse.at + 60 * 60_000)
  expect(later.collapses).toEqual({ [row]: collapse })
  expect(later.read?.is === 'read' && collapsedRows(later.read.session)).toEqual([row])
  const written: string[] = []
  const io = { random: () => 0.5, write: async (path: string) => (written.push(path), null), wake: async () => {} }
  await writeCollapse(io, { appHome: '/app', sessionId: 's1' }, read, row, collapse)
  expect(written).toEqual([])
})

test('a collapse made in the look for a host that saves collapses is written, and stops being drawn once the wait passes unpublished', async () => {
  const read = readSession(demoEnvelopeText())
  if (read.is !== 'read') throw new Error(`read as ${read.is}`)
  const row = read.session.ledger.items[0]!.id
  const collapse = { isCollapsed: true, at: 1_000 }

  expect(withCollapses(read, { [row]: collapse }, collapse.at + 1).collapses).toEqual({ [row]: collapse })
  const later = withCollapses(read, { [row]: collapse }, collapse.at + 60 * 60_000)
  expect(later.collapses).toEqual({})
  expect(later.read?.is === 'read' && collapsedRows(later.read.session)).toEqual([])
  const written: string[] = []
  const io = { random: () => 0.5, write: async (path: string) => (written.push(path), null), wake: async () => {} }
  await writeCollapse(io, { appHome: '/app', sessionId: 's1' }, read, row, collapse)
  expect(written.length).toBe(1)
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
