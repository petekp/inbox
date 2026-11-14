import { expect, mock, test } from 'claude-code/testing'
import { w, world } from './hooks-world'
import { BAND, PANE, SAVED_SESSION } from './hooks-helpers'

test('the guidance reaches Claude in the close tool’s description and nowhere else, and every inbox tool loads with the session', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  on('tool.describe', (_$, e) => ({ description: e.description }))
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const provider = { plugin: 'inbox', tier: 'user' } as const
  const close = await $.tool.describe({ tool: 'mcp__inbox__close', description: 'Close an item.', provider })
  const record = await $.tool.describe({ tool: 'mcp__inbox__record', description: 'Record an item.', provider })
  expect(close.description).toContain('Close an item.')
  expect(close.description).toContain('# Inbox')
  expect(record.description).toBe('Record an item.')
  const order = await $.tool.describe({ tool: 'mcp__inbox__order_prs', description: 'Order PRs.', provider })
  expect([close, record, order].map(d => d.isDeferred)).toEqual([false, false, false])
})

test("Claude is asked for a question's context, notes and reason in a new conversation and after it resumes, and not in a conversation an earlier build saved", async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let turns = 0
  on('session.turns', () => ({ value: turns }))
  w.stored.set('s:session-2', JSON.stringify(SAVED_SESSION))
  const recordAsk = async (ask: string) =>
    (
      await $.tool.call({
        tool: 'mcp__inbox__record',
        kind: 'question',
        ask,
        options: ['Redis', 'Memcached'],
        rec: 'Redis',
      })
    ).result
  const recorded = 'Recorded. The user sees it in the /inbox pane.'
  const fullAsk = `${recorded} It has no context or option_notes: record it again with context (why it came up) and option_notes (what picking each option does). It has no why: record it again with why, so the user sees your reason.`

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  expect(await recordAsk('Which cache should the API use?')).toBe(fullAsk)
  await clock.settle()
  turns = 3
  await $.session.end({ reason: 'resume', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'resume', session_id: 'session-2' })
  expect(await recordAsk('Which queue should jobs use?')).toBe(recorded)
  await clock.settle()
  await $.session.end({ reason: 'resume', sessionId: 'session-2', resume: { id: 'session-2' } })
  await $.classic.SessionStart({ source: 'resume', session_id: 'session-1' })
  expect(await recordAsk('Which log store should we use?')).toBe(fullAsk)
})

test("a conversation /resume opens with no saved inbox state is asked only for what 0.3.0's record takes, one /clear begins is asked for everything while the turn count still names the last conversation, and a fork asks as its parent does", async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  on('session.turns', () => ({ value: 3 }))
  const recordAsk = async (ask: string) =>
    (
      await $.tool.call({
        tool: 'mcp__inbox__record',
        kind: 'question',
        ask,
        options: ['Redis', 'Memcached'],
        rec: 'Redis',
      })
    ).result
  const recorded = 'Recorded. The user sees it in the /inbox pane.'
  const fullAsk = `${recorded} It has no context or option_notes: record it again with context (why it came up) and option_notes (what picking each option does). It has no why: record it again with why, so the user sees your reason.`

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  expect(await recordAsk('Which cache should the API use?')).toBe(fullAsk)
  await clock.settle()
  await $.session.end({ reason: 'resume', sessionId: 'session-2', resume: { id: 'session-2' } })
  await $.classic.SessionStart({ source: 'resume', session_id: 'session-3' })
  expect(await recordAsk('Which queue should jobs use?')).toBe(recorded)
  await clock.settle()
  await $.session.end({ reason: 'clear', sessionId: 'session-3', resume: { id: 'session-3' } })
  await $.classic.SessionStart({ source: 'clear', session_id: 'session-4' })
  await clock.settle()
  await $.session.end({ reason: 'resume', sessionId: 'session-4', resume: { id: 'session-4' } })
  await $.classic.SessionStart({ source: 'fork', session_id: 'session-5' })
  expect(await recordAsk('Which log store should we use?')).toBe(fullAsk)
})

test('a finding Claude records while the pane shows an empty tab brings the pane to it, and Fix hands it to Claude, settles its row as the choice made until its Undo ends, then moves it to the Closed fold even when Claude’s reply leaves it open', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: true, isFocused: true }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: '' } as never)
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /^Nothing needed$/ })).toBeDefined()
  const r = await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'Retry loop never backs off',
    detail: 'The fetch retry spins with no delay and can hammer the API.',
    path: 'src/api.ts',
  })
  expect(r.result).toBe('Recorded. The user sees it in the Finds tab of the /inbox pane.')
  await clock.settle()
  expect(await pane.find({ text: /Retry loop never backs off/ })).toBeDefined()

  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /Finds 1/ })).toBeDefined()

  const sentBefore = w.sent.length
  await pane.press({ key: 'address-f1' })
  await clock.settle()
  expect(w.sent).toHaveLength(sentBefore)
  expect(await pane.find({ key: 'settled-f1' })).toBeDefined()
  expect(await pane.find({ text: /^Fix$/ })).toBeDefined()
  expect(await pane.find({ key: 'undo-f1' })).toBeDefined()
  expect(await band.find({ text: /Finds 1/ })).toBeUndefined()
  await clock.advance(9000)
  expect(w.sent.at(-1)).toContain('Please address this finding you recorded:\nIssue: Retry loop never backs off')
  expect(await pane.find({ key: 'settled-f1' })).toBeUndefined()
  expect(await pane.find({ text: /1 closed/ })).toBeDefined()

  await $.turn.start({ text: w.sent.at(-1) ?? '', turnId: 't1' })
  await $.turn.complete({ answer: 'Added a backoff.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(await band.find({ text: /Finds 1/ })).toBeUndefined()
  await pane.press({ key: 'tab-findings' })
  await clock.settle()
  expect(await pane.find({ key: 'address-f1-key' })).toBeUndefined()
  expect(await pane.find({ text: /1 closed/ })).toBeDefined()

  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'opportunity',
    title: 'Cache the API token',
    detail: 'Each call fetches a new token.',
  })
  await clock.settle()
  expect(await pane.find({ text: /Cache the API token/ })).toBeDefined()
})

