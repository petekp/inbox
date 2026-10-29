import { expect, test } from 'claude-code/testing'

import { childStarted } from '../hooks/children'
import { applyOps, EMPTY_OVERVIEW, lookEnded, lookStarted, parseOverview } from '../hooks/overview'
import type { Op } from '../hooks/overview'
import { emptySession } from '../hooks/session'
import type { Session } from '../hooks/session'
import { overviewCallPrompt } from '../hooks/session-host'
import type { OverviewExchange } from '../hooks/session-host'
import { overviewPage } from '../hooks/view'
import type { Item, Overview, Subject, SubjectStatus } from '../types'
import { factsAfter, factsText } from '../evals/overview-facts'
import type { Facts } from '../evals/overview-facts'
import { JUDGE_CHECKS, pageMistakes, parseJudgeAnswer } from '../evals/overview-judge'
import type { JudgePage } from '../evals/overview-judge'
import { minutes, replayFromRecord, runReplay } from '../evals/overview-replay'
import type { ModelCall, Replay, Step, StepResult } from '../evals/overview-replay'
import { REPLAYS } from '../evals/overview-replays'
import { blockingFailures, gradeReplay, gradeStep, RULES } from '../evals/overview-rules'
import type { RuleContext } from '../evals/overview-rules'

function subject(id: string, status: SubjectStatus, name: string, text: string, changedAt: number): Subject {
  const isClosed = status === 'done' || status === 'dropped'
  return {
    id,
    name,
    status,
    text,
    was: null,
    merged: null,
    createdAt: minutes(0),
    changedAt: minutes(changedAt),
    closedAt: isClosed ? minutes(changedAt) : null,
    into: null,
  }
}

function overviewOf(subjects: Subject[], more: Partial<Overview> = {}): Overview {
  const head = { title: 'Offline sync', description: 'Adding offline sync to the notes app' }
  return { ...EMPTY_OVERVIEW, head, subjects, nextId: subjects.length + 1, ...more }
}

function sessionOf(o: Overview, items: Item[], at: number): Session {
  const base = emptySession()
  return {
    ...base,
    ledger: { ...base.ledger, overview: o, items },
    presence: { ...base.presence, lastReplyAt: minutes(at) },
  }
}

function ask(id: string, text: string): Item {
  return {
    id,
    kind: 'question',
    label: null,
    ask: text,
    options: [],
    rec: null,
    helps: [],
    turn: 1,
    at: 0,
    from: 'record',
  }
}

type Scene = {
  before: Overview
  after: Overview
  items: Item[]
  facts: Facts
  step: Step
  isOverviewFailed: boolean
}

function baseScene(): Scene {
  const before = overviewOf([
    subject('s1', 'working', 'Sync engine', 'queues edits offline', 0),
    subject('s2', 'queued', 'Sync conflicts', 'not started', 0),
  ])
  const after = overviewOf(
    [
      subject('s1', 'working', 'Sync engine', 'syncs on reconnect', 10),
      subject('s2', 'queued', 'Sync conflicts', 'not started', 0),
    ],
    {
      askSubjects: { i1: 's2' },
      nextChildId: 2,
      children: [
        {
          id: 'c1',
          ref: 'toolu_a',
          kind: 'subagent',
          name: 'Review the sync engine diff',
          subjectId: 's1',
          startedAt: minutes(5),
          endedAt: null,
          lastActivityAt: minutes(9),
          delegateState: null,
        },
      ],
    },
  )
  const facts: Facts = {
    focus: 'adding offline sync',
    focusMatch: 'offline|sync',
    pieces: [
      { id: 'engine', names: ['Sync engine'], match: 'engine', state: 'working', stands: 'syncs on reconnect' },
      { id: 'conflicts', names: ['Sync conflicts'], match: 'conflict', state: 'queued', stands: 'not started' },
    ],
    asks: [{ match: 'manual merge', text: 'Last-write-wins or manual merge?', holdsUp: ['conflicts'] }],
    notWork: [],
    children: [{ ref: 'toolu_a', does: 'Review the sync engine diff', serves: 'engine' }],
    changed: ['engine'],
  }
  const step: Step = {
    label: 'the engine works',
    at: 10,
    call: { kind: 'reply', person: null, activity: [], reply: '' },
  }

  return { before, after, items: [ask('i1', 'Last-write-wins or manual merge?')], facts, step, isOverviewFailed: false }
}

