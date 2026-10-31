import { expect, mock, test } from 'claude-code/testing'
import { demoView } from '../hooks/demo'
import { PRESS_GUARD_MS, SETTLED_MS } from '../hooks/view'
import { w, world } from './hooks-world'
import { BAND, PANE, leaveAndReturn, replyKey } from './hooks-helpers'

test(
  '/inbox demo shows sample entries in every tab, presses change only its copy, the reply to a press leaves the sample’s hand-off waiting, and [Hide demo] goes back',
  { timeoutMs: 20_000 },
  async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    const demo = demoView(1_000_000, 'Claude')
    const literal = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const branchRef = demo.prViews.branchRef!
    const linkedRef = demo.ledger.prs.find(ref => ref !== branchRef)!
    const [repo, linkedNumber] = linkedRef.split('#') as [string, string]
    const view = (number: number, title: string) =>
      JSON.stringify({
        number,
        title,
        url: `https://github.com/${repo}/pull/${number}`,
        isDraft: false,
        state: 'OPEN',
        baseRefName: 'main',
        mergeable: 'MERGEABLE',
        reviewDecision: 'APPROVED',
        statusCheckRollup: [],
      })
    w.ghAnswers.push(
      {
        match: argv => argv.includes('view') && argv.includes(linkedNumber),
        stdout: view(Number(linkedNumber), 'Real linked work'),
      },
      { match: argv => argv.includes('view') && !argv.includes(linkedNumber), stdout: view(40, 'Real branch work') },
      {
        match: argv => argv.includes('graphql'),
        stdout: JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } }),
      },
    )

    await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
    await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
    await $.turn.complete({
      answer: `Plan ready. Opened https://github.com/${repo}/pull/${linkedNumber}.`,
      durationMs: 5,
      isAborted: false,
      turnId: 't1',
      reason: 'answer',
    })
    await clock.settle()
    const saved = w.stored.get('s:session-1')
    expect(saved).toContain('Use Node or Python?')
    expect(saved).toContain(linkedRef)
    const ranBeforeDemo = w.ran.length

    expect((await $.command.run({ command: 'inbox', args: 'demo' } as never)).text).toContain('Showing sample entries')
    w.paneState = { isShown: true, isFocused: true }
    const pane = await $.ui.mount(PANE)
    const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
    expect(await pane.find({ text: 'Sample entries. Buttons here send nothing.' })).toBeDefined()
    expect(await pane.find({ text: /Use Node or Python/ })).toBeUndefined()
    expect(await band.find({ text: /^Demo: Asks 7/ })).toBeDefined()
    for (const view of [pane, band]) expect(await view.find({ key: 'hide-demo' })).toBeDefined()
    expect(await pane.find({ key: 'settled-d10' })).toBeDefined()

    await clock.advance(PRESS_GUARD_MS)
    await pane.press({ key: 'answer-d11-0' })
    await clock.settle()
    expect(w.sent).toEqual([])
    expect(await pane.find({ key: 'answer-d11-0' })).toBeUndefined()
    expect(await pane.find({ text: demo.ledger.items.find(i => i.id === 'd11')!.options[0] })).toBeDefined()

    await pane.press({ key: 'title-d17' })
    await clock.advance(PRESS_GUARD_MS)
    await pane.press({ key: 'explain-d17-key' })
    await clock.advance(SETTLED_MS)
    expect(await pane.find({ text: /✓\sExplain/ })).toBeDefined()
    expect(await pane.find({ text: /Still open/ })).toBeUndefined()
    expect(await band.find({ text: /Asks 6/ })).toBeDefined()

    await pane.press({ key: 'typekey-d17' })
    await pane.input({ key: await replyKey(pane, 'd17'), text: 'Done in both.' })
    await clock.settle()
    expect(await band.find({ text: /Asks 5/ })).toBeDefined()

    await pane.press({ key: 'title-d14' })
    await clock.advance(PRESS_GUARD_MS)
    await pane.press({ key: 'done-d14' })
    await clock.settle()
    expect(await pane.find({ key: 'done-d14' })).toBeUndefined()
    expect(await pane.find({ key: 'settled-d14' })).toBeDefined()
    const doneTask = literal(demo.ledger.items.find(i => i.id === 'd14')!.ask)
    expect(await pane.find({ text: doneTask })).toBeDefined()
    expect(await band.find({ text: /Asks 4/ })).toBeDefined()
    await pane.press({ key: 'undo-d14' })
    expect(await pane.find({ key: 'done-d14' })).toBeDefined()
    expect(await band.find({ text: /Asks 5/ })).toBeDefined()
    await clock.advance(PRESS_GUARD_MS)
    await pane.press({ key: 'done-d14' })
    await clock.advance(SETTLED_MS)
    expect(await pane.find({ key: 'settled-d14' })).toBeDefined()
    expect(await pane.find({ key: 'undo-d14' })).toBeUndefined()
    expect(await pane.find({ text: /Still open/ })).toBeDefined()
    expect(await band.find({ text: /Asks 5/ })).toBeDefined()
    expect(w.sent).toEqual([])

    await pane.press({ key: 'tab-findings' })
    expect(await pane.find({ text: literal(demo.ledger.findings[0]!.title) })).toBeDefined()
    await pane.press({ key: 'tab-prs' })
    expect(await pane.find({ text: literal(demo.prViews.views[branchRef]!.title) })).toBeDefined()
    await pane.press({ key: `open-${branchRef}` })
    expect(await pane.find({ text: /✓ Opened/ })).toBeDefined()
    await pane.press({ key: `dismiss-pr-${linkedRef}` })
    expect(await pane.find({ key: `settled-pr:${linkedRef}` })).toBeDefined()
    await clock.advance(SETTLED_MS)
    expect(await pane.find({ key: `undo-pr:${linkedRef}` })).toBeUndefined()
    await leaveAndReturn(pane, clock, 'prs')
    expect(await pane.find({ text: literal(demo.prViews.views[linkedRef]!.title) })).toBeUndefined()
    await pane.press({ key: 'tab-needsYou' })
    expect(await pane.find({ key: 'settled-d10' })).toBeUndefined()
    expect(await pane.find({ key: 'settled-d14' })).toBeUndefined()
    await pane.press({ key: 'tab-prs' })
    expect(w.stored.get('s:session-1')).toBe(saved)
    expect(w.ran.slice(ranBeforeDemo).filter(argv => argv[0] === 'gh' || argv[0] === 'open')).toEqual([])

    await pane.press({ key: 'hide-demo' })
    await clock.settle()
    expect(await pane.find({ text: /Real linked work/ })).toBeDefined()
    expect(await pane.find({ text: /Real branch work/ })).toBeDefined()

    await pane.press({ key: 'tab-needsYou' })
    expect(await pane.find({ text: /Use Node or Python/ })).toBeDefined()
    expect(await pane.find({ key: 'explain-i1-key' })).toBeDefined()
    expect(await pane.find({ text: /Sample entries\./ })).toBeUndefined()
    expect(await band.find({ text: /Asks 2/ })).toBeDefined()
    const savedAfter = w.stored.get('s:session-1')!
    expect(savedAfter).toContain('Real branch work')
    expect(savedAfter).not.toContain(demo.ledger.items[0]!.ask)
  },
)