test('a question Claude records waits in the pane with its recommendation, a repeat is not added, one the person dismissed is not recorded again, and one they answered with List the choices can be asked again with choices', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: true, isFocused: true }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: '' } as never)
  const pane = await $.ui.mount(PANE)
  const question = {
    tool: 'mcp__inbox__record',
    kind: 'question',
    ask: 'Which cache should the API use?',
    context: 'The price lookups are slow, and a cache is the next step',
    options: ['Redis', 'In-memory'],
    option_notes: ['Adds a Redis server to each stack', 'Keeps prices in each process'],
    rec: 'Redis',
    why: 'it survives restarts',
  } as const
  const r = await $.tool.call(question)
  expect(r.result).toBe('Recorded. The user sees it in the /inbox pane.')
  await clock.settle()
  expect(await pane.find({ text: /Which cache should the API use\?/ })).toBeDefined()
  expect((await $.tool.call({ ...question, ask: 'Which cache should the API use?' })).result).toBe(
    'Already open, so this record updated it.',
  )
  expect((await $.tool.call({ ...question, ask: 'Which cache should it use?', rec: 'Memcached' })).result).toBe(
    'Not recorded: rec must be one of the options.',
  )

  const task = await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'task',
    ask: 'Sign in to the registry',
    steps: ['npm login', 'Then tell me when it is done.'],
  })
  expect(task.result).toBe(
    'Recorded. The user sees it in the /inbox pane. Some steps were not a command, a file path or a link, so they are left out.',
  )

  await $.tool.call({ tool: 'mcp__inbox__close', id: 'i1', answer: 'Redis' })
  expect((await $.tool.call(question)).result).toBe(
    'Not recorded: the user answered it (Redis). Ask it again only if they bring it up.',
  )

  const placement = { tool: 'mcp__inbox__record', kind: 'question', ask: 'Where should the job run?' } as const
  await $.tool.call({ ...placement, options: ['List the choices'] })
  await $.tool.call({ tool: 'mcp__inbox__close', id: 'i3', answer: 'List the choices' })
  expect(
    (
      await $.tool.call({
        ...placement,
        context: 'The cleanup job needs a schedule before it ships',
        options: ['Nightly', 'Hourly'],
        option_notes: ['Runs once at 2 a.m.', 'Runs at the top of each hour'],
        rec: 'Nightly',
        why: 'traffic is low at night',
      })
    ).result,
  ).toBe('Recorded. The user sees it in the /inbox pane.')
})

test("the result under a record or close call reads the person's line, nothing when the call changed nothing, and the agent's text in the ctrl+o transcript", async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('ui.render', { component: 'ToolResult' }, ($, e) => $.ui.resolve(e).Text({ children: [String(e.props.output)] }))
  world($, on, [])

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const question = {
    tool: 'mcp__inbox__record',
    kind: 'question',
    ask: 'Which cache should the API use?',
    options: ['Redis', 'In-memory'],
  } as const
  const calls = [
    { use: 'u1', call: question },
    { use: 'u2', call: question },
    { use: 'u3', call: { tool: 'mcp__inbox__close', id: 'i1', answer: 'Redis' } },
  ] as const
  const results: unknown[] = []
  for (const { use, call } of calls) results.push((await $.tool.call({ ...call, tool_use_id: use } as never)).result)
  const resultRow = (i: number, isExpanded = false) =>
    $.ui.mount({
      plugin: 'inbox',
      surface: 'terminal',
      component: 'ToolResult',
      props: {
        tool_use_id: calls[i]!.use,
        tool: calls[i]!.call.tool,
        output: results[i],
        isErrored: false,
        isExpanded,
      },
    } as never)

  expect(await (await resultRow(0)).find({ text: 'Question: Which cache should the API use?' })).toBeDefined()
  expect(await (await resultRow(1)).find({ text: /./ })).toBeUndefined()
  expect(await (await resultRow(2)).find({ text: 'Closed: Which cache should the API use?' })).toBeDefined()
  expect(
    await (await resultRow(0, true)).find({ text: 'Recorded. The user sees it in the /inbox pane.' }),
  ).toBeDefined()
})

test('findings that arrive one by one after the pane moves to them keep the first one open', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: true, isFocused: true }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: '' } as never)
  const pane = await $.ui.mount(PANE)
  for (const title of ['Retry loop never backs off', 'Token cached forever', 'No lint script']) {
    await $.tool.call({
      tool: 'mcp__inbox__record',
      kind: 'finding',
      finding_kind: 'issue',
      title,
      detail: 'Found while reading.',
    })
    await clock.settle()
  }
  expect(await pane.find({ key: 'address-f1' })).toBeDefined()
  expect(await pane.find({ key: 'address-f3' })).toBeUndefined()
})
