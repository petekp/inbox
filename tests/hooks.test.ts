import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const LEDGER_REPLY = `GOAL: Add a greeting CLI
DONE: Plan written
NOW: Waiting on two choices
NEW: decide | 1 | Use Node or Python? | Node / Python | Node
NEW: decide | 2 | Name the command greet? | - | yes`

const BAND = {
  component: 'AbovePrompt' as const,
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 16,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 15 },
    view: {},
  },
}

// What the per-turn ledger model answers; a test can make it fail.
let ledgerReply = LEDGER_REPLY

// Prompts the mod sent as the person's own, as the engine's chain received them.
let sent: string[] = []

// Every command the mod ran, such as the herdr call that publishes the sidebar line.
let ran: string[][] = []

// What a tool call Claude makes answers; a test can make it fail.
let toolAnswer: { text: string; isError: boolean } = { text: 'ok', isError: false }

// The commands of the Bash calls that reached the engine.
let toolCalls: string[] = []

// gh's answers by command; anything else fails, as gh does outside a repo with no PR.
// `hold` delays an answer until it resolves, as a slow network would.
let ghAnswers: {
  match: (argv: readonly string[]) => boolean
  stdout: string
  hold?: () => Promise<void>
  // Makes the call fail with this message.
  fails?: string
}[] = []

function gh(argv: readonly string[]) {
  const hit = ghAnswers.find(a => a.match(argv))

  return {
    exitCode: hit && !hit.fails ? 0 : 1,
    stdout: hit && !hit.fails ? hit.stdout : '',
    stderr: hit ? (hit.fails ?? '') : 'no pull requests found',
    isStdoutTruncated: false,
    isStderrTruncated: false,
  }
}

