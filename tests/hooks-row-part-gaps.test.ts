import { expect, mock } from 'claude-code/testing'
import type { Item, LastAction, Ledger } from '../types'
import { test } from './test-with-timeout'
import { rowKeyPlan } from '../hooks/action-plan'
import { demoView } from '../hooks/demo'
import { DESKTOP_LINE_PT } from '../hooks/pane-sizes'
import { emptySession } from '../hooks/session-files'
import { SESSION_VERSION } from '../hooks/session-version'
import { partPairs, partPt, partRows, rowParts } from '../hooks/row-parts'
import type { AnswersForm, RowPart } from '../hooks/row-parts'
import type { RowView } from '../hooks/rows'
import type { TabsProps } from '../hooks/tabs-client'
import { PRESS_GUARD_MS, SETTLED_MS } from '../hooks/timing'
import { inboxView, perTurnStatus } from '../hooks/view'
import { caseName, rowCases } from './row-part-cases'
import type { RowCase, RowKind } from './row-part-cases'
import { w, world } from './hooks-world'
import { PANE } from './hooks-helpers'

type Node = { type: string; key?: string; props?: Record<string, unknown>; children?: unknown[] }
type Look = 'desktop' | 'terminal'
type Seeded = { ledger: Ledger; lastActions: Record<string, LastAction> }

const NOW = 1_000_000
const BASE_ID = { question: 'd12', task: 'd14', finding: 'd23' } as const
const WIDE_COLUMNS = 80
const NARROW_COLUMNS = 24
const ROWS_PER_SESSION = 16

const ENTRY_PART: [RegExp, RowPart][] = [
  [/^holds-up$/, 'holdsUp'],
  [/^context$/, 'context'],
  [/^earlier$/, 'earlier'],
  [/^option-\d+$/, 'answer'],
  [/^reason-\d+$/, 'note'],
  [/^options$/, 'answers'],
  [/^reason-options$/, 'reason'],
  [/^detail$/, 'detail'],
  [/^file$/, 'file'],
  [/^status$/, 'status'],
  [/^result$/, 'result'],
]

const idOf = (n: number) => `i${n + 1}`

function feedbackOf(c: RowCase): LastAction | null {
  if (c.feedback === 'above')
    return {
      kind: 'local',
      action: 'open',
      text: 'Open',
      at: NOW - 1000,
      result: {
        state: 'failed',
        at: NOW - 1000,
        parts: [{ kind: 'open', name: 'notes.md', isCommand: false, error: 'No such file' }],
      },
    }
  if (c.feedback === 'under')
    return { kind: 'talk', action: 'discuss', text: 'Discuss', at: NOW - 1000, turnsStarted: 0 }

  return null
}

function caseItem(c: RowCase, base: Item, id: string): Item {
  return {
    ...base,
    id,
    ask: `${base.ask} (${id})`,
    ...(c.context ? { context: 'Testers asked whether a cleared glance should come back.' } : {}),
    ...(c.notes
      ? { optionDescriptions: Object.fromEntries(base.options.map(o => [o, `What picking ${o} does.`])) }
      : {}),
    ...(c.reason ? { rec: base.options[0]!, recReason: 'it keeps the old API' } : {}),
    ...(c.earlier
      ? {
          earlier: {
            ask: 'Keep cleared glances?',
            answer: 'Keep it',
            at: NOW - 86_400_000,
            repo: null,
            score: 1,
            isShown: true,
          },
        }
      : {}),
  }
}

function seeded(cases: RowCase[], kind: RowKind): Seeded {
  const d = demoView(NOW, 'Claude')
  const item = d.ledger.items.find(i => i.id === BASE_ID[kind])
  const finding = d.ledger.findings.find(f => f.id === BASE_ID[kind])
  const lastActions = Object.fromEntries(
    cases.flatMap((c, n) => {
      const f = feedbackOf(c)
      return f ? [[idOf(n), f]] : []
    }),
  )

  return {
    ledger: {
      ...emptySession().ledger,
      overview: d.ledger.overview && {
        ...d.ledger.overview,
        askSubjects: Object.fromEntries(cases.flatMap((c, n) => (c.holdsUp ? [[idOf(n), ['s1']]] : []))),
      },
      items: item ? cases.map((c, n) => caseItem(c, item, idOf(n))) : [],
      findings: finding ? cases.map((c, n) => ({ ...finding, id: idOf(n), path: c.file ? finding.path : null })) : [],
      nextId: cases.length + 1,
    },
    lastActions,
  }
}

