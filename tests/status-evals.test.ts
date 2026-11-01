import { expect, test } from 'claude-code/testing'

import { statusCallPrompt } from '../hooks/status-records'
import type { StatusExchange } from '../hooks/status-records'
import { statusPage } from '../hooks/status-page'
import { factsAfter, factsText } from '../evals/status-facts'
import type { Facts } from '../evals/status-facts'
import { JUDGE_CHECKS, pageMistakes, parseJudgeAnswer } from '../evals/status-judge'
import type { JudgePage } from '../evals/status-judge'
import { minutes, replayFromRecord, runReplay } from '../evals/status-replay'
import type { ModelCall, Replay } from '../evals/status-replay'
import { REPLAYS } from '../evals/status-replays'
import { blockingFailures, gradeReplay, gradeStep, tally } from '../evals/status-grade'
import { RULES } from '../evals/status-rules'
import { subject, statusOf, sessionOf, baseScene, contextOf, SCENES, GOOD_RUNS } from './status-evals-scenes'
import type { Scene } from './status-evals-scenes'

function failuresOf(rule: string, change?: (s: Scene) => void): string[] {
  const scene = baseScene()
  change?.(scene)
  return gradeStep(contextOf(scene)).find(r => r.rule === rule)!.failures
}

test('every fixed rule passes a good page and fails a bad one', () => {
  expect(RULES.map(r => r.id).sort()).toEqual(Object.keys(SCENES).sort())
  for (const [rule, scene] of Object.entries(SCENES)) {
    expect({ rule, failures: failuresOf(rule, scene.good) }).toEqual({ rule, failures: [] })
    expect({ rule, fails: failuresOf(rule, scene.bad).length > 0 }).toEqual({ rule, fails: true })
  }
})

function scripted(answers: string[]): ModelCall {
  const queue = [...answers]
  return async () => {
    if (queue.length === 0) throw new Error('the script ran out of answers')
    return { text: queue.shift()! }
  }
}

async function gradedRun(replay: Replay, answers: string[]) {
  const steps = await runReplay(replay, { agent: 'claude', ask: scripted(answers) })
  return gradeReplay(replay, steps).map((results, n) => ({
    step: n,
    failed: blockingFailures(results).map(r => r.rule),
  }))
}

const BAD_RUNS: Record<string, { at: number; answer: string; breaks: string }> = {
  'coordinator-day': {
    at: 2,
    answer: GOOD_RUNS['coordinator-day']![2]!.replace(
      'DONE: s6 | filed for later',
      'SET: s6 | queued | filed for later',
    ),
    breaks: 'marks-true',
  },
  'single-task': { at: 7, answer: 'SET: s2 | working | last-write-wins with backup', breaks: 'was-on-reversal' },
  'long-turn': { at: 1, answer: 'SET: s2 | working | reading the ranking code', breaks: 'no-news-no-move' },
  'catch-up-from-empty': {
    at: 0,
    answer: GOOD_RUNS['catch-up-from-empty']![0]!.replace('DONE: Image attachments | show inline\n', ''),
    breaks: 'piece-once',
  },
}

test('a good run of each replay passes every rule that is built, at every step', async () => {
  expect(Object.keys(GOOD_RUNS).sort()).toEqual(REPLAYS.map(r => r.name).sort())
  for (const r of REPLAYS) {
    const steps = await gradedRun(r, GOOD_RUNS[r.name]!)
    expect({ replay: r.name, failed: steps.filter(s => s.failed.length > 0) }).toEqual({ replay: r.name, failed: [] })
  }
})

test('a bad run of each replay fails the rule it breaks at the step it breaks, and nothing before', async () => {
  for (const r of REPLAYS) {
    const bad = BAD_RUNS[r.name]!
    const answers = [...GOOD_RUNS[r.name]!]
    answers[bad.at] = bad.answer
    const steps = await gradedRun(r, answers)
    const answerStep = (() => {
      let seen = -1
      for (const [n, step] of r.steps.entries()) {
        const calls = step.call ? (r.hasLedgerCalls && step.call.kind === 'reply' ? 2 : 1) : 0
        seen += calls
        if (seen >= bad.at) return n
      }
      return -1
    })()
    expect({ replay: r.name, before: steps.slice(0, answerStep).filter(s => s.failed.length > 0) }).toEqual({
      replay: r.name,
      before: [],
    })
    expect({ replay: r.name, failed: steps[answerStep]!.failed }).toEqual({ replay: r.name, failed: [bad.breaks] })
  }
})

test('a failure left on the page counts once, at the step where it first appears, and later steps carry it', async () => {
  const r = REPLAYS.find(x => x.name === 'coordinator-day')!
  const bad = BAD_RUNS[r.name]!
  const answers = [...GOOD_RUNS[r.name]!]
  answers[bad.at] = bad.answer
  const marks = gradeReplay(r, await runReplay(r, { agent: 'claude', ask: scripted(answers) })).map(results =>
    results.find(x => x.rule === bad.breaks)!,
  )
  const failing = marks.flatMap((m, n) => (m.failures.length > 0 ? [n] : []))
  expect(failing.length).toBeGreaterThan(1)
  expect(marks.map(tally).filter(t => t === 'fail')).toHaveLength(1)
  expect(failing.slice(1).map(n => marks[n]!.fresh)).toEqual(failing.slice(1).map(() => []))
})

const RULE_IDS = new Set<string>(RULES.map(r => r.id))
const JUDGE_ONLY_IDS = new Set<string>(JUDGE_CHECKS.map(c => c.id).filter(id => !RULE_IDS.has(id)))