const PANE = {
  plugin: 'inbox',
  surface: 'terminal' as const,
  component: 'Pane' as const,
  requestId: 'inbox',
  props: {
    title: 'Inbox',
    isFocused: true,
    bodyColumns: 80,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
}

const RUN_CHECK = 'mcp__inbox__run_check'

function world(on: On, prompts: string[], vars: Record<string, string> = {}) {
  sent = []
  ran = []
  toolAnswer = { text: 'ok', isError: false }
  toolCalls = []
  ghAnswers = []
  ledgerReply = LEDGER_REPLY
  mock.store(on)
  on('session.id', () => ({ value: 'session-1' }))
  on('session.root', () => ({ value: '/tmp/project' }))
  on('session.cwd', () => ({ value: '/tmp/project' }))
  // Outside Herdr unless a test passes HERDR_PANE_ID.
  on('env.get', ($, e) => ({ value: vars[e.name] }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__inbox__${e.name}` } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('process.run', async ($, e) => {
    ran.push([...e.argv])
    await ghAnswers.find(a => a.match(e.argv))?.hold?.()
    return { value: gh(e.argv) }
  })
  on('model.complete', ($, e) => {
    prompts.push(e.prompt)

    return {
      value: {
        isAnswered: true,
        text: ledgerReply,
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }
  })
  on('prompt.submit', ($, e) => {
    if (e.origin.kind === 'plugin') sent.push(e.text)

    return { text: e.text, context: e.context }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('classic.StopFailure', () => ({}))
  on('classic.PermissionRequest', () => ({}))
  on('classic.Stop', () => ({}))
  on('tool.call', (_$, e) => {
    toolCalls.push(String((e as { command?: unknown }).command))

    return toolAnswer.isError
      ? { isError: true as const, result: toolAnswer.text, text: toolAnswer.text }
      : { result: toolAnswer.text, text: toolAnswer.text }
  })
  // The engine asks the person, as for a file outside the project.
  on('tool.check', () => ({ decision: 'ask' as const }))
  // The band with nothing to show falls through to the engine's own, drawn empty here.
  on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
}

/** The sidebar lines the mod published to Herdr, in order. */
function sidebarLines(): string[] {
  return ran.filter(argv => argv[0] === 'herdr').map(argv => argv.find(a => a.startsWith('inbox='))?.slice(6) ?? '')
}

test('a reply becomes a card and open items, and "1. yes" carries the question', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world(on, prompts)

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Plan ready. 1. Node or Python? 2. Call it greet?',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()

  expect(prompts.length).toBe(1)
  expect(prompts[0]).toContain('<person>\nadd a greeting cli\n</person>')

  // The band counts what waits; the items themselves are in /inbox.
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /2 waiting on you in \/inbox/ })).toBeDefined()
  expect(await band.find({ text: /Use Node or Python\?/ })).toBeUndefined()

  const answered = await $.prompt.submit({ text: '1. node\n2. yes', wait: false, origin: { kind: 'composer' } })
  expect(answered.context?.join('\n')).toContain('1 → "Use Node or Python?"')
  // Claude reads the open items beside a prompt, and again only after they change.
  expect(answered.context?.join('\n')).toContain('Waiting on the user:\n- [i1] (1) "Use Node or Python?"')
  const unchanged = await $.prompt.submit({ text: 'also add a --loud flag', wait: false, origin: { kind: 'composer' } })
  expect(unchanged.context?.join('\n') ?? '').not.toContain('Waiting on the user')

  // Pressing an answer in the pane sends it as the person's message and closes the item.
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'answer-i1-0' })
  expect(sent).toEqual(['Re "Use Node or Python?": Node'])
  expect(await pane.find({ key: 'row-i1' })).toBeUndefined()
  // The per-turn update reads the pressed answer as the person's message.
  await $.turn.complete({ answer: 'Using Node.', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect(prompts.at(-1)).toContain('Re "Use Node or Python?": Node\n</person>')
})

test('after 15 idle minutes the band shows where the session stands', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'add a greeting cli', turnId: 't1' })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()

  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /last active/ })).toBeUndefined()

  await clock.advance(16 * 60_000)
  expect(await band.find({ text: /last active 16m ago/ })).toBeDefined()
  expect(await band.find({ text: /Add a greeting CLI/ })).toBeDefined()

  await $.prompt.submit({ text: 'ok back', wait: false, origin: { kind: 'composer' } })
  expect(await band.find({ text: /last active/ })).toBeUndefined()
})

test('resumed into a conversation it cannot fork yet, it catches up from the transcript before any reply', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world(on, prompts)
  // A resumed session: earlier turns, but no request from this process to fork.
  on('session.turns', () => ({ value: 3 }))
  on('model.fork', () => ({ value: { isAnswered: false as const, reason: 'nothing-to-fork' as const } }))
  const said = (role: 'user' | 'assistant', text: string) => ({ role, text, toolUses: [] })
  on('session.messages', () => ({
    value: [
      said('user', 'Add a greeting CLI. Node or Python?'),
      said('user', 'inbox: what waits on the user, as of your last reply. Anything not listed here is closed.'),
      said('assistant', 'The plan is written. 1. Node or Python? 2. Name the command greet?'),
    ],
  }))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const conversation = prompts.at(-1)?.match(/<conversation>\n([\s\S]*?)\n<\/conversation>/)?.[1]
  // The mod's own context rows are not part of the conversation it summarizes.
  expect(conversation).toBe(
    'Person: Add a greeting CLI. Node or Python?\nAgent: The plan is written. 1. Node or Python? 2. Name the command greet?',
  )
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /Add a greeting CLI/ })).toBeDefined()
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()
  expect(await pane.find({ text: /update failed/ })).toBeUndefined()
})

test('after a failed update, the next reply catches up over the whole conversation', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])
  on('model.fork', () => ({
    value: {
      isAnswered: true,
      text: 'GOAL: Ship the onboarding flow\nNOW: Waiting on copy review\nCLOSED: i1 | Node\nCLOSED: f3 | fixed\nNEW: do | - | Review the welcome copy | - | -',
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  }))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  // Findings and items share one id counter, so after i1 and i2 this finding is f3.
  await $.tool.call({
    tool: 'mcp__inbox__record_finding',
    kind: 'issue',
    title: 'README is stale',
    detail: 'It names the old command.',
  })

  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()
  // An open item says how long it has waited.
  expect(await pane.find({ text: / · just now/ })).toBeDefined()
  // Only the selected item shows its actions; Next moves the selection.
  expect(await pane.find({ key: 'explain-i2' })).toBeUndefined()
  await pane.press({ key: 'next' })
  expect(await pane.find({ key: 'explain-i2' })).toBeDefined()
  await pane.press({ key: 'previous' })
  // Explain asks Claude about the item and leaves it open.
  await pane.press({ key: 'explain-i1' })
  expect(sent.at(-1)).toContain('"Use Node or Python?"\nOptions: Node / Python')
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()

  // This turn's update fails, so the next reply re-reads the whole conversation.
  ledgerReply = 'not a ledger'
  await $.turn.complete({ answer: 'Using Node.', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect(await pane.find({ text: /update failed/ })).toBeDefined()
  await $.turn.complete({
    answer: 'Fixed the README too.',
    durationMs: 5,
    isAborted: false,
    turnId: 't3',
    reason: 'answer',
  })
  await clock.settle()
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /Ship the onboarding flow/ })).toBeDefined()
  // It closes what the conversation handled, keeps what still waits, and adds what is new.
  expect(await pane.find({ key: 'row-i1' })).toBeUndefined()
  // The question shows under the open ones, with its outcome under it.
  expect(await pane.find({ text: /^Use Node or Python\?$/ })).toBeDefined()
  expect(await pane.find({ text: /^Node$/ })).toBeDefined()
  expect(await pane.find({ text: /Name the command greet\?/ })).toBeDefined()
  expect(await pane.find({ text: /Review the welcome copy/ })).toBeDefined()
  expect(await pane.find({ text: /update failed/ })).toBeUndefined()
  await pane.press({ key: 'tab-findings' })
  expect(await pane.find({ text: /README is stale/ })).toBeUndefined()
})

test('a reload that cuts off the end-of-turn hook catches up on load', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])
  on('model.fork', () => ({
    value: {
      isAnswered: true,
      text: 'GOAL: Add a greeting CLI\nNOW: Waiting on the push\nNEW: decide | - | Push the branch to origin? | yes / no | yes',
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  }))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'add a greeting cli', turnId: 't1' })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  // A turn with no prompt, as a task notification starts, ends in a reload that runs
  // no turn.complete hook, as when the turn edited the mod.
  await $.turn.start({ text: '', turnId: 't2' })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()

  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Push the branch to origin\?/ })).toBeDefined()
})

test('a finding Claude records shows in the Findings tab, and Address it sends it back', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  world(on, [])

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const r = await $.tool.call({
    tool: 'mcp__inbox__record_finding',
    kind: 'issue',
    title: 'Retry loop never backs off',
    detail: 'The fetch retry spins with no delay and can hammer the API.',
    path: 'src/api.ts',
  })
  expect(r.result).toBe('Recorded as f1. The user sees it in the Findings tab of /inbox.')

  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Retry loop never backs off/ })).toBeUndefined()
  await pane.press({ key: 'tab-findings' })
  expect(await pane.find({ text: /Retry loop never backs off/ })).toBeDefined()

  await pane.press({ key: 'address-f1' })
  expect(sent.at(-1)).toContain('Please address this finding you recorded:\nIssue: Retry loop never backs off')
  expect(await pane.find({ text: /Retry loop never backs off/ })).toBeUndefined()
})

test('t opens a field for the person’s own words: an answer closes its question, a reply sends a finding back', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])
  on('ui.focus', () => ({}))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Plan ready. 1. Node or Python? 2. Call it greet?',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  await $.tool.call({
    tool: 'mcp__inbox__record_finding',
    kind: 'issue',
    title: 'README is stale',
    detail: 'It names the old command.',
  })

  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ key: 'type-i1' })).toBeUndefined()
  await pane.press({ key: 'typekey-i1' })
  await pane.input({ key: 'type-i1', text: 'Deno, actually' })
  expect(sent.at(-1)).toBe('Re "Use Node or Python?": Deno, actually')
  expect(await pane.find({ key: 'row-i1' })).toBeUndefined()

  await pane.press({ key: 'tab-findings' })
  await pane.press({ key: 'typekey-f3' })
  await pane.input({ key: 'type-f3', text: 'Fix it after the CLI ships.' })
  expect(sent.at(-1)).toBe(
    'About this finding you recorded:\nIssue: README is stale\nIt names the old command.\n\nFix it after the CLI ships.',
  )
  expect(await pane.find({ text: /README is stale/ })).toBeUndefined()
})

test('Claude closes an item or finding that no longer applies, by the id it reads beside the prompt', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Plan ready. 1. Node or Python? 2. Call it greet?',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  await $.tool.call({
    tool: 'mcp__inbox__record_finding',
    kind: 'issue',
    title: 'README is stale',
    detail: 'It names the old command.',
  })
  const told = await $.prompt.submit({ text: 'where are we?', wait: false, origin: { kind: 'composer' } })
  expect(told.context?.join('\n')).toContain('- [i2] (2) "Name the command greet?"')
  expect(told.context?.join('\n')).toContain('- [f3] issue: README is stale')

  const close = (input: Record<string, string>) => $.tool.call({ tool: 'mcp__inbox__close', ...input } as never)
  const pane = await $.ui.mount(PANE)
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  // The user answered i1 in their own message: it closes with their answer, shown in place.
  expect((await close({ id: 'i1', answer: 'Deno' })).result).toBe(
    'Closed i1. The user sees it in /inbox with its outcome.',
  )
  expect(await pane.find({ key: 'row-i1' })).toBeUndefined()
  expect(await pane.find({ key: 'settled-i1' })).toBeDefined()
  expect(await band.find({ text: /✓ Use Node or Python\? → Deno/ })).toBeDefined()
  expect((await close({ id: 'i2', reason: 'no longer applies' })).result).toBe(
    'Closed i2. The user sees it in /inbox with its outcome.',
  )
  expect((await close({ id: 'f3', reason: 'fixed' })).result).toBe('Closed finding f3.')
  expect((await close({ id: 'i9', reason: 'done' })).result).toContain(
    'Not closed: no open item or finding has the id i9.',
  )

  // After a few seconds the rows leave for the group's closed items, which start folded.
  await clock.advance(9000)
  expect(await pane.find({ key: 'settled-i1' })).toBeUndefined()
  expect(await band.find({ text: /✓/ })).toBeUndefined()
  expect(await pane.find({ text: /^Deno$/ })).toBeUndefined()
  await pane.press({ key: 'fold-question' })
  expect(await pane.find({ text: /^Deno$/ })).toBeDefined()
  expect(await pane.find({ text: /^Closed by Claude: no longer applies$/ })).toBeDefined()
})

test('a PR linked in a reply shows in the PRs tab; Fix and Address send its check and thread', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])
  // Each run of the failing check has its own job page, so a rerun has a new URL.
  let job = 1
  ghAnswers.push(
    {
      match: argv => argv.includes('view') && argv.includes('12'),
      get stdout() {
        return JSON.stringify({
          number: 12,
          title: 'Add a greeting CLI',
          url: 'https://github.com/acme/greet/pull/12',
          isDraft: false,
          state: 'OPEN',
          baseRefName: 'main',
          mergeable: 'MERGEABLE',
          reviewDecision: 'REVIEW_REQUIRED',
          statusCheckRollup: [
            {
              __typename: 'CheckRun',
              name: 'test',
              status: 'COMPLETED',
              conclusion: 'FAILURE',
              detailsUrl: `https://github.com/acme/greet/actions/runs/7/job/${job}`,
            },
          ],
        })
      },
    },
    {
      match: argv => argv.includes('graphql'),
      stdout: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [
                  {
                    id: 'T1',
                    isResolved: false,
                    isOutdated: false,
                    path: 'bin/greet',
                    line: 4,
                    originalLine: 4,
                    comments: {
                      totalCount: 1,
                      nodes: [
                        {
                          author: { login: 'sam' },
                          body: 'Quote the name.',
                          url: 'https://github.com/acme/greet/pull/12#r1',
                        },
                      ],
                    },
                    last: { nodes: [{ author: { login: 'sam' }, body: 'Quote the name.', url: '' }] },
                  },
                ],
              },
            },
          },
        },
      }),
    },
  )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'open the PR', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Opened https://github.com/acme/greet/pull/12.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()

  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-prs' })
  await clock.settle()
  expect(await pane.find({ text: /Add a greeting CLI/ })).toBeDefined()
  expect(await pane.find({ text: /Blocked: 1 failing check, 1 thread waiting on you, needs approval/ })).toBeDefined()

  // The failing check comes first. Once its fix is sent, the row says so until a rerun of it fails again.
  await pane.press({ key: 'fix-acme/greet#12-test' })
  expect(sent.at(-1)).toContain('The CI check "test" is failing on PR #12')
  expect(await pane.find({ text: /Fix sent ·/ })).toBeDefined()
  await pane.press({ key: 'next' })
  expect(await pane.find({ text: /fix sent/ })).toBeDefined()
  job = 2
  await pane.press({ key: 'tab-findings' })
  await pane.press({ key: 'tab-prs' })
  await clock.settle()
  expect(await pane.find({ text: /fix sent/i })).toBeUndefined()

  await pane.press({ key: 'next' })
  await pane.press({ key: 'address-T1' })
  expect(sent.at(-1)).toContain('Address this review comment on PR #12')
  expect(sent.at(-1)).toContain('bin/greet:4, from @sam:\nQuote the name.')
})

