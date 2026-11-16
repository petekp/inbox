import { expect, test } from 'claude-code/testing'

import { statusCallPrompt } from '../hooks/status-records'
import type { StatusExchange } from '../hooks/status-records'
import { parseStatus } from '../hooks/status'
import { JUDGE_CHECKS, pageMistakes, parseJudgeAnswer } from '../evals/status-judge'
import type { JudgePage } from '../evals/status-judge'
import { minutes, replayFromRecord, runReplay } from '../evals/status-replay'
import { REPLAYS } from '../evals/status-replays'
import { subject, statusOf } from './status-evals-scenes'
import { GOOD_RUNS } from './status-evals-runs'

test('the saved Status replay fixtures and their recorded answers still parse', () => {
  expect(Object.keys(GOOD_RUNS).sort()).toEqual(REPLAYS.map(replay => replay.name).sort())
  for (const [name, answers] of Object.entries(GOOD_RUNS)) {
    expect(answers.length, name).toBeGreaterThan(0)
    for (const answer of answers) {
      if (answer === 'NONE' || answer.startsWith('CLOSED:')) continue
      expect(parseStatus(answer), `${name}: ${answer}`).not.toBeNull()
    }
  }
})

test('legacy subject and milestone lines are ignored alongside current Status lines', () => {
  const current = 'HEAD: Offline sync | Adding offline sync to notes\nGOAL: Offline sync ships'
  const mixed = `${current}\nNEW: working | Sync engine | queues edits offline\nMILESTONE: m1 | Engine complete`

  expect(parseStatus(mixed)).toEqual(parseStatus(current))
})

test('a replay from a call record sends its saved prompt and ignores legacy task operations', async () => {
  const last = statusOf([subject('s1', 'working', 'Sync engine', 'queues edits offline', 0)])
  const exchange: StatusExchange = {
    kind: 'reply',
    exchange: {
      person: 'Go on',
      trigger: null,
      activity: ['Edited sync.ts'],
      reply: 'The engine syncs.',
      turn: 4,
      press: null,
      screen: 'closed',
      tasks: [],
    },
  }
  const input = { last, asks: [], taskTree: [], now: minutes(30) + 1234 }
  const prompts: string[] = []
  const replay = replayFromRecord({ input, exchange }, 'recorded', {
    before: { focus: 'sync', focusMatch: 'sync', pieces: [], asks: [], notWork: [], children: [], changed: [] },
    after: {},
  })
  const [step] = await runReplay(replay, {
    agent: 'claude',
    ask: async prompt => {
      prompts.push(prompt)
      return { text: 'SET: s1 | working | syncs on reconnect' }
    },
  })

  expect(prompts).toEqual([statusCallPrompt(input, exchange)])
  expect(step!.session.ledger.overview!.subjects).toEqual(last.subjects)
  expect(step!.session.taskTree).toEqual([])
})

test('the judge answer parser reads one verdict per check and refuses a missing or doubled one', () => {
  const lines = JUDGE_CHECKS.map(check => `${check.id} | pass | fine`)
  expect(parseJudgeAnswer(['Some prose first.', ...lines].join('\n'))!.map(verdict => verdict.verdict)).toEqual(
    lines.map(() => 'pass'),
  )
  expect(parseJudgeAnswer(lines.slice(1).join('\n'))).toBeNull()
  expect(parseJudgeAnswer([...lines, lines[0]!].join('\n'))).toBeNull()
})

test('a page is called right only when the judge fails just the check a bad page breaks', () => {
  const page: JudgePage = { id: 'p', page: '', previous: null, facts: '', breaks: 'marks', note: '' }
  const verdicts = (failing: string[]) =>
    parseJudgeAnswer(
      JUDGE_CHECKS.map(check => `${check.id} | ${failing.includes(check.id) ? 'fail' : 'pass'} | x`).join('\n'),
    )

  expect(pageMistakes(page, verdicts(['marks']))).toEqual([])
  expect(pageMistakes(page, verdicts([]))).toEqual(['marks: pass, expected fail'])
  expect(pageMistakes(page, verdicts(['marks', 'head']))).toEqual(['head: fail, expected pass'])
  const noGoal: JudgePage = { ...page, breaks: null, na: ['goal'] }
  const withNa = parseJudgeAnswer(
    JUDGE_CHECKS.map(check => `${check.id} | ${check.id === 'goal' ? 'n/a' : 'pass'} | x`).join('\n'),
  )
  expect(pageMistakes(noGoal, withNa)).toEqual([])
  expect(pageMistakes(noGoal, verdicts([]))).toEqual(['goal: pass, expected n/a'])
})
