import type { Failure } from './failure'
import type { OmpRun } from './look-omp'
import { badText, glyphCut, hasRawEscape } from './rules-text'
import type { OmpDraw } from './look-omp'
import { plannedLabels } from '../omp/tests/panel-harness'
import { collapsedOf } from '../core/view/ui-controller-selection'

const PLAN_WIDTH = 80

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
  for (const label of plannedLabels(row)) {
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
  const out: Failure[] = []
  for (const d of run.draws) {
    const at = { look: LOOK, at: d.at, after: d.after }
    for (const [i, line] of d.lines.entries()) {
      const width = visibleWidth(line)
      if (width > run.width)
        out.push({
          ...at,
          rule: 'width',
          detail: `line ${i} is ${width} columns wide in a ${run.width}-column panel`,
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
      if (cut) out.push({ ...at, rule: 'glyph-cut', detail: `line ${i}: ${cut}`, seen: JSON.stringify(line) })
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