test('/inbox demo recording shows the sample entries without the notices that mark them as samples', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const demo = demoView(1_000_000, 'Claude')
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })

  expect((await $.command.run({ command: 'inbox', args: 'demo recording' } as never)).text).toContain('for a recording')
  const pane = await $.ui.mount(PANE)
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await pane.find({ text: demo.ledger.items.find(i => i.id === 'd11')!.options[0] })).toBeDefined()
  expect(await pane.find({ text: /Sample entries\./ })).toBeUndefined()
  expect(await band.find({ text: /^Asks 7/ })).toBeDefined()
  for (const view of [pane, band]) expect(await view.find({ key: 'hide-demo' })).toBeUndefined()

  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'answer-d11-0' })
  await clock.settle()
  expect(w.sent).toEqual([])
  expect(await pane.find({ key: 'answer-d11-0' })).toBeUndefined()

  expect((await $.command.run({ command: 'inbox', args: 'demo' } as never)).text).toBe('Opened the inbox.')
  expect((await $.command.run({ command: 'inbox', args: 'demo' } as never)).text).toContain('Run /inbox demo again')
  expect(await pane.find({ text: /Sample entries\./ })).toBeDefined()
  expect(await band.find({ text: /^Demo: Asks 7/ })).toBeDefined()
})
