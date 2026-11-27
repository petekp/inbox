import { loadSavedNavigation, storeNavigation } from '../client-navigation'
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { loadCachedInbox, loadCachedDirectory } from '../client-cache'
import { startFixture } from './fixture-server'
import type { Result, Storage } from '../app.contract'

let root = '',
  origin = '',
  session = ''
let view: Result<'loadInbox'>
let stopFixture = async () => {}
beforeAll(async () => {
  const fixture = await startFixture()
  ;({ root, origin, session, view } = fixture)
  stopFixture = fixture.stop
})
afterAll(() => stopFixture())

test('saved views survive restart as read-only and never cross host or session boundaries', async () => {
  const cacheFile = join(root, 'client-views.json')
  const storage = () =>
    ({
      fs: {
        readFile: async () => new Uint8Array(await readFile(cacheFile)).buffer,
        atomicWriteFile: async (_uri: string, bytes: Uint8Array) => writeFile(cacheFile, bytes),
      },
    }) as unknown as Storage
  const live = { ...view, connected: true, readOnly: false, connectionState: 'connected' }
  const unavailable = async () => {
    throw new Error('Offline')
  }
  expect(await loadCachedInbox(storage(), origin, session, async () => live)).toEqual(live)
  const restored = await loadCachedInbox(storage(), origin, session, unavailable)
  expect(restored.asks).toEqual(live.asks)
  expect(restored).toMatchObject({ key: session, connected: false, readOnly: true, fresh: false, running: false })
  await expect(loadCachedInbox(storage(), origin + '/another-host', session, unavailable)).rejects.toThrow('Offline')
  await expect(loadCachedInbox(storage(), origin, 'f'.repeat(64), unavailable)).rejects.toThrow('Offline')
  const directory = await (await fetch(origin + '/api/sessions')).json()
  await loadCachedDirectory(storage(), origin, async () => directory)
  const sessions = await loadCachedDirectory(storage(), origin, unavailable)
  expect(sessions.entries.map(entry => entry.id)).toEqual(directory.entries.map((entry: { id: string }) => entry.id))
  expect(sessions.entries.every(entry => !entry.fresh && entry.readOnly && entry.state === 'disconnected')).toBe(true)
  const reopened = { ...live, name: 'Reconnected session', rowVersion: 'new-view' }
  expect(await loadCachedInbox(storage(), origin, session, async () => reopened)).toEqual(reopened)
  expect((await loadCachedInbox(storage(), origin, session, unavailable)).name).toBe('Reconnected session')
  const denied = async () => {
    throw Object.assign(new Error('Access refused'), { status: 403 })
  }
  await expect(loadCachedInbox(storage(), origin, session, denied)).rejects.toThrow('Access refused')
  await expect(loadCachedDirectory(storage(), origin, denied)).rejects.toThrow('Access refused')
  const incompatible = await loadCachedInbox(storage(), origin, session, async () => {
    throw Object.assign(new Error('Method not allowed'), { status: 405 })
  })
  expect(incompatible).toMatchObject({ connected: false, readOnly: true })
  expect(incompatible.asks).toEqual(reopened.asks)
  expect(incompatible.failure).toContain('helper on your Mac is older')
  await expect(
    loadCachedInbox(storage(), origin + '/fresh-install', session, async () => {
      throw Object.assign(new Error('Method not allowed'), { status: 405 })
    }),
  ).rejects.toMatchObject({ reason: 'helper-version' })
  const shared = storage()
  let release!: (value: unknown) => void
  const older = loadCachedInbox(
    shared,
    origin,
    session,
    () =>
      new Promise(resolve => {
        release = resolve
      }),
  )
  await loadCachedInbox(shared, origin, session, async () => reopened)
  release(live)
  await older
  expect((await loadCachedInbox(storage(), origin, session, unavailable)).name).toBe('Reconnected session')
  const oversized = { ...directory, error: 'x'.repeat(4 * 1024 * 1024) }
  await loadCachedDirectory(shared, origin, async () => oversized)
  expect((await loadCachedInbox(shared, origin, session, unavailable)).name).toBe('Reconnected session')
  expect((await loadCachedDirectory(shared, origin, unavailable)).error.length).toBeLessThan(1000)
  await writeFile(cacheFile, '{broken')
  await expect(loadCachedInbox(storage(), origin, session, unavailable)).rejects.toThrow('Offline')
})