function contextOf(scene: Scene): RuleContext {
  const session = sessionOf(scene.after, scene.items, 10)
  const page = overviewPage(session, minutes(10))
  const result: StepResult = {
    index: 0,
    label: scene.step.label,
    now: minutes(10),
    session,
    page,
    text: '',
    facts: scene.facts,
    calls: [],
    isOverviewFailed: scene.isOverviewFailed,
  }
  const beforeFacts = { ...scene.facts, changed: [] }

  return { step: scene.step, result, before: { overview: scene.before, facts: beforeFacts } }
}

const s1Of = (s: Scene) => s.after.subjects[0]!
const s2Of = (s: Scene) => s.after.subjects[1]!

const SCENES: Record<string, { bad: (s: Scene) => void; good?: (s: Scene) => void }> = {
  'no-time-words': { bad: s => (s1Of(s).text = 'synced 5m ago') },
  'short-names': { bad: s => (s1Of(s).name = 'The offline sync engine work') },
  'text-is-state': { bad: s => (s1Of(s).text = 'tests running') },
  'head-no-status': { bad: s => (s.after.head = { title: 'Offline sync', description: 'Offline sync ready' }) },
  'head-follows': { bad: s => (s.after.head = { title: 'Lint error', description: 'Fixing the lint error' }) },
  'no-duplicates': { bad: s => s.after.subjects.push(subject('s3', 'working', 'Sync engine work', 'tests', 10)) },
  'piece-once': { bad: s => s.after.subjects.push(subject('s3', 'working', 'Engine queue', 'syncs', 10)) },
  'open-not-over': { bad: s => (s1Of(s).text = 'shipped to users') },
  'open-pieces-kept': { bad: s => s.after.subjects.pop() },
  'marks-true': { bad: s => (s2Of(s).status = 'working') },
  'not-work': {
    bad: s => {
      s.facts.notWork.push({ kind: 'finding', text: 'The settings test is flaky', match: 'flaky' })
      s.after.subjects.push(subject('s3', 'queued', 'Flaky test', 'fails now and then', 10))
    },
  },
  'held-text': { bad: s => (s2Of(s).text = 'needs your decision') },
  'asks-linked': { bad: s => (s.after.askSubjects = { i1: 's1' }) },
  'ask-holds-several': { bad: s => (s.facts.asks[0]!.holdsUp = ['conflicts', 'engine']) },
  'children-linked': { bad: s => (s.after.children[0]!.subjectId = 's2') },
  'child-labels': { bad: s => (s.after.children[0]!.name = 'pdfx2') },
  'no-news-no-move': { bad: s => (s.facts.changed = []) },
  'changes-move': { bad: s => (s1Of(s).changedAt = minutes(0)) },
  'was-on-reversal': { bad: s => (s.step.facts = { pieces: [{ id: 'conflicts', was: 'manual merge' }] }) },
  'was-not-cut': { bad: s => (s2Of(s).was = 'Show the banner on hover and keep…') },
  'failure-shown': { bad: s => (s.isOverviewFailed = true) },
  'head-title': { bad: s => (s.after.head = { title: 'Offline sync', description: 'offline sync' }) },
  'filed-mark': {
    good: s => {
      s.facts.pieces[1]!.state = 'filed'
      s2Of(s).status = 'filed' as SubjectStatus
    },
    bad: s => {
      s.facts.pieces[1]!.state = 'filed'
      s2Of(s).status = 'done'
    },
  },
  'finished-named': {
    bad: s => {
      s.after.subjects.push(
        subject('s3', 'done', 'Login timeout', 'fixed', 8),
        subject('s4', 'done', 'Crash on launch', 'fixed', 9),
        subject('s5', 'done', 'Backup restore', 'works', 10),
      )
    },
  },
}

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