function rowsOf({ ledger, lastActions }: Seeded, now: number): RowView[] {
  const view = inboxView({
    ledger,
    lastActions,
    notes: {},
    turns: { turnsStarted: 0, turnsApplied: 0 },
    extraSteps: {},
    settleWindowMs: SETTLED_MS,
    status: perTurnStatus('none'),
    now,
    replies: {},
    discarded: {},
    shownSince: NOW,
    lastTypedMessageAt: null,
    listInput: null,
  })

  return [...view.needsYou.questions, ...view.needsYou.tasks, ...view.findings.rows]
}

function answersOf(row: RowView, isWide: boolean): AnswersForm | null {
  const { options, answerRow } = rowKeyPlan(row, false)
  if (options.length === 0) return null
  if (answerRow && isWide) return { is: 'side by side', hasReason: answerRow.recLine !== null }

  return { is: 'stacked', hasNotes: options.map(o => o.note !== null) }
}

function expectedSpaces(look: Look, c: RowCase, row: RowView): string[] {
  const parts = rowParts(row, {
    answers: answersOf(row, c.isWide),
    hasTitleStatus: false,
    hasStatus: c.feedback === 'above',
    hasButtons: true,
    isTyping: c.typing,
    hasResult: c.feedback === 'under',
    hasCopy: false,
  })
  const isCard = parts.some(p => p === 'holdsUp' || p === 'answer' || p === 'answers')

  return partPairs(parts).map(([above, below]) => {
    const space =
      look === 'desktop' ? partPt(above, below, isCard ? 'desktopCard' : 'desktopFrame') : partRows(above, below, true)

    return `${above} ${below} ${space}`
  })
}

const keyOf = (n: Node) => String(n.key ?? n.props?.key ?? '')
const kidsOf = (n: Node) =>
  (n.children ?? []).filter((k): k is Node => typeof k === 'object' && k !== null && 'type' in k)
const isAbsolute = (n: Node) => n.props?.position === 'absolute'
const isRow = (n: Node) => n.type === 'Box' && n.props?.flexDirection === 'row'
const num = (v: unknown) => Number(v ?? 0)
const above = (n: Node) => num(n.props?.marginTop ?? n.props?.marginY ?? n.props?.margin)
const below = (n: Node) => num(n.props?.marginBottom ?? n.props?.marginY ?? n.props?.margin)
const padTop = (n: Node) => num(n.props?.paddingTop ?? n.props?.paddingY ?? n.props?.padding)
const padBottom = (n: Node) => num(n.props?.paddingBottom ?? n.props?.paddingY ?? n.props?.padding)
const textOf = (n: Node): string =>
  (n.children ?? [])
    .map(k => (typeof k === 'string' ? k : typeof k === 'object' && k ? textOf(k as Node) : ''))
    .join('')
const hasContent = (n: Node): boolean =>
  !isAbsolute(n) && (n.type === 'Box' ? kidsOf(n).some(hasContent) : n.type !== 'Text' || textOf(n) !== '')
const takesSpace = (n: Node) =>
  hasContent(n) || num(n.props?.height) > 0 || above(n) + below(n) + padTop(n) + padBottom(n) > 0

function partOf(n: Node, title: string, typing: boolean): RowPart | null {
  const key = keyOf(n)
  if (key === title) return 'title'
  if (key === 'actions') return typing ? 'field' : 'buttons'
  if (/^row-.+-title$/.test(key)) return 'title'

  return ENTRY_PART.find(([re]) => re.test(key))?.[1] ?? null
}

