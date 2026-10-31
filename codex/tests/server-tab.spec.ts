import assert from 'node:assert/strict'
import { test } from 'node:test'

import { EMPTY_SESSION_STATUS } from '../../hooks/status-limits'
import { screenTabOf } from '../../hooks/tabs'
import { SETTLED_MS } from '../../hooks/timing'
import { screenText } from '../../hooks/inbox-text'
import { CODEX } from '../src/texts'
import { pageName } from '../src/server-tools'
import { readState, updateState } from '../src/state'
import { setup } from './server-fixtures'

test('the tab opens from the app-only inbox_view tool, and the model’s inbox tool mounts nothing', async () => {
  const { handle } = await setup(0)
  const r = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' })) as {
    result: { tools: { name: string; title?: string; _meta?: Record<string, unknown> }[] }
  }
  const tool = (name: string) => r.result.tools.find(t => t.name === name)
  assert.equal(tool('inbox')?._meta, undefined)
  assert.equal(tool('inbox_view')?.title, 'Inbox')
  assert.deepEqual(tool('inbox_view')?._meta, {
    ui: { resourceUri: 'ui://inbox/view', visibility: ['app'] },
    'openai/ui': { entrypoints: [{ type: 'thread' }] },
  })
  const read = (await handle({ jsonrpc: '2.0', id: 2, method: 'resources/read' })) as {
    result: { contents: { uri: string }[] }
  }
  assert.equal(read.result.contents[0]?.uri, 'ui://inbox/view')
  const older = pageName('<html>older</html>')
  const readOlder = (await handle({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: older } })) as {
    result: { contents: { uri: string; text: string }[] }
  }
  assert.equal(readOlder.result.contents[0]?.uri, older)
  assert.match(readOlder.result.contents[0]?.text ?? '', /<html>/)
})

test('the view request saves the tab the page shows, ignores a name that is not a tab, and the inbox model is told the tab', async () => {
  const { dir, call } = await setup(0)
  assert.equal((await readState(dir, 's1')).shownTab, 'needsYou')
  await call('inbox_view', { tab: 'prs' }, { thread_id: 's1' })
  assert.equal((await readState(dir, 's1')).shownTab, 'prs')
  await call('inbox_view', { tab: 'nowhere' }, { thread_id: 's1' })
  assert.equal((await readState(dir, 's1')).shownTab, 'prs')
  assert.equal(
    screenText(CODEX, true, screenTabOf((await readState(dir, 's1')).shownTab)),
    'The Inbox tab is open beside the conversation, on its PRs tab, listing every open item.',
  )
})

test('a release build saves its first tab for a Status the page names, and starts no look, while a next build saves the Status', async () => {
  const withStatus = async (isNextBuild: boolean) => {
    const server = await setup(
      0,
      () => 100,
      async () => 'codex',
      isNextBuild,
    )
    await updateState(server.dir, 's1', s => ({
      ...s,
      ledger: { ...s.ledger, overview: { ...EMPTY_SESSION_STATUS, headline: 'h' } },
    }))
    await server.call('inbox_view', { tab: 'overview' }, { thread_id: 's1' })

    return readState(server.dir, 's1')
  }
  const release = await withStatus(false)
  assert.equal(release.shownTab, 'needsYou')
  assert.equal(release.ledger.overview?.look, null)

  const next = await withStatus(true)
  assert.equal(next.shownTab, 'overview')
  assert.equal(next.ledger.overview?.look?.startedAt, 100)
})

test('with no dev build, the view names the installed page and inbox_tab_page serves it, so a tab from an older build replaces itself', async () => {
  const { call } = await setup(0)
  const view = (await call('inbox_view', {}, { thread_id: 's1' })) as unknown as {
    result: { structuredContent: { devPage: string } }
  }
  assert.equal(view.result.structuredContent.devPage, pageName('<html></html>'))
  const page = (await call('inbox_tab_page', {}, { thread_id: 's1' })) as unknown as {
    result: { structuredContent: { html: string } }
  }
  assert.equal(page.result.structuredContent.html, '<html></html>')
})