const GOOD_RUNS: Record<string, string[]> = {
  'coordinator-day': [
    'DONE: s1 | merges edits on reconnect',
    'DONE: s2 | live in both stores',
    [
      'HEAD: Vanishing notes | Fixing the archive bug, then shipping 2.5',
      'DONE: s6 | filed for later',
      'DONE: s7 | filed for later',
      'NEW: working | Vanishing notes | cause unknown',
      'NEW: queued | 2.5 release | after the bug fix',
      'LINK: c3 | Vanishing notes',
    ].join('\n'),
    'SET: s11 | working | cause found',
    'LINK: i2 | 2.5 release',
    'SET: s12 | queued | waits for the archive fix',
    'UNCHANGED',
    'UNCHANGED',
    'SET: s11 | working | fix in review\nLINK: c4 | Vanishing notes',
    'DONE: s11 | fixed\nSET: s12 | working | release candidate on the way\nHEAD: 2.5 release | Shipping 2.5 to both stores',
    'NEW: queued | Export folder | cause found',
    'DONE: s12 | live in both stores',
    'SET: s13 | working | setting moves to a file\nHEAD: Export folder | Fixing the export folder on Windows',
    'DONE: s13 | keeps the folder after an update\nSET: s5 | working | index rebuilds on each keystroke\nHEAD: Search speed | Speeding up note search',
    'SET: s5 | working | fast on large libraries',
  ],
  'single-task': [
    'NONE',
    [
      'HEAD: Offline sync | Adding offline sync to the notes app',
      'NEW: working | Sync engine | queues edits offline',
      'NEW: queued | Sync conflicts | not started',
      'NEW: queued | Sync toggle | not started',
    ].join('\n'),
    'NEW: decide | - | Last-write-wins or manual merge for conflicts? | Last-write-wins / Manual merge | -',
    'SET: s1 | working | syncs on reconnect\nLINK: c1 | Sync engine\nLINK: c2 | Sync engine\nLINK: i1 | Sync conflicts',
    'CLOSED: i1 | manual merge',
    'SET: s2 | working | manual merge under way',
    'NONE',
    'SET: s2 | working | last-write-wins with backup\nWAS: s2 | manual merge',
    'NONE',
    'SET: s2 | working | works on both test devices\nSET: s3 | queued | set aside\nNEW: working | Offline banner | first version',
    'NONE',
    'UNCHANGED',
    'NEW: decide | - | Should the offline banner show on web too? | Yes / No | -',
    'SET: s4 | working | shows on phones\nLINK: i2 | Offline banner',
    'CLOSED: i2 | the person dropped it',
    'DONE: s4 | shows on phones\nSET: s1 | working | Android syncs; iOS loses last edit',
  ],
  'long-turn': [
    'DONE: s1 | fast on large libraries\nSET: s2 | working | under way',
    'UNCHANGED',
    'SET: s2 | working | sorts by last edit',
    'DONE: s2 | pinned first, then by last edit\nSET: s3 | working | short typos match',
  ],
  'catch-up-from-empty': [
    [
      'HEAD: Attachments | Attaching images and PDFs to notes',
      'NEW: working | Image attachments | show inline',
      'NEW: working | PDF attachments | attach as a file row',
      'DONE: Image attachments | show inline',
      'LINK: i1 | PDF attachments',
    ].join('\n'),
  ],
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
  const last = overviewOf([subject('s1', 'working', 'Sync engine', 'queues edits offline', 0)])
  const exchange: OverviewExchange = {
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

  expect(prompts).toEqual([overviewCallPrompt(input, exchange)])
  expect(step!.session.ledger.overview!.subjects[0]).toMatchObject({ text: 'syncs on reconnect', changedAt: input.now })
})