test('an upgrade leaves the removed demo for the previous real session without losing its place', async () => {
  const storage = {
    fs: {
      readFile: async (uri: string) => new Uint8Array(await readFile(join(root, uri.split('/').at(-1)!))).buffer,
      atomicWriteFile: async (uri: string, bytes: Uint8Array) => writeFile(join(root, uri.split('/').at(-1)!), bytes),
    },
  } as unknown as Storage
  const real = {
    id: session,
    name: 'Real session',
    tab: 'prs',
    asksExpanded: 'i1',
    findsExpanded: '',
    reply: session + ':i1',
    asksTop: 40,
    findsTop: 0,
    statusTop: 0,
    prsTop: 75,
    folds: ['closed'],
    options: [],
    earlier: [],
    collapsed: [],
  }
  const sample = {
    ...real,
    id: 'f'.repeat(64),
    name: 'Sample Inbox',
    tab: 'asks',
    sample: true,
    returnSession: session,
  }
  const saved = { selected: sample.id, search: '', tab: 'asks', listTop: 20, places: [real, sample] }
  const path = join(root, 'navigation-v2.json')
  await writeFile(path, JSON.stringify(saved))
  const restored = await loadSavedNavigation(storage)
  expect(restored).toMatchObject({ selected: session, tab: 'prs', listTop: 20, places: [real] })
  await storeNavigation(storage, restored)
  expect(await loadSavedNavigation(storage)).toEqual(restored)
  await writeFile(path, JSON.stringify({ ...saved, places: [sample] }))
  expect(await loadSavedNavigation(storage)).toMatchObject({ selected: '', tab: 'sessions', places: [] })
})

test('recovery never publishes a reply the helper did not previously accept', async () => {
  const row = view.asks.find(row => row.allActions.some(action => action.command === 'reply'))!
  const action = row.allActions.find(action => action.command === 'reply')!
  const before = JSON.parse(await readFile(join(root, 'state.json'), 'utf8')).remoteCommands
  const operation = '7'.repeat(32)
  const body = { session, key: action.key, text: 'Unsent reply', operation, shownSince: 0 }
  const recover = await fetch(origin + '/api/press', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, recover: true }),
  })
  const receipt = await recover.json()
  expect(receipt).toMatchObject({ ok: false, state: 'refused' })
  expect(receipt.error).toContain('not sent')
  const late = await fetch(origin + '/api/press', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  expect(await late.json()).toEqual(receipt)
  expect(await (await fetch(origin + '/api/receipt?id=' + receipt.id)).json()).toEqual(receipt)
  expect(JSON.parse(await readFile(join(root, 'state.json'), 'utf8')).remoteCommands).toEqual(before)
  const edited = await fetch(origin + '/api/press', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, operation: '8'.repeat(32), text: 'A deliberate new reply' }),
  })
  expect((await edited.json()).state).toBe('submitted')
})

test('a missing session has a durable final refusal instead of an unconfirmed send', async () => {
  const body = { session: 'e'.repeat(64), key: 'f'.repeat(64), text: '', operation: '9'.repeat(32), shownSince: 0 }
  const response = await fetch(origin + '/api/press', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const receipt = await response.json()
  expect(response.status).toBe(200)
  expect(receipt).toMatchObject({ ok: false, state: 'refused' })
  expect(await (await fetch(origin + '/api/receipt?id=' + receipt.id)).json()).toEqual(receipt)
})

test('a known local session can accept a press while unrelated discovery is stalled', async () => {
  const fixture = await startFixture()
  const release = join(fixture.root, 'release-discovery')
  let discovery: Promise<Response> | undefined
  let sending: Promise<Result<'press'>> | undefined
  try {
    const hc = join(fixture.root, 'bin', 'hc')
    const entered = join(fixture.root, 'discovery-entered')
    const script = await readFile(hc, 'utf8')
    const wait = `if(r.method==='machine.list'){await Bun.write(${JSON.stringify(entered)},'waiting');while(!await Bun.file(${JSON.stringify(release)}).exists())await Bun.sleep(10);}`
    await writeFile(hc, script.replace('const result=', wait + 'const result='))
    discovery = fetch(fixture.origin + '/api/sessions')
    for (
      let i = 0;
      i < 200 &&
      !(await access(entered).then(
        () => true,
        () => false,
      ));
      i++
    )
      await Bun.sleep(10)
    expect(
      await access(entered).then(
        () => true,
        () => false,
      ),
    ).toBe(true)
    const action = fixture.view.asks.flatMap(row => row.allActions).find(action => action.label === 'Explain')!
    sending = fetch(fixture.origin + '/api/press', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        session: fixture.session,
        key: action.key,
        text: '',
        operation: '6'.repeat(32),
        shownSince: 0,
      }),
    }).then(response => response.json())
    const result = await Promise.race([sending, Bun.sleep(3000).then(() => ({ state: 'blocked-on-discovery' }))])
    expect(result.state).toBe('submitted')
  } finally {
    await writeFile(release, 'continue')
    await discovery
    await sending?.catch(() => undefined)
    await fixture.stop()
  }
})

test('a deliberate legacy retry can replace a refusal without replaying during recovery', async () => {
  const fixture = await startFixture({ protocol: '1' })
  try {
    const action = fixture.view.asks.flatMap(row => row.allActions).find(action => action.label === 'Explain')!
    const body = { session: fixture.session, key: action.key, text: '', shownSince: 0 }
    const send = async (recover: boolean) =>
      (
        await fetch(fixture.origin + '/api/press', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...body, recover }),
        })
      ).json()
    const refused = await send(true)
    expect(refused.state).toBe('refused')
    expect(await send(true)).toEqual(refused)
    const retry = await send(false)
    expect(retry).toMatchObject({ state: 'submitted' })
  } finally {
    await fixture.stop()
  }
})
