import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Window } from 'happy-dom'
import { h, render } from 'preact'
import { rowKeyPlan } from '../../hooks/action-plan'
import { demoSession } from '../../hooks/demo'
import { CODEX_TREE_PAD_PX, partPairs, partPt, rowParts } from '../../hooks/row-parts'
import type { AnswersForm, RowPart } from '../../hooks/row-parts'
import type { RowView } from '../../hooks/rows'
import { sessionView } from '../../hooks/session-view'
import { SETTLED_MS } from '../../hooks/timing'
import { caseName, caseRow, rowCases } from '../../tests/row-part-cases'
import type { RowCase } from '../../tests/row-part-cases'
import { emptyState } from '../src/state'
import { viewOf } from '../src/core'
import type { TabView } from '../src/core'

const ANSWER_W = 60
const WIDE_ROOM = 1000
const NARROW_ROOM = 100
const BASE_ID = { question: 'd12', task: 'd14', finding: 'd23' } as const
const TREE_PARTS: RowPart[] = ['holdsUp', 'context', 'earlier', 'answer', 'answers']

function answersOf(row: RowView, isWide: boolean): AnswersForm | null {
  const { options, answerRow } = rowKeyPlan(row, false)
  if (options.length === 0) return null
  if (answerRow && isWide) return { is: 'side by side', hasReason: answerRow.recLine !== null }

  return { is: 'stacked', hasNotes: options.map(o => o.note !== null) }
}

function expected(c: RowCase, row: RowView, hasCopy: boolean): string[] {
  const parts = rowParts(row, {
    answers: answersOf(row, c.isWide),
    hasTitleStatus: false,
    hasStatus: c.feedback === 'above',
    hasButtons: true,
    isTyping: c.typing,
    hasResult: c.feedback === 'under',
    hasCopy,
  })

  return partPairs(parts).map(
    ([above, below]) =>
      `${below} ${partPt(above, below, 'codex') + (TREE_PARTS.includes(below) ? CODEX_TREE_PAD_PX : 0)}px`,
  )
}

test('the Codex tab sets each part of an open question, task and finding partGap under the part above, wide and narrow, with and without the copy box', async () => {
  const window = new Window()
  window.document.body.innerHTML = '<div id="app"></div>'
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  Object.defineProperty(media, 'matches', { get: () => true })
  let room = WIDE_ROOM
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get: () => room, configurable: true })
  window.HTMLElement.prototype.getBoundingClientRect = () => new window.DOMRect(0, 0, ANSWER_W, 20)
  const globals = {
    window,
    document: window.document,
    Event: window.Event,
    parent: window.parent,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    KeyboardEvent: window.KeyboardEvent,
    ResizeObserver: window.ResizeObserver,
    sessionStorage: window.sessionStorage,
    matchMedia: () => media,
    getComputedStyle: window.getComputedStyle.bind(window),
    DEMO_BUTTON: false,
    DEMO_RECORDING: false,
  }
  const previous = new Map(Object.keys(globals).map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]))
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true })
  try {
    const { tabState, selection, errors, copies, root } = await import('../src/tab-state')
    const { stepLists } = await import('../src/tab-list')
    const { NeedsYou, Findings } = await import('../src/tab-groups')
    const { settleAnswers } = await import('../src/tab-ask-tree')
    const now = Date.now()
    const demo = sessionView(demoSession(now, 'Codex'), now, SETTLED_MS)
    const bases = [...demo.needsYou.questions, ...demo.needsYou.tasks, ...demo.findings.rows]
    const base: TabView = {
      ...viewOf(emptyState('parts'), now),
      thread: 'parts',
      devPage: '',
      isFetchingPrs: false,
      isGhMissing: false,
    }
    const drawn = (c: RowCase, row: RowView, hasCopy: boolean) => {
      const view: TabView =
        c.kind === 'finding'
          ? { ...base, findings: { ...base.findings, rows: [row] } }
          : {
              ...base,
              needsYou: { ...base.needsYou, count: 1, [c.kind === 'question' ? 'questions' : 'tasks']: [row] },
            }
      const tab = c.kind === 'finding' ? 'findings' : 'needsYou'
      room = c.isWide ? WIDE_ROOM : NARROW_ROOM
      tabState.view = view
      tabState.tab = tab
      tabState.typing = c.typing ? row.id : null
      selection[tab] = { id: row.id, openedAt: now }
      errors.clear()
      copies.clear()
      if (hasCopy) copies.set(row.id, { name: 'the reply', text: 'Keep it' })
      if (c.feedback === 'above') errors.set(row.id, 'Could not send.')
      const draw = () => {
        const { lists } = stepLists(view)
        render(h(tab === 'findings' ? Findings : NeedsYou, { v: view, lists, now }), root)
      }
      draw()
      if (settleAnswers(root)) draw()

      return [...root.querySelectorAll<HTMLElement>('.panel [data-part]')].map(
        el => `${el.dataset.part} ${el.style.getPropertyValue('--above')}`,
      )
    }
    const cases = rowCases().flatMap(c =>
      [false, true].map(hasCopy => ({
        c,
        hasCopy,
        row: caseRow(
          c,
          bases.find(r => r.id === BASE_ID[c.kind])!,
          now,
        ),
      })),
    )
    const nameOf = (c: RowCase, hasCopy: boolean) => `${caseName(c)}${hasCopy ? ', copy' : ''}`

    assert.deepEqual(
      cases.map(({ c, hasCopy, row }) => ({ name: nameOf(c, hasCopy), parts: drawn(c, row, hasCopy) })),
      cases.map(({ c, hasCopy, row }) => ({ name: nameOf(c, hasCopy), parts: expected(c, row, hasCopy) })),
    )
  } finally {
    for (const [key, descriptor] of previous)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
  }
})
