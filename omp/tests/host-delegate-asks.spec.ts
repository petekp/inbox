import { afterEach, beforeEach, expect, test } from 'bun:test'
import { join } from 'node:path'

import { createInbox } from '../src/host'
import { deps, endAgent, endWorld, pi, prompt, record, settle, startWorld, state, w } from './host-harness'

beforeEach(startWorld)
afterEach(endWorld)

const inTerminal = (labels: Record<string, string>) => {
  const appHome = join(w.dir, 'herdr-app')
  const herdrTarget = { kind: 'terminal', terminal: 't9', appHome, hc: ['hc'], herdrApp: ['herdr-app'] } as const
  w.execResults.set('hc', { code: 0, stdout: JSON.stringify({ address: 't9', parent: 't1', labels }) })
  createInbox(pi(), { ...deps(), herdrTarget })
}

const answerText = (r: { content: { text: string }[] }) => r.content[0]?.text ?? ''
const QUESTION = { kind: 'question', ask: 'Which cache should the API use?', options: ['Redis', 'Memory'] }
const FINDING = { kind: 'finding', finding_kind: 'issue', title: 'No lint script', detail: 'Only tests run.' }

test('in a delegate’s Herdr app terminal, omp’s record tool refuses a question or task, records a finding, and the update adds no question', async () => {
  inTerminal({ 'fleet.domain': 'inbox', 'fleet.task': 'asks' })
  await prompt('Add a greeting CLI')

  expect(answerText(await record(QUESTION))).toMatch(/^Not recorded: this is a delegate session.*Herdr terminal t1/)
  expect(answerText(await record({ kind: 'task', ask: 'Sign in to npm' }))).toMatch(/^Not recorded: /)
  expect(answerText(await record(FINDING))).toMatch(/^Recorded\. /)
  await endAgent('Plan written. Which runtime?')
  await settle()

  expect(state().ledger.items).toEqual([])
  expect(state().ledger.findings.map((f: { title: string }) => f.title)).toEqual(['No lint script'])
})

test('in a coordinator’s Herdr app terminal, omp’s record tool and update add questions as in any session', async () => {
  inTerminal({ 'fleet.domain': 'inbox', 'fleet.role': 'coordinator' })
  await prompt('Add a greeting CLI')

  expect(answerText(await record({ kind: 'task', ask: 'Sign in to npm' }))).toMatch(/^Recorded\. /)
  await endAgent('Plan written. Which runtime?')
  await settle()

  expect(state().ledger.items.map((i: { ask: string }) => i.ask)).toEqual(['Sign in to npm', 'Use Node or Python?'])
})