function drawnSpaces(row: Node, title: string, typing: boolean, unit: number): string[] {
  const hasPart = (n: Node): boolean => partOf(n, title, typing) !== null || kidsOf(n).some(hasPart)
  const out: string[] = []
  const parts: { part: RowPart; node: Node }[] = []
  let owner: Node | null = null
  let ownerPart: RowPart | null = null
  let space = 0
  const shown = (n: Node) => {
    const at = parts.at(-1)
    if (!at) out.push(`${keyOf(n) || n.type} outside any part, after ${ownerPart}`)
    else if (at.node !== owner) {
      if (ownerPart) out.push(`${ownerPart} ${at.part} ${space * unit}`)
      owner = at.node
      ownerPart = at.part
    }
    space = 0
  }
  const visit = (n: Node) => {
    if (isAbsolute(n)) return
    const part = partOf(n, title, typing)
    const isNewPart = part !== null && parts.at(-1)?.part !== part
    if (isNewPart) parts.push({ part, node: n })
    space += above(n)
    if (n.type !== 'Box') {
      if (hasContent(n)) shown(n)
    } else if (!hasContent(n)) space += Math.max(num(n.props?.height), padTop(n) + padBottom(n))
    else if (isRow(n)) {
      const inner = kidsOf(n).find(hasPart)
      space += padTop(n)
      if (inner) visit(inner)
      else shown(n)
      space += padBottom(n)
    } else {
      space += padTop(n)
      kidsOf(n)
        .filter(k => !isAbsolute(k) && takesSpace(k))
        .forEach((k, i) => {
          if (i > 0) space += num(n.props?.rowGap ?? n.props?.gap)
          visit(k)
        })
      space += padBottom(n)
    }
    space += below(n)
    if (isNewPart) parts.pop()
  }
  visit(row)

  return out
}

const sessions = (['question', 'task', 'finding'] as const).flatMap(kind => {
  const wide = rowCases([kind]).filter(c => c.isWide)

  return Array.from({ length: Math.ceil(wide.length / ROWS_PER_SESSION) }, (_, k) => ({
    kind,
    wide: wide.slice(k * ROWS_PER_SESSION, (k + 1) * ROWS_PER_SESSION),
    first: k * ROWS_PER_SESSION + 1,
  }))
})

for (const look of ['desktop', 'terminal'] as const)
  for (const { kind, wide, first } of sessions)
    test(`each part of an open ${kind} sits partGap under the part above, wide and narrow, with the answers kept while the field is open, in the ${look} look, cases ${first} to ${first + wide.length - 1}`, async ($, on) => {
      const clock = mock.clock(on, { now: NOW })
      let now = NOW
      const settle = async () => {
        await clock.settle()
        await clock.advance(PRESS_GUARD_MS)
        now += PRESS_GUARD_MS
      }
      world($, on, [])
      w.paneState = { isShown: true, isFocused: true }
      w.surfaces = [look]
      const seed = seeded(wide, kind)
      const session = { ...emptySession(), ...seed, place: { folder: '/tmp/project', branch: null } }
      w.stored.set('s:session-1', JSON.stringify({ version: SESSION_VERSION, savedAt: NOW, ...session }))
      await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
      const pane = await $.ui.mount({ ...PANE, surface: look })
      if (kind === 'finding') {
        if (look === 'terminal') await pane.press({ key: 'tab-findings' })
        else {
          const { tabs, gap } = (await pane.find({ key: 'tabs' }))?.props.props as TabsProps
          const x = tabs
            .slice(
              0,
              tabs.findIndex(t => t.id === 'findings'),
            )
            .reduce((sum, t) => sum + t.width + gap, 0)
          await pane.pointer({ type: 'down', x, y: 1, button: 'left', in: 'tabs' })
        }
        await settle()
      }
      const drawn: { name: string; spaces: string[] }[] = []
      const expected: { name: string; spaces: string[] }[] = []
      for (const isWide of [true, false]) {
        await pane.redraw({ ...PANE.props, bodyColumns: isWide ? WIDE_COLUMNS : NARROW_COLUMNS })
        for (const [n, flags] of wide.entries()) {
          const c = { ...flags, isWide }
          const id = idOf(n)
          const select = look === 'terminal' ? `title-${id}` : `select-${id}`
          if (await pane.find({ key: select }))
            if (look === 'terminal') await pane.press({ key: select })
            else await pane.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: select })
          await settle()
          if (c.typing) {
            await pane.press({ key: `typekey-${id}` })
            await settle()
          }
          const row = (await pane.find({ type: 'Box', key: `row-${id}` })) as Node | undefined
          drawn.push({
            name: caseName(c),
            spaces: row
              ? drawnSpaces(row, `collapse-${id}`, c.typing, look === 'desktop' ? DESKTOP_LINE_PT / 2 : 1)
              : ['no row'],
          })
          expected.push({
            name: caseName(c),
            spaces: expectedSpaces(
              look,
              c,
              rowsOf(seed, now).find(r => r.id === id)!,
            ),
          })
          if (c.typing) {
            await pane.press({ key: `cancel-${id}` })
            await settle()
          }
        }
      }

      expect(drawn).toEqual(expected)
    })
