import { describe, expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import type { Earlier, Item, Session } from '../types'
import { demoSession } from '../core/view/demo'
import { answerIndex, bestEarlier, earlierLineOf, earlierLineText } from '../core/domain/earlier-answers'
import type { AnswerDoc } from '../core/domain/earlier-answers'
import { historyStep, recordMatches } from '../core/runtime/history-store'
import type { HistoryPlace } from '../core/runtime/history-store'
import { inboxText } from '../core/domain/inbox-text'
import { EMPTY } from '../core/domain/ledger'
import { closeItem } from '../core/domain/ledger-close'
import { CLAUDE_CODE } from '../core/domain/model-text'
import { BASELINE_MS, historyFileName, questionHistory, ROW_MEASUREMENT_MS } from '../core/domain/question-history'
import type { HistoryFile } from '../core/domain/question-history'
import { emptySession } from '../core/view/session-files'
import { sessionView } from '../core/view/session-view'
import { SETTLED_MS } from '../core/view/timing'
import { TOOL_FIELDS } from '../core/domain/tool-schemas'
import { recordItem } from '../core/runtime/tools'

const DAY = 24 * 60 * 60_000
const NOW = 400 * DAY

const doc = (key: string, ask: string, answer: string): AnswerDoc => ({
  key,
  ask,
  answer,
  at: NOW - 3 * DAY,
  repo: 'kiosk',
})

const HISTORY = [
  doc('a', 'Which font should the receipt printer use?', 'Mono'),
  doc('b', 'Should the kiosk lock after five idle minutes?', 'Yes, after five'),
  doc('c', 'Which colour should the checkout button be?', 'Green'),
  doc('d', 'Ship the menu redesign this week?', 'Next week'),
]

const question = (id: string, ask: string, options: string[], earlier?: Earlier): Item => ({
  id,
  kind: 'question',
  label: null,
  from: 'record',
  ask,
  options,
  rec: null,
  helps: [],
  turn: 1,
  at: NOW - 60_000,
  ...(earlier ? { earlier } : {}),
})

const earlier = (answer: string, isShown = true): Earlier => ({
  ask: 'Should the kiosk lock after five idle minutes?',
  answer,
  at: NOW - 3 * DAY,
  repo: 'kiosk',
  score: 0.5,
  isShown,
})

describe('the search for an earlier answer', () => {
  const index = answerIndex(HISTORY)

  test('finds the answer to the same question asked again in other words', () => {
    const found = bestEarlier(index, { ask: 'Lock the kiosk after idle minutes?', options: ['Five', 'Ten'] }, 'x')
    expect(found?.doc.key).toBe('b')
  })

  test('finds nothing for a question the history does not cover, and never the question itself', () => {
    expect(bestEarlier(index, { ask: 'Which database runs the tests?', options: [] }, 'x')).toBeNull()
    expect(
      bestEarlier(index, { ask: 'Which font should the receipt printer use?', options: [] }, 'a')?.doc.key,
    ).not.toBe('a')
  })

  test('never matches on a number alone, such as a PR number against a version', () => {
    const versions = answerIndex([
      ...HISTORY,
      doc('v', 'Publish as 1.1.0 or 2.0.0?', '2.0.0, note the break in changelog'),
    ])
    const ask = { ask: 'Should I merge PR #2 or close it?', options: ['Merge it', 'Close it'] }
    expect(bestEarlier(versions, ask, 'x')).toBeNull()
  })

  test('finds the same PR asked about again, which shares a word as well as its number', () => {
    const merged = answerIndex([...HISTORY, doc('m', 'Merge PR #2?', 'Merge it')])
    expect(bestEarlier(merged, { ask: 'Merge PR #2 now?', options: [] }, 'x')?.doc.key).toBe('m')
  })
})

describe('the question history', () => {
  const asked = question('i1', 'Lock the kiosk?', ['Yes', 'No'])
  const withClosed = (outcomes: [id: string, how: 'answered' | 'update', outcome: string][]): Session => {
    let ledger = { ...EMPTY, items: outcomes.map(([id]) => ({ ...asked, id })) }
    for (const [id, how, outcome] of outcomes) ledger = closeItem(ledger, id, { how, outcome }, NOW)
    return { ...emptySession(), ledger }
  }

  test('keeps answers, and leaves out closes of work done, fixes sent and questions overtaken', () => {
    const s = withClosed([
      ['i1', 'answered', 'Yes'],
      ['i2', 'update', 'No, keep it open'],
      ['i3', 'update', 'done: the agent shipped it'],
      ['i4', 'update', 'fix sent for f2'],
      ['i5', 'update', 'no longer applies: the kiosk was removed'],
    ])
    const file = questionHistory(null, s, { host: 'codex', session: 's1', repo: null }, NOW)
    expect(file.questions.map(q => [q.id, q.answer])).toEqual([
      ['i1', 'Yes'],
      ['i2', 'No, keep it open'],
    ])
  })

  test('drops an answer once its question is open again, and one older than the keep window', () => {
    const s = withClosed([['i1', 'answered', 'Yes']])
    const kept = questionHistory(null, s, { host: 'codex', session: 's1', repo: null }, NOW)
    const reopened = { ...s, ledger: { ...s.ledger, items: [asked] } }
    expect(questionHistory(kept, reopened, { host: 'codex', session: 's1', repo: null }, NOW).questions).toEqual([])
    expect(questionHistory(kept, s, { host: 'codex', session: 's1', repo: null }, NOW + 181 * DAY).questions).toEqual(
      [],
    )
  })
})

function memoryPlace(files: Record<string, string>): HistoryPlace & { writes: string[] } {
  const writes: string[] = []
  return {
    writes,
    folder: `/history-${Math.random()}`,
    host: 'codex',
    keptSessions: async () => [],
    fs: {
      list: async folder =>
        Object.keys(files)
          .filter(p => p.startsWith(`${folder}/`))
          .map(p => ({ name: p.slice(folder.length + 1), mtimeMs: files[p]!.length })),
      read: async path => {
        if (!(path in files)) throw new Error('ENOENT')
        return files[path]!
      },
      write: async (path, text) => {
        writes.push(path)
        files[path] = text
      },
    },
  }
}

function seededPlace(created: number) {
  const place = memoryPlace({})
  const answered: HistoryFile = {
    version: 1,
    host: 'omp',
    session: 'old',
    repo: 'kiosk',
    created,
    savedAt: created,
    questions: [
      {
        id: 'i9',
        ask: 'Should the kiosk lock after five idle minutes?',
        answer: 'Yes, after five',
        options: [],
        askedAt: created,
        answeredAt: NOW - 3 * DAY,
        how: 'answered',
        isAfterReply: false,
        earlier: null,
        isAnsweredWithEarlier: false,
      },
    ],
  }
  void place.fs.write(`${place.folder}/${historyFileName('omp', 'old')}`, JSON.stringify(answered))
  place.writes.length = 0
  return place
}

describe('the history step on a save', () => {
  const before = emptySession()
  const added = (): Session => ({
    ...before,
    ledger: { ...before.ledger, items: [question('i1', 'Lock the kiosk after idle minutes?', ['Five', 'Ten'])] },
  })

  test('stores a match on a new question, drawn only once the baseline week has passed', async () => {
    const during = await historyStep(seededPlace(NOW - BASELINE_MS + DAY), 's1', before, added(), NOW)
    expect(during.ledger.items[0]?.earlier).toMatchObject({ answer: 'Yes, after five', repo: 'kiosk', isShown: false })
    const after = await historyStep(seededPlace(NOW - BASELINE_MS - DAY), 's1', before, added(), NOW)
    expect(after.ledger.items[0]?.earlier?.isShown).toBe(true)
  })

  test('writes the session’s file when a question closes, and leaves a save that adds and closes nothing alone', async () => {
    const place = seededPlace(NOW - 30 * DAY)
    const open = added()
    expect(await historyStep(place, 's1', open, open, NOW)).toBe(open)
    const closed = { ...open, ledger: closeItem(open.ledger, 'i1', { how: 'answered', outcome: 'Five' }, NOW) }
    await historyStep(place, 's1', open, closed, NOW)
    expect(place.writes).toEqual([`${place.folder}/${historyFileName('codex', 's1')}`])
  })

  test('leaves the save as it was changed when the history cannot be read', async () => {
    const seeded = seededPlace(NOW - 30 * DAY)
    const place = { ...seeded, fs: { ...seeded.fs, list: () => Promise.reject(new Error('locked')) } }
    const changed = added()
    expect(await historyStep(place, 's1', before, changed, NOW)).toBe(changed)
  })
})

describe('the earlier answer on a row', () => {
  const rowOf = (item: Item) => {
    const s = { ...emptySession(), ledger: { ...EMPTY, items: [item] } }
    return sessionView(s, NOW, SETTLED_MS).needsYou.questions[0]!
  }

  test('reads as one line with the answer, its age, its project and the earlier question', () => {
    const line = rowOf(question('i1', 'Lock the kiosk?', ['Yes', 'No'], earlier('Yes'))).earlierLine
    expect(line && earlierLineText(line)).toBe(
      'You answered Yes 3 days ago, in kiosk, to “Should the kiosk lock after five idle minutes?”',
    )
  })

  test('shows nothing during the baseline week', () => {
    expect(rowOf(question('i1', 'Lock the kiosk?', ['Yes', 'No'], earlier('Yes', false))).earlierLine).toBeNull()
    expect(earlierLineOf(earlier('Yes', false), NOW)).toBeNull()
  })

  test('stays out of the inbox text the agent reads', () => {
    const ledger = { ...EMPTY, items: [question('i1', 'Lock the kiosk?', ['Yes', 'No'], earlier('After five'))] }
    expect(inboxText(CLAUDE_CODE, ledger, true)).not.toContain('After five')
  })

  test('the demo shows it', () => {
    const view = sessionView(demoSession(NOW, 'Claude'), NOW, SETTLED_MS)
    expect(view.needsYou.questions.some(r => r.earlierLine?.answer === 'Flick')).toBe(true)
  })
})

describe('earlier answers in the record answer', () => {
  const lockAsk = { kind: 'question', ask: 'Lock the kiosk after idle minutes?', options: ['Five', 'Ten'] }

  test('lists nothing until the row’s measurement ends, then the matching answer, and never for a task', async () => {
    const during = seededPlace(NOW - ROW_MEASUREMENT_MS + DAY)
    expect(await recordMatches(during, lockAsk, NOW)).toEqual([])
    const after = seededPlace(NOW - ROW_MEASUREMENT_MS - DAY)
    expect((await recordMatches(after, lockAsk, NOW)).map(d => d.answer)).toEqual(['Yes, after five'])
    expect(await recordMatches(after, { ...lockAsk, kind: 'task' }, NOW)).toEqual([])
  })

  test('follow a new question with its id, and leave a record that updates an open one alone', () => {
    const found = [doc('b', 'Should the kiosk lock after five idle minutes?', 'Yes, after five')]
    const added = recordItem(CLAUDE_CODE, EMPTY, lockAsk, NOW, TOOL_FIELDS, found)
    expect(added.result).toContain('close i1 with the reason "answered before: <their answer>"')
    expect(added.result).toContain(
      '- 3 days ago, in kiosk: "Should the kiosk lock after five idle minutes?" They answered "Yes, after five".',
    )
    const again = recordItem(CLAUDE_CODE, added.ledger, lockAsk, NOW, TOOL_FIELDS, found)
    expect(again.result).not.toContain('Yes, after five')
  })

  test('cut a long earlier answer at a word with an ellipsis', () => {
    const long = 'In-process memory cache, sized for the nightly restart, '.repeat(8)
    const found = [doc('b', 'Should the kiosk lock after five idle minutes?', long)]
    const added = recordItem(CLAUDE_CODE, EMPTY, lockAsk, NOW, TOOL_FIELDS, found)
    const shown = /They answered "(.*)"\./.exec(added.result)?.[1] ?? ''
    expect(shown.endsWith('…')).toBe(true)
    expect(shown.length).toBeLessThanOrEqual(200)
    expect(long.startsWith(shown.slice(0, -1))).toBe(true)
    expect(long.charAt(shown.length - 1)).toBe(' ')
  })
})