test('opening the PRs tab while another PR fetch runs still finds the branch’s PR', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])
  const view = (number: number, title: string) =>
    JSON.stringify({
      number,
      title,
      url: `https://github.com/acme/greet/pull/${number}`,
      isDraft: false,
      state: 'OPEN',
      baseRefName: 'main',
      mergeable: 'MERGEABLE',
      reviewDecision: 'APPROVED',
      statusCheckRollup: [],
    })
  const noThreads = JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } })
  let isSlow = true
  ghAnswers.push(
    // The linked PR's first fetch is still running when the tab opens.
    {
      match: argv => argv.includes('view') && argv.includes('12'),
      stdout: view(12, 'Linked work'),
      hold: () => (isSlow ? ((isSlow = false), clock.sleep(5000)) : Promise.resolve()),
    },
    { match: argv => argv.includes('view') && !argv.includes('12'), stdout: view(13, 'Branch work') },
    { match: argv => argv.includes('graphql'), stdout: noThreads },
  )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'open the PR', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Opened https://github.com/acme/greet/pull/12.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-prs' })
  await clock.advance(5000)

  expect(await pane.find({ text: /Linked work/ })).toBeDefined()
  expect(await pane.find({ text: /Branch work/ })).toBeDefined()
})

test('a PR fetch keeps a Dismiss made while it ran, and the branch PR when its lookup fails', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])
  const view = (number: number, title: string) =>
    JSON.stringify({
      number,
      title,
      url: `https://github.com/acme/greet/pull/${number}`,
      isDraft: false,
      state: 'OPEN',
      baseRefName: 'main',
      mergeable: 'MERGEABLE',
      reviewDecision: 'APPROVED',
      statusCheckRollup: [],
    })
  const noThreads = JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } })
  let isSlow = false
  let branchFails: string | undefined
  ghAnswers.push(
    {
      match: argv => argv.includes('view') && argv.includes('12'),
      stdout: view(12, 'Linked work'),
      hold: () => (isSlow ? clock.sleep(5000) : Promise.resolve()),
    },
    {
      match: argv => argv.includes('view') && !argv.includes('12'),
      stdout: view(13, 'Branch work'),
      get fails() {
        return branchFails
      },
    },
    { match: argv => argv.includes('graphql'), stdout: noThreads },
  )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'open the PR', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Opened https://github.com/acme/greet/pull/12.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-prs' })
  await clock.settle()
  expect(await pane.find({ text: /Linked work/ })).toBeDefined()
  expect(await pane.find({ text: /Branch work/ })).toBeDefined()

  // Showing the tab again looks up the branch's PR, which fails, and holds on the linked PR.
  branchFails = 'HTTP 502'
  isSlow = true
  await pane.press({ key: 'tab-needsYou' })
  await pane.press({ key: 'tab-prs' })
  await pane.press({ key: 'dismiss-pr-acme/greet#12' })
  isSlow = false
  await clock.advance(5000)

  expect(await pane.find({ text: /Linked work/ })).toBeUndefined()
  expect(await pane.find({ text: /Branch work/ })).toBeDefined()
})