test('the inbox tool answers in text: the count, each row that waits, and where to act on them', async () => {
  const { dir, call } = await setup(0)
  const codex = { 'x-codex-turn-metadata': { session_id: 's1', turn_id: 't1' } }
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: {
      ...s.ledger,
      items: [
        ...s.ledger.items,
        {
          id: 'i2',
          kind: 'task',
          label: null,
          from: 'record',
          ask: 'Add the API key to .env',
          options: [],
          rec: null,
          helps: [],
          turn: 1,
          at: 2,
        },
      ],
      findings: [{ id: 'f3', kind: 'issue', title: 'No lint script', detail: 'Only tests run.', path: null, at: 3 }],
      turn: 1,
      batchTurn: 1,
    },
  }))
  const r = (await call('inbox', {}, codex)) as unknown as {
    result: { content: { text: string }[]; structuredContent?: unknown }
  }
  assert.equal(r.result.structuredContent, undefined)
  assert.equal(
    r.result.content[0]?.text,
    [
      '2 wait on the user · 1 finding',
      'A close id is only for the close tool. Never write one in a reply.',
      'Questions:',
      '1) "Ship it?"; options: Yes / No (close id: i1)',
      'Tasks:',
      '• "Add the API key to .env" (close id: i2)',
      'Findings:',
      '• issue: No lint script (close id: f3)',
      'Open the Inbox tab to act on these.',
    ].join('\n'),
  )
  await call('inbox_press', { press: { action: 'dismiss', id: 'i2' }, thread: 's1' }, { thread_id: 's1' })
  await call('inbox_press', { press: { action: 'dismiss', id: 'f3' }, thread: 's1' }, { thread_id: 's1' })
  const one = await call('inbox', {}, codex)
  assert.equal(
    one.result.content[0]?.text,
    [
      '1 waits on the user',
      'A close id is only for the close tool. Never write one in a reply.',
      'Questions:',
      '1) "Ship it?"; options: Yes / No (close id: i1)',
      'Open the Inbox tab to act on these.',
    ].join('\n'),
  )
  await call('inbox_press', { press: { action: 'dismiss', id: 'i1' }, thread: 's1' }, { thread_id: 's1' })
  const after = await call('inbox', {}, codex)
  assert.equal(after.result.content[0]?.text, 'Nothing waits on the user.')
})

test('a press in the demo changes only the demo, sends nothing into the conversation, and says so, and the reply to a press leaves the sample’s hand-off waiting', async context => {
  const { dir, calls, call } = await setup(0)
  const before = await readState(dir, 's1')
  context.mock.timers.enable({ apis: ['setTimeout'] })
  type NeedsYou = {
    result: {
      structuredContent: {
        needsYou: {
          questions: { id: string; state: { is: string }; item: { options: string[] } }[]
          tasks: {
            id: string
            state: { is: string }
            feedback: { is: string } | null
            steps: { label: string; step: { kind: string }[] }[]
          }[]
        }
      }
    }
  }
  const demo = (await call('inbox_view', { demo: true }, { thread_id: 's1' })) as unknown as NeedsYou
  const first = demo.result.structuredContent.needsYou.questions.find(q => q.state.is === 'open')
  assert.ok(first)
  const option = first.item.options[0]
  const r = await call(
    'inbox_press',
    { press: { action: 'answer', id: first.id, option }, thread: 's1', demo: true, shownSince: 0 },
    { thread_id: 's1' },
  )
  assert.deepEqual(calls, [])
  assert.equal(r.result.structuredContent.view.needsYou.questions.find(q => q.id === first.id)?.state.is, 'settled')
  assert.equal(r.result.structuredContent.note, null)
  const copyTask = demo.result.structuredContent.needsYou.tasks.find(t =>
    t.steps[0]?.step.every(h => h.kind === 'copy'),
  )
  assert.ok(copyTask)
  const copied = await call(
    'inbox_press',
    { press: { action: 'step', id: copyTask.id, step: 0, label: copyTask.steps[0]!.label }, thread: 's1', demo: true },
    { thread_id: 's1' },
  )
  assert.equal(copied.result.structuredContent.note, null)
  assert.equal((copied.result.structuredContent as unknown as { copy: unknown }).copy, null)
  const copiedRow = (
    copied.result.structuredContent as unknown as {
      view: { needsYou: { tasks: { id: string; feedback: { is: string; result?: { state: string } } | null }[] } }
    }
  ).view.needsYou.tasks.find(t => t.id === copyTask.id)
  assert.deepEqual([copiedRow?.feedback?.is, copiedRow?.feedback?.result?.state], ['local', 'done'])

  const tasks = demo.result.structuredContent.needsYou.tasks
  const handedOff = tasks.find(t => t.state.is === 'handedOff')
  const unhelped = tasks.find(t => t.state.is === 'open' && t.steps.length === 0)
  assert.ok(handedOff && unhelped)
  await call(
    'inbox_press',
    { press: { action: 'type', id: unhelped.id, text: 'Done in both.' }, thread: 's1', demo: true, shownSince: 0 },
    { thread_id: 's1' },
  )
  context.mock.timers.tick(SETTLED_MS)
  const replied = (await call('inbox_view', { demo: true }, { thread_id: 's1' })) as unknown as NeedsYou
  const stateOf = (id: string) => {
    const row = replied.result.structuredContent.needsYou.tasks.find(t => t.id === id)
    return [row?.state.is, row?.feedback?.is]
  }
  assert.deepEqual(stateOf(handedOff.id), ['handedOff', 'done'])
  assert.deepEqual(stateOf(unhelped.id), ['open', 'stillOpen'])
  assert.deepEqual(calls, [])
  assert.deepEqual(await readState(dir, 's1'), before)
})
