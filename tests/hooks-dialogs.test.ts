import { expect, mock, test } from 'claude-code/testing'
import type { Closed, Item } from '../types'
import { w, world } from './hooks-world'
import { PANE, selectRow } from './hooks-helpers'

test('a question the desktop app’s box shows reaches the update, even when the turn ends with no text', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts)

  await $.session.start({ cwd: '/tmp/project', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'file this finding', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'file this finding', turnId: 't1' })
  await $.tool.call({
    tool: 'mcp__ccd_turn__wrap_up',
    recap: 'No issue tracker is connected.',
    ask: 'Which tracker should I file it in?',
    actions: [{ label: 'Retry GitHub' }, { label: 'Use another tracker' }],
  } as never)
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()

  expect(prompts.length).toBe(1)
  expect(prompts[0]).toContain(
    '<reply>\nNo issue tracker is connected.\n\nWhich tracker should I file it in?\nOptions: Retry GitHub / Use another tracker\n</reply>',
  )
})

test('a dialog reaches the model with its questions, whether answered or dismissed, and a dismissed one’s copy, added by the update or recorded by Claude, shows its option descriptions under the notes Claude recorded', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts)
  const ask = (...questions: { question: string; options: { label: string; description?: string }[] }[]) =>
    $.tool.call({ tool: 'AskUserQuestion', questions } as never)
  const turn = async (turnId: string, dialog: () => Promise<unknown>, ending: 'answer' | 'aborted' = 'answer') => {
    await $.prompt.submit({ text: 'go on', wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text: 'go on', turnId })
    await dialog()
    const answer = ending === 'answer' ? 'Done.' : ''
    await $.turn.complete({ answer, durationMs: 5, isAborted: ending === 'aborted', turnId, reason: ending })
    await clock.settle()
  }
  const push = { question: 'Push the fix now?', options: [{ label: 'Push now (Recommended)' }, { label: 'Wait' }] }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  w.dialogAnswer = { result: {}, text: 'User has answered: Push now' }
  await turn('t1', () => ask(push))
  expect(prompts.at(-1)).toContain('Push the fix now?')
  expect(prompts.at(-1)).toContain('User has answered: Push now')

  w.dialogAnswer = {
    isError: true,
    result: 'User declined to answer questions',
    text: 'User declined to answer questions',
  }
  await turn('t2', () => ask(push), 'aborted')
  expect(prompts.length).toBe(2)
  expect(prompts.at(-1)).toContain('Push the fix now?')
  expect(prompts.at(-1)).toContain('the user dismissed it without answering')
  expect(prompts.at(-1)).not.toContain('User declined')

  w.dialogAnswer = { result: {}, text: 'Both answered' }
  await turn('t3', () => ask(push, { question: 'Which branch?', options: [{ label: 'main' }, { label: 'next' }] }))
  expect(prompts.at(-1)).toContain('Which branch?')

  const itemAsking = (ask: string) =>
    (JSON.parse(w.stored.get('s:session-1')!) as { ledger: { items: Item[] } }).ledger.items.find(i => i.ask === ask)
  w.dialogAnswer = {
    isError: true,
    result: 'User declined to answer questions',
    text: 'User declined to answer questions',
  }
  w.ledgerReply = 'NEW: decide | - | Deploy to staging? | Deploy / Hold | -'
  const deploy = {
    question: 'Deploy to staging now?',
    options: [
      { label: 'Deploy', description: 'Runs the staging pipeline' },
      { label: 'Hold', description: 'Waits for the review' },
    ],
  }
  await turn('t4', () => ask(deploy), 'aborted')
  expect(prompts.at(-1)).not.toContain('Runs the staging pipeline')
  const deployItem = itemAsking('Deploy to staging?')
  expect(deployItem?.optionDescriptions).toEqual({ Deploy: 'Runs the staging pipeline', Hold: 'Waits for the review' })
  const pane = await $.ui.mount(PANE)
  await selectRow(pane, `${deployItem?.id}`)
  await clock.settle()
  const texts = (await pane.findAll({ type: 'Text' })).map(t => t.text ?? '')
  expect(texts).toContain('Deploy: Runs the staging pipeline')
  expect(texts).toContain('Hold: Waits for the review')

  w.ledgerReply = 'NEW: decide | - | Clear stored data? | Yes / No | -'
  const yesNo = (yes: string, no: string) => [
    { label: 'Yes', description: yes },
    { label: 'No', description: no },
  ]
  await turn(
    't5',
    () =>
      ask(
        { question: 'Delete the cache?', options: yesNo('Removes cached builds', 'Keeps them') },
        { question: 'Rebuild the index?', options: yesNo('Takes ten minutes', 'Uses the old index') },
      ),
    'aborted',
  )
  expect(itemAsking('Clear stored data?')?.optionDescriptions).toBeUndefined()

  w.ledgerReply = 'NONE'
  const port = {
    question: 'Which port should the server use?',
    options: [
      { label: '3000', description: 'The default the docs use' },
      { label: '8080', description: 'Free on the staging box' },
    ],
  }
  await turn(
    't6',
    async () => {
      await ask(port)
      await $.tool.call({
        tool: 'mcp__inbox__record',
        kind: 'question',
        ask: 'Which port should the server use?',
        options: ['3000', '8080'],
        option_notes: ['Matches the README'],
      } as never)
    },
    'aborted',
  )
  expect(itemAsking('Which port should the server use?')?.optionDescriptions).toEqual({
    3000: 'Matches the README',
    8080: 'Free on the staging box',
  })
})