test('a stop and an open permission prompt lead the sidebar line until they clear', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [], { HERDR_PANE_ID: 'p1' })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.classic.PermissionRequest({
    tool_name: 'Bash',
    tool_input: { command: 'git push', description: 'Push main to origin' },
  } as never)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('Allow push main to origin?')
  // The prompt closes when its own call returns.
  await $.tool.call({ tool: 'Bash', command: 'git push', description: 'Push main to origin' } as never)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('')

  await $.classic.StopFailure({ error: 'authentication_failed' } as never)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('! Signed out: /login')
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /Run \/login, then send a message to resume\./ })).toBeDefined()
  // The next turn means the session runs again.
  await $.turn.start({ text: 'logged in, go on', turnId: 't2' })
  await clock.settle()
  expect(await band.find({ text: /Stopped/ })).toBeUndefined()
  expect(sidebarLines().at(-1)).toBe('')
})

test('a failing test run shows in the band, reaches the per-turn call, stops a claim that tests pass, and waits in the pane', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world(on, prompts)

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'fix the parser', wait: false, origin: { kind: 'composer' } })
  toolAnswer = { text: ' 11 pass\n 1 fail\n', isError: true }
  await $.tool.call({ tool: RUN_CHECK, checks: ['npm test'] } as never)
  // The band shows the failure before the session has a card.
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /✗ npm test, 11 pass, 1 fail/ })).toBeDefined()

  const blocked = await $.classic.Stop({
    stop_hook_active: false,
    last_assistant_message: 'Fixed the parser. All tests pass. Should I also rename the helper?',
  } as never)
  expect(blocked.block).toContain('npm test failed when it last ran (11 pass, 1 fail)')
  // The stop that follows a send-back goes through.
  const again = await $.classic.Stop({
    stop_hook_active: true,
    last_assistant_message: 'Fixed the parser. All tests pass.',
  } as never)
  expect(again.block).toBeUndefined()
  // A later reply with the same claim is not sent back again for the same run.
  const later = await $.classic.Stop({
    stop_hook_active: false,
    last_assistant_message: 'Fixed the parser. All tests pass.',
  } as never)
  expect(later.block).toBeUndefined()

  await $.turn.complete({
    answer: 'The parser still fails one test.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  expect(prompts.at(-1)).toContain('<checks>\n✗ npm test, 11 pass, 1 fail\n</checks>')
  // The reply Claude was sent back from reaches the update, though it is not the final answer.
  expect(prompts.at(-1)).toContain('Should I also rename the helper?')
  expect(await band.find({ text: /✗ npm test, 11 pass, 1 fail/ })).toBeDefined()

  // Still failing when the turn ended, so it waits on the person until they dismiss it.
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Failing checks 1/ })).toBeDefined()
  await pane.press({ key: 'fix-check:.:npm test' })
  await clock.settle()
  expect(sent.at(-1)).toContain('npm test failed when you last ran it.\nCommand: npm test\nOutput:\n11 pass, 1 fail\n')
  // Once the fix is sent, the row says so and no longer counts as waiting on the person.
  expect(await pane.find({ text: /Fix sent ·/ })).toBeDefined()
  expect(await pane.find({ text: /Failing checks 1/ })).toBeUndefined()
  await pane.press({ key: 'dismiss-check:.:npm test' })
  expect(await pane.find({ text: /Failing checks/ })).toBeUndefined()
  expect(await band.find({ text: /✗ npm test/ })).toBeUndefined()
})

