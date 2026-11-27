import type { Failure } from './failure'
import type { OmpRun } from './look-omp'
import { STARTS_WITH_MARK, badText, glyphCut, hasRawEscape } from './rules-text'
import type { OmpDraw } from './look-omp'
import { rowKeyPlan } from '../core/view/action-plan'
import type { RowView } from '../core/view/rows'
import { cellWidth } from '../core/domain/text'
import { collapsedOf } from '../core/view/ui-controller-selection'

const PLAN_WIDTH = 80

/** A row's planned labels as the panel draws them, all options only once "All N options" was pressed, as `plannedLabels` in `omp/tests/panel-harness.ts` lists them. */
function drawnPlan(row: RowView, isAllShown: boolean): string[] {
  const { options, keys, more } = rowKeyPlan(row, isAllShown)
  return [
    ...options.map(o => o.action.label),
    ...[...keys, ...more].flatMap(k =>
      k.slot === 'allOptions' ? [] : [k.slot === 'retry' ? k.label : k.action.label],
    ),
  ]
}

const SGR = new RegExp(`${String.fromCodePoint(0x1b)}\\[[0-9;]*m`, 'g')

/** Why a line is too wide: an escape from the input, or the panel's own measure undercounting it. */
function widthCause(line: string, panel: number): string {
  if (hasRawEscape(line)) return ', with an escape from the input'
  const counted = cellWidth(line.replace(SGR, ''))
  return counted <= panel ? `, where cellWidth counts ${counted}` : ''
}

/**
 * The combining marks the open reply field's draft holds with no letter before them, at its start or after a space, as
 * when the key that opened the field took the letter they followed. The field draws them as typed, as omp's own editor
 * does, so a line of the draft that starts with one cut nothing.
 */
function loneMarks(d: OmpDraw): string[] {
  return [...draftOf(d).matchAll(/(?:^|\s)(\p{M}+)/gu)].flatMap(m => (m[1] ? [m[1]] : []))
}

const draftOf = (d: OmpDraw): string => (d.ui?.typing ? (d.ui.drafts[d.ui.typing]?.text ?? '') : '')

/** omp's TUI module that measures a line before it cuts one. Its source fails this project's strict type check, so tsc does not follow it. */
const PI_TUI_UTILS: string = '../omp/node_modules/@oh-my-pi/pi-tui/src/utils'
const { visibleWidth } = (await import(PI_TUI_UTILS)) as { visibleWidth: (line: string) => number }

/** The selected open row's planned labels, missing from the drawn text in plan order, as `omp/tests/panel.spec.ts` checks a row. */
function planBreak(d: OmpDraw): string | null {
  const { view, ui } = d
  if (!view || !ui || ui.isHelpShown || ui.typing !== null || ui.tab === 'prs' || ui.tab === 'overview') return null
  const id = ui.selection[ui.tab]?.id
  const rows = ui.tab === 'needsYou' ? [...view.needsYou.questions, ...view.needsYou.tasks] : view.findings.rows
  const row = rows.find(r => r.id === id && r.state.is !== 'settled')
  if (
    !row ||
    collapsedOf(ui, view).includes(row.id) ||
    row.id in ui.sentReplies ||
    (row.state.is === 'handedOff' && ui.opened !== row.id) ||
    Object.values(ui.pressesOut).some(o => o.rowId === row.id)
  )
    return null
  const from = d.lines.findIndex(l => l.includes('❯'))
  if (from < 0) return null
  const drawn = d.lines.slice(from).join('\n')
  let at = 0
  for (const label of drawnPlan(row, ui.optionsShown.includes(row.id))) {
    const found = drawn.indexOf(label, at)
    if (found < 0) return `${row.id} draws no "${label}" after its earlier buttons`
    at = found + label.length
  }

  return null
}

/** The Asks and Finds counts the tab line draws, against the view's counts. */
function countBreak(d: OmpDraw): string | null {
  const tabs = d.lines.find(l => l.includes('[2] Asks'))
  if (!d.view || !tabs) return null
  for (const [name, count] of [
    ['Asks', d.view.needsYou.count],
    ['Finds', d.view.findings.count],
  ] as const) {
    const drawn = Number(tabs.match(new RegExp(`\\] ${name}(?: (\\d+))?`))?.[1] ?? 0)
    if (drawn !== count) return `the tab line draws ${name} ${drawn}, and the view counts ${count}`
  }

  return null
}

const LOOK = 'omp'

/**
 * The `press-shows` rule: a key shows what it did in its own draw. When the draw after the work it started settled
 * differs from the draw before it, its own draw must differ too.
 */
function pressShowsFailures(run: OmpRun): Failure[] {
  return run.keys.flatMap(k => {
    const [before, own, settled] = [run.draws[k.before], run.draws[k.own], run.draws[k.settled]]
    if (!before || !own || !settled) return []
    const isSame = (a: OmpDraw, b: OmpDraw) => a.styled.join('\n') === b.styled.join('\n')
    if (isSame(before, settled) || !isSame(before, own)) return []
    const line = settled.styled.findIndex((l, i) => l !== before.styled[i])
    return [
      {
        look: LOOK,
        rule: 'press-shows',
        at: own.at,
        after: own.after,
        detail: `the key "${k.key}" changed nothing in its own draw, and the draw after its work settled changed line ${line}`,
        seen: settled.lines.join('\n'),
      },
    ]
  })
}

/** Every resting rule the omp panel broke in a run. Width is measured as omp's TUI measures a line before it cuts one. */
export function ompFailures(run: OmpRun, input: string): Failure[] {
  if (run.error)
    return [
      {
        look: LOOK,
        rule: 'no-throw',
        at: run.error.at,
        after: run.error.after,
        detail: run.error.message.split('\n')[0] ?? '',
        seen: run.error.message,
      },
    ]
  const out: Failure[] = pressShowsFailures(run)
  for (const d of run.draws) {
    const at = { look: LOOK, at: d.at, after: d.after }
    for (const [i, line] of d.lines.entries()) {
      const width = visibleWidth(line)
      if (width > run.width)
        out.push({
          ...at,
          rule: 'width',
          detail: `line ${i} is ${width} columns wide in a ${run.width}-column panel${widthCause(line, run.width)}`,
          seen: d.lines.join('\n'),
        })
      if (hasRawEscape(line))
        out.push({
          ...at,
          rule: 'raw-escape',
          detail: `line ${i} holds an escape from the input`,
          seen: JSON.stringify(line),
        })
      const cut = glyphCut(line.trim())
      const isTyped =
        cut === STARTS_WITH_MARK &&
        draftOf(d).includes(line.trim()) &&
        loneMarks(d).some(m => line.trim().startsWith(m))
      if (cut && !isTyped)
        out.push({ ...at, rule: 'glyph-cut', detail: `line ${i}: ${cut}`, seen: JSON.stringify(line) })
      const bad = badText(line, input)
      if (bad) out.push({ ...at, rule: 'bad-text', detail: `line ${i} draws "${bad}"`, seen: line })
    }
    if (run.width >= PLAN_WIDTH) {
      const plan = planBreak(d)
      if (plan) out.push({ ...at, rule: 'plan-order', detail: plan, seen: d.lines.join('\n') })
      const count = countBreak(d)
      if (count) out.push({ ...at, rule: 'counts', detail: count, seen: d.lines.join('\n') })
    }
  }

  return out
}