test('every replay is well formed: times rise, facts name known pieces, asks open before they close, and each target or known failing judge check is a check its step runs', () => {
  for (const r of REPLAYS) {
    let facts: Facts = { ...r.start.facts, changed: [] }
    const opened = new Set(r.start.ledger.items?.map(i => i.id) ?? [])
    let last = -Infinity
    for (const step of r.steps) {
      const where = `${r.name}: ${step.label}`
      expect({ where, rises: step.at > last }).toEqual({ where, rises: true })
      last = step.at
      for (const p of step.facts?.pieces ?? []) {
        const isKnown = facts.pieces.some(x => x.id === p.id)
        const isWhole = typeof p.match === 'string' && !!p.names && !!p.state && typeof p.stands === 'string'
        expect({ where, piece: p.id, ok: isKnown || isWhole }).toEqual({ where, piece: p.id, ok: true })
      }
      facts = factsAfter(facts, step.facts)
      const ids = new Set(facts.pieces.map(p => p.id))
      for (const a of facts.asks)
        for (const id of a.holdsUp) expect({ where, id, ok: ids.has(id) }).toEqual({ where, id, ok: true })
      for (const c of facts.children)
        expect({ where, serves: c.serves, ok: ids.has(c.serves) }).toEqual({ where, serves: c.serves, ok: true })
      for (const p of facts.pieces) expect(() => new RegExp(p.match, 'i')).not.toThrow()
      for (const e of step.events ?? []) {
        if ('askOpens' in e) opened.add(e.askOpens.id)
        if ('askCloses' in e)
          expect({ where, closes: e.askCloses, ok: opened.has(e.askCloses) }).toEqual({
            where,
            closes: e.askCloses,
            ok: true,
          })
      }
      for (const t of step.targets ?? []) {
        const isRun = RULE_IDS.has(t) || (JUDGE_ONLY_IDS.has(t) && step.checkpoint === true)
        expect({ where, target: t, ok: isRun }).toEqual({ where, target: t, ok: true })
      }
      for (const id of Object.keys(step.judgeUntil ?? {})) {
        const isJudged = JUDGE_ONLY_IDS.has(id) && step.checkpoint === true
        expect({ where, judgeUntil: id, ok: isJudged }).toEqual({ where, judgeUntil: id, ok: true })
      }
    }
  }
})

test('a replay from a call record sends the prompt the record holds, at the time it ran', async () => {
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
  const input = { last, asks: [], tasks: [], now: minutes(30) + 1234 }
  const prompts: string[] = []
  const r = replayFromRecord({ input, exchange }, 'recorded', {
    before: { focus: 'sync', focusMatch: 'sync', pieces: [], asks: [], notWork: [], children: [], changed: [] },
    after: {},
  })
  const [step] = await runReplay(r, {
    agent: 'claude',
    ask: async prompt => {
      prompts.push(prompt)
      return { text: 'SET: s1 | working | syncs on reconnect' }
    },
  })

  expect(prompts).toEqual([statusCallPrompt(input, exchange)])
  expect(step!.session.ledger.overview!.subjects[0]).toMatchObject({ text: 'syncs on reconnect', changedAt: input.now })
})

test('an answer past the host limit is dropped as the host drops it, and the page says the update failed', async () => {
  const r = REPLAYS.find(x => x.name === 'long-turn')!
  let t = 0
  const [step] = await runReplay(
    { ...r, steps: r.steps.slice(0, 1) },
    { agent: 'claude', ask: async () => ({ text: 'UNCHANGED', outputTokens: 2000 }), clock: () => (t += 1000) },
  )

  expect(step!.isStatusFailed).toBe(true)
  expect(step!.page.error).not.toBeNull()
  expect(step!.calls[0]!.overLimit).toMatch(/2000 tokens/)
})

test('the judge answer parser reads one verdict per check and refuses a missing or doubled one', () => {
  const lines = JUDGE_CHECKS.map(c => `${c.id} | pass | fine`)
  expect(parseJudgeAnswer(['Some prose first.', ...lines].join('\n'))!.map(v => v.verdict)).toEqual(
    lines.map(() => 'pass'),
  )
  expect(parseJudgeAnswer(lines.slice(1).join('\n'))).toBeNull()
  expect(parseJudgeAnswer([...lines, lines[0]!].join('\n'))).toBeNull()
})

test('a page is called right only when the judge fails just the check a bad page breaks', () => {
  const page: JudgePage = { id: 'p', page: '', previous: null, facts: '', breaks: 'marks', note: '' }
  const verdicts = (failing: string[]) =>
    parseJudgeAnswer(JUDGE_CHECKS.map(c => `${c.id} | ${failing.includes(c.id) ? 'fail' : 'pass'} | x`).join('\n'))

  expect(pageMistakes(page, verdicts(['marks']))).toEqual([])
  expect(pageMistakes(page, verdicts([]))).toEqual(['marks: pass, expected fail'])
  expect(pageMistakes(page, verdicts(['marks', 'head']))).toEqual(['head: fail, expected pass'])
})

test('the facts read the same pieces, asks and running work the judge is told about', () => {
  const text = factsText(baseScene().facts)

  expect(text).toMatch(/Focus now: adding offline sync/)
  expect(text).toMatch(/- Sync engine: being worked on now\. syncs on reconnect\. Changed at this step\./)
  expect(text).toMatch(/"Last-write-wins or manual merge\?" holds up Sync conflicts/)
  expect(text).toMatch(/- Review the sync engine diff, for Sync engine/)
})

test('the head is a title and a one-line description', () => {
  const page = statusPage(sessionOf(statusOf([subject('s1', 'working', 'Sync engine', 'syncs', 0)]), [], 5), minutes(5))

  expect(page.head).toEqual({ title: 'Offline sync', description: 'Adding offline sync to the notes app' })
})