test('a failed check whose folder is gone, such as a removed worktree, drops out', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])
  let isThere = true
  on('fs.exists', () => ({ value: isThere }))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  toolAnswer = { text: ' 11 pass\n 1 fail\n', isError: true }
  await $.tool.call({ tool: RUN_CHECK, checks: ['npm --prefix /tmp/project/wt test'] } as never)
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /✗ npm test in wt/ })).toBeDefined()

  isThere = false
  await $.turn.complete({
    answer: 'Removed the worktree.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  expect(await band.find({ text: /✗ npm test in wt/ })).toBeUndefined()
})

test('run_check reports a pass and a failure with its exit code, and saves the output to a log', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  world(on, [])
  const written: Record<string, string> = {}
  on('fs.write', (_$, e) => {
    written[e.path] = e.text

    return { value: undefined }
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })

  toolAnswer = { text: ' 12 pass\n 0 fail\n', isError: false }
  const passed = await $.tool.call({ tool: RUN_CHECK, checks: ['bun test'] } as never)
  expect(passed.result).toBe(
    'bun test: passed, 12 pass, 0 fail.\n  Log, readable with the Read tool: /tmp/inbox-checks/session-1/bun-test.log',
  )

  toolAnswer = { text: 'Exit code 2\n(fail) parses times\n 11 pass\n 1 fail\n', isError: true }
  const failed = await $.tool.call({ tool: RUN_CHECK, checks: ['bun test'] } as never)
  expect(failed.result).toContain('bun test: failed with exit 2, 11 pass, 1 fail.\n  (fail) parses times\n')
  expect(failed.result).toContain('  Last 30 lines:\n    Exit code 2\n    (fail) parses times')
  expect(written['/tmp/inbox-checks/session-1/bun-test.log']).toBe(toolAnswer.text)
  // Claude reads the session's logs without a prompt, and nothing else on that account.
  const readCheck = (file_path: string) => $.tool.check({ tool: 'Read', input: { file_path } })
  expect((await readCheck('/tmp/inbox-checks/session-1/bun-test.log')).decision).toBe('allow')
  expect((await readCheck('/tmp/inbox-checks/session-1/../../secrets.txt')).decision).not.toBe('allow')
  expect((await readCheck('/tmp/inbox-checks/session-2/bun-test.log')).decision).not.toBe('allow')
})

