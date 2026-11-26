import { startFixture } from './fixture-server'
import { advanceMotion } from '../tools/motion-rules'
import { advanceSelection } from '../tools/selection-rules'
import { afterAll, beforeAll, expect, test } from 'bun:test'
import { readFile, writeFile, symlink, truncate, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Result } from '../app.contract'
import { formatLocal } from '../tools/client-rules'

let root = '',
  origin = '',
  session = ''
let view: Result<'loadInbox'>
const post = (path: string, body: unknown) =>
  fetch(origin + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

let stopFixture = async () => {}
beforeAll(async () => {
  const fixture = await startFixture()
  ;({ root, origin, session, view } = fixture)
  stopFixture = fixture.stop
})
afterAll(() => stopFixture())

function request(label: string) {
  const row = view.asks.find(row => row.allActions.some(action => action.label === label))!
  const action = row.allActions.find(action => action.label === label)!
  return { session, key: action.key, row: row.id, version: row.version, operation: 'a'.repeat(32) }
}

test('copy and HTTPS preparation returns only the allowed effects for the exact row', async () => {
  for (const [label, kind, value] of [
    ['Copy visor pair', 'copy', 'visor pair'],
    ['Open pairing guide', 'open', 'https://example.com/inbox-check'],
  ] as const) {
    const response = await post('/api/local', request(label!))
    expect(response.status).toBe(200)
    const work = (await response.json()) as Result<'prepareLocal'>
    expect(work.effects.map(effect => ({ kind: effect.kind, value: effect.value }))).toEqual([{ kind, value }])
    expect(work.session).toBe(session)
    expect(work.row).toBe('i14')
  }
})

test('local preparation refuses caller paths, changed versions, and another session', async () => {
  const valid = request('Copy visor pair')
  for (const invalid of [
    { ...valid, path: '/fixture/not-allowed' },
    { ...valid, version: 'row-sha256-v1:' + '0'.repeat(64) },
    { ...valid, session: 'f'.repeat(64) },
  ])
    expect((await post('/api/local', invalid)).status).toBe(400)
})

test('the agent command route refuses an otherwise valid local-copy action', async () => {
  const { key } = request('Copy visor pair')
  const response = await post('/api/press', {
    session,
    key,
    operation: 'b'.repeat(32),
    text: '',
    shownSince: Date.now(),
  })
  expect(((await response.json()) as { state: string }).state).toBe('refused')
  const state = JSON.parse(await readFile(join(root, 'state.json'), 'utf8'))
  expect(state.remoteCommands).toEqual({})
})

test('shared local feedback preserves partial failure and attempt identity', () => {
  const result = formatLocal([
    9,
    'session',
    'i1',
    'version',
    [
      { kind: 'copy', value: 'fixture', name: 'snippet', isCommand: false },
      { kind: 'open', value: 'https://example.com', name: 'guide', isCommand: false },
    ],
    ['', 'The device could not open it.'],
    true,
  ])
  expect(result).toMatchObject({
    sequence: 9,
    session: 'session',
    row: 'i1',
    version: 'version',
    pending: false,
    failed: true,
  })
  expect(result.text).toContain('Copied snippet')
  expect(result.text).toContain('guide')
  expect(result.text).toContain('The device could not open it.')
})

test('the released client receives only its original view fields', async () => {
  const legacy = await (await fetch(origin + '/api/view?session=' + session)).json()
  expect(Object.keys(legacy).sort()).toEqual(
    [
      'connectionState',
      'key',
      'readOnly',
      'session',
      'name',
      'connected',
      'updatedAt',
      'serverNow',
      'running',
      'failure',
      'fresh',
      'statusError',
      'asks',
      'findings',
      'statusTitle',
      'statusDetail',
      'statusRows',
      'questionCount',
      'taskCount',
    ].sort(),
  )
  for (const row of [...legacy.asks, ...legacy.findings]) {
    expect(Object.keys(row).sort()).toEqual(
      ['id', 'kind', 'title', 'detail', 'context', 'recommendation', 'feedback', 'state', 'mark', 'actions'].sort(),
    )
    for (const action of row.actions)
      expect(Object.keys(action).sort()).toEqual(['key', 'label', 'primary', 'disabled', 'input', 'reason'].sort())
  }
  for (const row of legacy.statusRows)
    expect(Object.keys(row).sort()).toEqual(['id', 'title', 'detail', 'depth', 'mark'].sort())
})

test('row selection preserves an open reply and follows new work after explicit collapse', () => {
  const place = {
    id: session,
    name: '',
    tab: 'asks',
    asksExpanded: '',
    findsExpanded: '',
    prsExpanded: '',
    asksTop: 0,
    findsTop: 0,
    statusTop: 0,
    prsTop: 0,
    reply: '',
    options: [],
    folds: [],
    earlier: [],
    collapsed: [] as string[],
    collapses: [],
  }
  const empty = {
    session,
    signature: '',
    asks: '',
    finds: '',
    prs: '',
    prIds: [],
    prIndex: 0,
    askIds: [],
    findIds: [],
    askIndex: 0,
    findIndex: 0,
  }
  const first = advanceSelection(['first', view, place, empty])
  const open = { ...place, asksExpanded: first.asks, reply: session + ':' + first.asks }
  const arriving = { ...view, asks: [{ ...view.asks.find(row => row.waiting)!, id: 'i999' }, ...view.asks] }
  expect(advanceSelection(['arrival', arriving, open, first]).asks).toBe(first.asks)
  const closed = { ...open, collapsed: [first.asks], reply: '' }
  expect(advanceSelection(['collapsed', arriving, closed, first]).asks).toBe('i999')
  const legacy = { ...place, asksExpanded: 'closed' }
  const migrated = advanceSelection(['legacy', view, legacy, empty])
  expect(migrated.asks).toBe('closed')
  expect(advanceSelection(['legacy-arrival', arriving, legacy, migrated]).asks).toBe('i999')
  const removed = { ...view, asks: view.asks.filter(r => r.id !== first.asks) }
  expect(advanceSelection(['removed', removed, open, first]).asks).toBe(removed.asks[first.askIndex]!.id)
})

test('visual rows retain outgoing panels and closed history appears after departure', () => {
  const row = view.askGroups[0]!.rows.find(row => row.state === 'open')!
  const blank = { session: '', signature: '', asks: [], finds: [], prs: [], deadline: 0 }
  const opened = advanceMotion(['open', view, row.id, '', '', '', '', blank, 0, false])
  const closing = advanceMotion(['close', view, '', '', '', '', '', opened, 10, false])
  expect(closing.asks[0]!.rows.find(r => r.id === row.id)!.phase).toBe('closing')
  expect(closing.asks[0]!.rows.find(r => r.id === row.id)!.panel.title).toBe(row.title)
  const reversed = advanceMotion(['reverse', view, row.id, '', '', '', '', closing, 30, false])
  expect(reversed.asks[0]!.rows.find(r => r.id === row.id)!.phase).toBe('opening')
  const closed = {
    id: row.id,
    version: row.version,
    title: row.titleParts,
    outcome: 'Done',
    mark: '✓',
    tone: 'done',
    color: '',
    age: '',
    actions: [],
  }
  const removed = {
    ...view,
    asks: view.asks.filter(r => r.id !== row.id),
    askGroups: view.askGroups.map(g => ({
      ...g,
      rows: g.rows.filter(r => r.id !== row.id),
      closed: g.rows.some(r => r.id === row.id) ? [...g.closed, closed] : g.closed,
      closedAll: g.rows.some(r => r.id === row.id) ? [...g.closedAll, closed] : g.closedAll,
    })),
  }
  const leaving = advanceMotion(['gone', removed, '', '', '', '', '', reversed, 40, false])
  expect(leaving.asks[0]!.rows.some(r => r.id === row.id && r.phase === 'leaving')).toBe(true)
  expect(leaving.asks[0]!.closedAll.some(r => r.id === row.id)).toBe(false)
  const finished = advanceMotion(['gone', removed, '', '', '', '', '', leaving, 10000, false])
  expect(finished.asks[0]!.rows.some(r => r.id === row.id)).toBe(false)
  expect(finished.asks[0]!.closedAll.some(r => r.id === row.id)).toBe(true)
  const reduced = advanceMotion(['reduced', removed, '', '', '', '', '', reversed, 40, true])
  expect(reduced.asks[0]!.rows.some(r => r.id === row.id)).toBe(false)
  expect(reduced.deadline).toBe(0)
  const pr = view.prLines.find(line => line.kind === 'thread')!
  const prOpen = advanceMotion(['pr-open', view, '', '', pr.id, '', '', blank, 0, false])
  const prClosed = advanceMotion(['pr-close', view, '', '', '', '', '', prOpen, 10, false])
  expect(prClosed.prs.find(line => line.id === pr.id)).toMatchObject({ phase: 'closing', panel: pr })
  const prReversed = advanceMotion(['pr-reverse', view, '', '', pr.id, '', '', prClosed, 30, false])
  expect(prReversed.prs.find(line => line.id === pr.id)?.phase).toBe('opening')
  const withoutPr = { ...view, prLines: view.prLines.filter(line => line.id !== pr.id) }
  const prLeaving = advanceMotion(['pr-gone', withoutPr, '', '', '', '', '', prReversed, 40, false])
  expect(prLeaving.prs.find(line => line.id === pr.id)?.phase).toBe('leaving')
  const prGone = advanceMotion(['pr-gone', withoutPr, '', '', '', '', '', prLeaving, 10000, false])
  expect(prGone.prs.some(line => line.id === pr.id)).toBe(false)
})

test('file opening snapshots one authorized file and refuses active content and symlinks', async () => {
  const prepared = await post('/api/local', request('Open sample-note.txt'))
  expect(prepared.status).toBe(200)
  const work = (await prepared.json()) as Result<'prepareLocal'>
  const path = work.effects[0]!.value
  const file = await fetch(origin + path)
  expect(await file.text()).toBe('A private fixture note.')
  expect(file.headers.get('content-disposition')).toStartWith('inline;')
  expect(file.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  expect(file.headers.get('cache-control')).toBe('no-store')
  expect((await fetch(origin + path, { headers: { origin: 'https://other.example' } })).status).toBe(403)
  await writeFile(join(root, 'sample-note.txt'), 'Changed after the snapshot.')
  expect(await (await fetch(origin + path)).text()).toBe('A private fixture note.')
  await writeFile(join(root, 'sample-note.txt'), new Uint8Array([0, 255, 1]))
  const binary = (await (await post('/api/local', request('Open sample-note.txt'))).json()) as Result<'prepareLocal'>
  const download = await fetch(origin + binary.effects[0]!.value)
  expect(download.headers.get('content-type')).toBe('application/octet-stream')
  expect(download.headers.get('content-disposition')).toStartWith('attachment;')
  await rm(join(root, 'sample-note.txt'))
  const missing = await post('/api/local', request('Open sample-note.txt'))
  expect(missing.status).toBe(400)
  expect(await missing.json()).toEqual({ error: 'Couldn’t read this file on the agent’s computer.' })
  await symlink(join(root, 'sample-comparison.html'), join(root, 'sample-note.txt'))
  expect((await post('/api/local', request('Open sample-note.txt'))).status).toBe(400)
  await rm(join(root, 'sample-note.txt'))
  await writeFile(join(root, 'sample-note.txt'), '')
  await truncate(join(root, 'sample-note.txt'), 5 * 1024 * 1024 + 1)
  expect((await post('/api/local', request('Open sample-note.txt'))).status).toBe(400)
  const comparison = (await (
    await post('/api/local', request('Open sample-comparison.html'))
  ).json()) as Result<'prepareLocal'>
  const rendered = await fetch(origin + comparison.effects[0]!.value)
  const html = await rendered.text()
  expect(rendered.headers.get('content-type')).toBe('text/html; charset=utf-8')
  expect(rendered.headers.get('content-security-policy')).toContain("sandbox allow-scripts; default-src 'none'")
  expect(rendered.headers.get('content-security-policy')).not.toContain('allow-same-origin')
  expect(html).not.toContain('UNTRUSTED_FIXTURE_SCRIPT')
  expect(html).toContain('North')
  await writeFile(
    join(root, 'sample-comparison.html'),
    '<plaintext id="compare-data" hidden>' +
      JSON.stringify({ pick: 'North', choices: Array.from({ length: 9 }, () => ({ name: 'North' })) }),
  )
  expect((await post('/api/local', request('Open sample-comparison.html'))).status).toBe(400)
  expect((await fetch(origin + '/api/artifacts/' + '0'.repeat(64))).status).toBe(404)
}, 15000)

test('a PR button uses the durable command route and its duplicate retains one outcome', async () => {
  const control = view.prLines
    .find(line => line.id === 'pr:acme/visor#33')!
    .controls.find(control => control.label === 'Dismiss')!
  expect(control.disabled).toBe(false)
  expect(control.key).toMatch(/^[a-f0-9]{64}$/)
  const input = { session, key: control.key, operation: 'd'.repeat(32), text: '', shownSince: 0 }
  const receipt = (await (await post('/api/press', input)).json()) as Result<'press'>
  let outcome = receipt
  for (let attempt = 0; attempt < 100 && outcome.state !== 'confirmed'; attempt++) {
    await Bun.sleep(25)
    outcome = (await (await fetch(origin + '/api/receipt?id=' + receipt.id)).json()) as Result<'press'>
  }
  expect(outcome.state).toBe('confirmed')
  const before = JSON.parse(await readFile(join(root, 'state.json'), 'utf8'))
  expect(before.ledger.prs).not.toContain('acme/visor#33')
  expect(
    Object.values(before.remoteCommands).filter((c: unknown) => (c as { row: string }).row === control.row).length,
  ).toBe(1)
  expect(((await (await post('/api/press', input)).json()) as Result<'press'>).id).toBe(receipt.id)
  const after = JSON.parse(await readFile(join(root, 'state.json'), 'utf8'))
  expect(after.remoteCommands).toEqual(before.remoteCommands)
  const stale = view.prLines
    .find(line => line.id === 'pr:acme/visor#29')!
    .controls.find(control => control.label === 'Merge')!
  const refused = (await (
    await post('/api/press', { ...input, key: stale.key, operation: 'e'.repeat(32) })
  ).json()) as Result<'press'>
  expect(refused.state).toBe('stale')
})

test('browser open feedback reports the request without claiming success or failure', () => {
  const effects = [
    { kind: 'copy', value: 'fixture', name: 'snippet', isCommand: false },
    { kind: 'open', value: 'https://example.com', name: 'guide', isCommand: false },
  ]
  const browser = formatLocal([1, 'session', 'i1', 'v', effects, ['', ''], false])
  expect(browser.failed).toBe(false)
  expect(browser.text).toContain('Copied snippet')
  expect(browser.text).toContain('Requested opening guide')
  expect(browser.text).not.toContain('Opened guide')
  const native = formatLocal([1, 'session', 'i1', 'v', effects, ['', ''], true])
  expect(native.text).toContain('Opened guide')
})