test('an answer past the host limit is dropped as the host drops it, and the page says the update failed', async () => {
  const r = REPLAYS.find(x => x.name === 'long-turn')!
  let t = 0
  const [step] = await runReplay(
    { ...r, steps: r.steps.slice(0, 1) },
    { agent: 'claude', ask: async () => ({ text: 'UNCHANGED', outputTokens: 2000 }), clock: () => (t += 1000) },
  )

  expect(step!.isOverviewFailed).toBe(true)
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

function knownFailing(name: string, until: string, body: () => void) {
  test(`${name}, which fails until ${until} is built`, () => {
    let error: unknown = null
    try {
      body()
    } catch (e) {
      error = e
    }
    if (error === null) throw new Error(`This passes now. ${until} is built, so make it a plain test.`)
  })
}

const opsOf = (text: string): Op[] => {
  const answer = parseOverview(text)
  return answer?.kind === 'ops' ? answer.ops : []
}

knownFailing('#137: work filed for later draws its own mark and folds apart from the done count', '#137', () => {
  const o = overviewOf([subject('s1', 'filed' as SubjectStatus, 'Dark mode', 'filed for later', 10)], {
    lastLookAt: minutes(0),
  })
  const row = overviewPage(sessionOf(o, [], 10), minutes(10)).rows.find(r => r.kind === 'subject')

  expect(row?.kind === 'subject' && row.mark).toBeTruthy()
  expect(['✓', '✗', '●', '○', '◌']).not.toContain(row?.kind === 'subject' ? row.mark : '✓')
})

knownFailing('#138: every piece finished since the last look is drawn as a row', '#138', () => {
  const done = ['Login timeout', 'Crash on launch', 'Backup restore', '2.4 release', 'Sync merge', 'Search speed']
  const o = overviewOf(
    done.map((name, n) => subject(`s${n + 1}`, 'done', name, 'finished', 10 + n)),
    { lastLookAt: minutes(0) },
  )
  const drawn = overviewPage(sessionOf(o, [], 30), minutes(30)).rows.filter(r => r.kind === 'subject')

  expect(drawn.length).toBe(6)
})

knownFailing('#139: a look marks as seen only the rows that were on screen', '#139', () => {
  const o = overviewOf([
    subject('s1', 'working', 'Sync engine', 'syncs', 10),
    subject('s2', 'working', 'Search speed', 'faster', 10),
  ])
  const endLook = lookEnded as (o: Overview | null, at: number, shown: string[]) => Overview | null
  const looked = endLook(lookStarted(o, minutes(20)), minutes(21), ['s1'])
  const page = overviewPage(sessionOf(looked!, [], 22), minutes(22))
  const names = page.rows.map(r => (r.kind === 'subject' ? r.name : r.kind))

  expect(names.indexOf('Search speed')).toBeLessThan(names.indexOf('look'))
})

knownFailing('#140: one ask holds up two subjects, and both show ◆', '#140', () => {
  const o = applyOps(
    overviewOf([
      subject('s1', 'working', '2.4 release', 'build signed', 0),
      subject('s2', 'working', 'Hotfix release', 'build signed', 0),
    ]),
    opsOf('LINK: i1 | 2.4 release\nLINK: i1 | Hotfix release'),
    minutes(5),
    new Set(['i1']),
  )
  const marks = overviewPage(sessionOf(o, [ask('i1', 'Sign in to the app store')], 5), minutes(5)).rows.flatMap(r =>
    r.kind === 'subject' ? [r.mark] : [],
  )

  expect(marks).toEqual(['◆', '◆'])
})

test('the head is a title and a one-line description', () => {
  const page = overviewPage(
    sessionOf(overviewOf([subject('s1', 'working', 'Sync engine', 'syncs', 0)]), [], 5),
    minutes(5),
  )

  expect(page.head).toEqual({ title: 'Offline sync', description: 'Adding offline sync to the notes app' })
})

knownFailing('#149: a delegate with no published focus shows its name in words', '#149', () => {
  const o = childStarted(overviewOf([]), { ref: 'herdr:pdf-layout', kind: 'delegate', name: 'pdf-layout' }, minutes(1))
  const row = overviewPage(sessionOf(o, [], 2), minutes(2)).rows.find(r => r.kind === 'child')

  expect(row?.kind === 'child' ? row.name : '').toMatch(/^pdf layout$/i)
})
