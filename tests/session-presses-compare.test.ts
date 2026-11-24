import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { CLAUDE_CODE } from '../core/domain/model-text'
import { endTurn, notePrompt, turnEnded, turnStarted } from '../core/runtime/session-turns'
import { recorded } from '../core/runtime/session-presses'
import { sessionView } from '../core/view/session-view'
import { runUpdates } from '../core/runtime/session-host'
import { press } from '../core/runtime/host-press'
import { allRows } from '../core/view/rows'
import { COMPARE_LIMIT_MS, NO_HOLDS } from '../core/view/timing'
import { feedbackText } from '../core/view/feedback'
import { fakeHost } from './session-fake-host'
import { TOOL_FIELDS } from '../core/domain/tool-schemas'

async function pressedCompare() {
  const { host } = fakeHost(async () => 'NONE')
  const call = async (tool: 'record' | 'close', args: Record<string, unknown>) => {
    let result = ''
    await host.update(async s => {
      const r = recorded(CLAUDE_CODE, s, tool, args, await host.now(), TOOL_FIELDS, null)
      result = r.result
      return r.state
    })
    return result
  }
  const question = { kind: 'question', ask: 'Which cache should the API use?', options: ['Redis', 'In-memory'] }
  await call('record', question)
  const id = (await host.read()).ledger.items[0]!.id
  await press(host, { action: 'compare', id }, false, NO_HOLDS)
  await host.update(async s => turnStarted(s, await host.now()))
  const compared = { ...question, steps: ['/tmp/project/.scratch/compare/caches.html'] }

  return { host, call, id, compared }
}

test('a close with a reason of a question recorded again after its Compare press is refused in that turn, and takes effect in a later one', async () => {
  const { host, call, id, compared } = await pressedCompare()
  await call('record', compared)

  expect(await call('close', { id, reason: 'replaced by the compared copy' })).toBe(
    'Not closed: your record updated this question, and it stays open for the user.',
  )
  expect((await host.read()).ledger.items.map(i => i.id)).toEqual([id])

  await host.update(async s => turnEnded(endTurn(CLAUDE_CODE, s, 'I pick Redis.', false), await host.now()))
  await host.update(async s => turnStarted(s, await host.now()))
  expect(await call('close', { id, reason: 'the person dropped caching' })).toMatch(
    /^Closed "Which cache should the API use\?"\./,
  )
})

test('a record after the agent closed the question with a reason in its Compare turn reopens that question and updates it', async () => {
  const { host, call, id, compared } = await pressedCompare()

  expect(await call('close', { id, reason: 'replaced by the compared copy' })).toMatch(
    /^Closed "Which cache should the API use\?"\./,
  )
  expect(await call('record', compared)).toBe(
    'Already open, so this record updated it and added its new steps. Its close id is i1. A close id is only for the close tool. Never write one in a reply.',
  )
  const { ledger } = await host.read()
  expect(ledger.items.map(i => i.id)).toEqual([id])
  expect(ledger.closed.map(c => c.id)).toEqual([])
})

test("a close with the person's answer after a Compare press takes effect", async () => {
  const { host, call, id, compared } = await pressedCompare()
  await call('record', compared)

  expect(await call('close', { id, answer: 'Redis' })).toMatch(/^Closed "Which cache should the API use\?"\./)
  expect((await host.read()).ledger.items).toEqual([])
})

test('Compare reads Comparing… after its reply until the agent records the question again with its page, or until its limit passes', async () => {
  const { host, delivered } = fakeHost(async () => 'NONE')
  const record = async (args: Record<string, unknown>) => {
    let result = ''
    await host.update(async s => {
      const r = recorded(CLAUDE_CODE, s, 'record', args, await host.now(), TOOL_FIELDS, null)
      result = r.result
      return r.state
    })
    return result
  }
  const turn = async (prompt: string, reply: string) => {
    await host.update(s => notePrompt(CLAUDE_CODE, s, prompt, false).state)
    await host.update(s => endTurn(CLAUDE_CODE, s, reply, false))
    await runUpdates(host)
  }
  const question = {
    kind: 'question',
    ask: 'Which cache should the API use?',
    options: ['Redis', 'In-memory'],
    design_choice: true,
  }
  await host.update(s => notePrompt(CLAUDE_CODE, s, 'Add caching to the API', false).state)
  await record(question)
  await host.update(s => endTurn(CLAUDE_CODE, s, 'Which cache should the API use?', false))
  await runUpdates(host)
  const id = (await host.read()).ledger.items[0]!.id
  const row = async (later = 0) => {
    const view = sessionView(await host.read(), (await host.now()) + later, host.settleWindowMs)
    const r = allRows(view).find(x => x.id === id)!

    return { feedback: r.feedback && feedbackText(r.feedback, 'terminal'), actions: r.actions.map(a => a.label) }
  }

  await press(host, { action: 'compare', id }, false, NO_HOLDS)
  await turn(delivered.at(-1)!, 'A subagent is comparing the two caches.')
  expect(await row()).toEqual({
    feedback: 'Comparing…',
    actions: ['Redis', 'In-memory', 'Reply', 'Explain', 'Compare', 'Dismiss'],
  })
  expect(await row(COMPARE_LIMIT_MS)).toEqual({
    feedback: 'No comparison came back',
    actions: ['Redis', 'In-memory', 'Reply', 'Explain', 'Compare again', 'Dismiss'],
  })

  const reported = await record({ ...question, steps: ['/tmp/project/.scratch/compare/caches.html', 'npm test'] })
  expect(reported).toBe(
    'Already open, so this record updated it and added its new steps. Its close id is i1. A close id is only for the close tool. Never write one in a reply. Some steps were not an absolute file path or a link, so they are left out.',
  )
  expect(await row()).toEqual({
    feedback: '✓ Compared',
    actions: ['Redis', 'In-memory', 'Open caches.html', 'Reply', 'Explain', 'Compare again', 'Dismiss'],
  })

  await press(host, { action: 'compare', id }, false, NO_HOLDS)
  await turn(delivered.at(-1)!, 'A subagent is comparing the two caches again.')
  expect(await row()).toEqual({
    feedback: 'Comparing…',
    actions: ['Redis', 'In-memory', 'Open caches.html', 'Reply', 'Explain', 'Compare again', 'Dismiss'],
  })
})