test("run_check does not run a command with a pipe or two checks, or a subagent's checks", async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  world(on, [])
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })

  const answer = await $.tool.call({
    tool: RUN_CHECK,
    checks: ['npm test | tail -5', 'npm test && tsc', 'echo hi'],
  } as never)
  expect(String(answer.result).match(/not run/g)).toHaveLength(3)
  // A subagent in a worktree of its own would get the main conversation's folder checked.
  const fromSubagent = await $.tool.call({ tool: RUN_CHECK, checks: ['npm test'], agentId: 'a1' } as never)
  expect(String(fromSubagent.result)).toContain('Bash')
  expect(toolCalls).toEqual([])
})

test('a lone check Claude runs in Bash is recorded, and one with a pipe is refused', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  world(on, [])
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })

  const refused = await $.tool.call({
    tool: 'Bash',
    command: 'npm test 2>&1 | tail -5',
    description: 'Run tests',
  } as never)
  expect(refused.deny).toContain(RUN_CHECK)
  // Alone, its exit status is the check's, so it runs and is recorded.
  toolAnswer = { text: 'Exit code 1\n 3 pass\n 1 fail\n', isError: true }
  const alone = await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run tests' } as never)
  expect(alone.deny).toBeUndefined()
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /✗ npm test, 3 pass, 1 fail/ })).toBeDefined()
  const sub = await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run tests', agentId: 'a1' } as never)
  expect(sub.deny).toBeUndefined()
  const background = await $.tool.call({
    tool: 'Bash',
    command: 'npm test',
    description: 'Run tests',
    run_in_background: true,
  } as never)
  expect(background.deny).toBeUndefined()
  const other = await $.tool.call({ tool: 'Bash', command: 'git status', description: 'Status' } as never)
  expect(other.deny).toBeUndefined()
  // The Bash call run_check makes itself is not refused.
  toolAnswer = { text: ' 3 pass\n 0 fail\n', isError: false }
  const ran = await $.tool.call({ tool: RUN_CHECK, checks: ['npm test'] } as never)
  expect(ran.result).toContain('npm test: passed, 3 pass, 0 fail.')
  // The refused command never ran.
  expect(toolCalls).toEqual(['npm test', 'npm test', 'npm test', 'git status', 'npm test'])
})