test('a dialog the person answers closes the question that copies it with their answer, whether Claude recorded it before or after the dialog', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const stored = () => JSON.parse(w.stored.get('s:session-1')!) as { ledger: { items: Item[]; closed: Closed[] } }
  const push = { question: 'Push the fix now?', options: [{ label: 'Push now (Recommended)' }, { label: 'Wait' }] }
  const record = (ask: string, options: string[]) =>
    $.tool.call({ tool: 'mcp__inbox__record', kind: 'question', ask, options } as never)
  const turn = async (turnId: string, body: () => Promise<unknown>) => {
    await $.prompt.submit({ text: 'go on', wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text: 'go on', turnId })
    await body()
    await $.turn.complete({ answer: 'Done.', durationMs: 5, isAborted: false, turnId, reason: 'answer' })
    await clock.settle()
  }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  w.dialogAnswer = { result: {}, text: 'User has answered: Push now' }
  await turn('t1', async () => {
    await record('Push the fix now?', ['Push now', 'Wait'])
    await $.tool.call({ tool: 'AskUserQuestion', questions: [push] } as never)
  })
  expect(stored().ledger.items).toEqual([])
  expect(stored().ledger.closed.at(-1)).toMatchObject({
    ask: 'Push the fix now?',
    how: 'answered',
    outcome: 'Push now',
  })

  w.dialogAnswer = { result: {}, text: 'User has answered: a branch of my own' }
  const branch = { question: 'Which branch?', options: [{ label: 'main' }, { label: 'next' }] }
  await turn('t2', async () => {
    await $.tool.call({ tool: 'AskUserQuestion', questions: [branch] } as never)
    const r = await record('Which branch?', ['main', 'next'])
    expect(r.result).toBe(
      'Not shown as open: the user already answered this in your dialog (a branch of my own), so it closed with that answer.',
    )
  })
  expect(stored().ledger.items).toEqual([])
  expect(stored().ledger.closed.at(-1)).toMatchObject({
    ask: 'Which branch?',
    how: 'answered',
    outcome: 'a branch of my own',
  })

  w.dialogAnswer = { result: {}, text: 'User has answered: Yes' }
  await turn('t3', async () => {
    await record('Delete the cache?', ['Yes', 'No'])
    await $.tool.call({
      tool: 'AskUserQuestion',
      questions: [{ question: 'Rebuild the index?', options: [{ label: 'Yes' }, { label: 'No' }] }],
    } as never)
  })
  expect(stored().ledger.items.map(i => i.ask)).toEqual(['Delete the cache?'])
})