test('/inbox demo shows sample entries in every tab, sends nothing, and goes back', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  world(on, [])
  on('ui.toast', () => ({ value: undefined }))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  expect((await $.command.run({ command: 'inbox', args: 'demo' } as never)).text).toContain('Showing sample entries')
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Show the Keys list in a footer/ })).toBeDefined()
  // The two sample failing checks are the first rows, so the first question follows them.
  await pane.press({ key: 'next' })
  await pane.press({ key: 'next' })
  await pane.press({ key: 'answer-d11-0' })
  expect(sent).toEqual([])
  await pane.press({ key: 'tab-findings' })
  expect(await pane.find({ text: /Catch-up could read only the turns/ })).toBeDefined()
  await pane.press({ key: 'tab-prs' })
  expect(await pane.find({ text: /Switch tabs with 1, 2 and 3/ })).toBeDefined()
  // The sample PRs are not looked up, and their buttons open nothing.
  await pane.press({ key: 'open-petekp/inbox#31' })
  expect(ran.filter(argv => argv[0] === 'gh' || argv[0] === 'open')).toEqual([])

  await $.command.run({ command: 'inbox', args: 'demo' } as never)
  expect(await pane.find({ text: /Switch tabs with 1, 2 and 3/ })).toBeUndefined()
})

test('a headless run does nothing', async ($, on) => {
  const prompts: string[] = []
  mock.clock(on, { now: 1 })
  world(on, prompts)

  await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'sdk' } })
  await $.turn.complete({ answer: 'hello', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })

  expect(prompts.length).toBe(0)
})
