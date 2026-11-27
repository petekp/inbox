import { listWaits, rowKeyPlan } from '../core/view/action-plan'
import { CUT_OPACITY } from '../core/view/row-motion'
import { actionLabel } from '../core/view/rows'
import type { RowView } from '../core/view/rows'
import type { SessionView } from '../core/view/session-view'
import { allOf } from '../herdr/tests/gpui-stand-in'
import { type Step, framesOf } from '../herdr/tests/frames'
import type { RowBlock } from '../herdr/src/blocks'
import type { Failure } from './failure'
import type { HerdrDraw, HerdrRun } from './look-herdr'
import { badText, glyphCut } from './rules-text'
import { LINE_HEIGHT } from '../herdr/src/paint-theme'
import { vanishFailures } from './rules-herdr-vanish'
import { pressShowsFailures } from './rules-herdr-press'

const LOOK = 'herdr'
const STILL_PX = 0.5

const plannedLabels = (row: RowView, isAllShown: boolean) => {
  const { options, keys, more } = rowKeyPlan(row, isAllShown)
  return [
    ...options.map(o => actionLabel(o.action)),
    ...[...keys, ...more].map(k => (k.slot === 'allOptions' || k.slot === 'retry' ? k.label : actionLabel(k.action))),
  ]
}

const rowViews = (v: SessionView): RowView[] => [...v.needsYou.questions, ...v.needsYou.tasks, ...v.findings.rows]

function restingFailures(d: HerdrDraw, input: string): Failure[] {
  const out: Failure[] = []
  const at = { look: LOOK, at: d.at, after: d.after }
  for (const n of allOf(d.root)) {
    if (n.text === null) continue
    const bad = badText(n.text, input)
    if (bad) out.push({ ...at, rule: 'bad-text', detail: `${n.parent?.id ?? 'a node'} draws "${bad}"`, seen: n.text })
    const cut = glyphCut(n.text)
    if (cut)
      out.push({
        ...at,
        rule: 'glyph-cut',
        detail: `${n.parent?.id ?? 'a node'}: ${cut}`,
        seen: JSON.stringify(n.text),
      })
  }
  const view = d.view
  if (view === null || d.isMessage) return out
  const views = new Map(rowViews(view).map(r => [r.id, r]))
  for (const b of d.blocks) {
    if (b.kind !== 'row' || b.buttons.length === 0) continue
    const row = views.get(b.id)
    const isTyping = d.ui.typing === b.id
    if (row?.state.is !== 'open' || isTyping) continue
    const drawn = (b as RowBlock).buttons.map(x => x.label)
    const planned = plannedLabels(row, d.ui.optionsShown.includes(b.id))
    if (drawn.join('|') !== planned.join('|'))
      out.push({
        ...at,
        rule: 'plan-order',
        detail: `row ${b.id} draws [${drawn.join(', ')}], its plan is [${planned.join(', ')}]`,
      })
  }
  const waits = listWaits(view)
  const counted = { needsYou: view.needsYou.count, findings: view.findings.count }
  for (const tab of ['needsYou', 'findings'] as const) {
    const waiting = waits[tab].filter(w => w.isWaiting).length
    if (waiting !== counted[tab])
      out.push({
        ...at,
        rule: 'counts',
        detail: `the view counts ${counted[tab]} on ${tab}, and ${waiting} of its rows wait on the person`,
      })
  }

  return out
}

type Frames = ReturnType<typeof framesOf>

/**
 * The frames of a run. The view draws a new page, a tab, Help or session, at rest, as a first draw that keeps the
 * heights it measured, as the panel does, so each page starts at its first draw. The frames before the run starts only
 * settle the first page's measures.
 */
function pagedFrames(run: HerdrRun, end: number): Frames {
  const starts = new Set(run.pageAt.filter(t => t > 0))
  const atStarts = [...starts].flatMap(from => {
    const before = run.steps.findLast(s => s[0] < from)
    return run.steps.some(s => s[0] === from) || !before ? [] : [[from, before[1]] as Step]
  })
  const steps = [...run.steps, ...atStarts]
    .sort((a, b) => a[0] - b[0])
    .map(s => (starts.has(s[0]) ? ([s[0], s[1], 'page'] as Step) : s))
  const f = framesOf(steps, end)
  const shown = <T extends { at: number }>(list: T[]) => list.filter(x => x.at >= 0)

  return {
    jumps: shown(f.jumps),
    titles: shown(f.titles),
    gaps: shown(f.gaps),
    heights: [],
    slides: [],
    cuts: shown(f.cuts),
    fading: shown(f.fading),
    shown: shown(f.shown),
    rest: f.rest,
  }
}

/**
 * The rest-space rule, on the frame 1.5 s after the case's last event, when every move has come to rest: no box is
 * taller than its content, and no blank line's worth of space sits between two lines a block draws.
 */
function restFailures(rest: Frames['rest'], at: Pick<Failure, 'look' | 'at' | 'after'>): Failure[] {
  const out: Failure[] = []
  for (const fit of rest.fits.filter(x => x.height - x.content > STILL_PX))
    out.push({
      ...at,
      rule: 'rest-space',
      detail: `${fit.id ?? 'a box'} rests ${(fit.height - fit.content).toFixed(1)} px taller than its content`,
      seen: fit,
    })
  const drawn = rest.lines.filter(l => l.opacity >= CUT_OPACITY && l.text.trim() !== '' && l.block !== '')
  for (const block of new Set(drawn.map(l => l.block))) {
    const lines = drawn.filter(l => l.block === block).sort((a, b) => a.top - b.top)
    let bottom = lines[0] ? lines[0].top + lines[0].height : 0
    for (const l of lines.slice(1)) {
      if (l.top - bottom >= LINE_HEIGHT - STILL_PX)
        out.push({
          ...at,
          rule: 'rest-space',
          detail: `${block} rests with ${(l.top - bottom).toFixed(1)} px of blank space above "${l.text.slice(0, 40)}"`,
          seen: l,
        })
      bottom = Math.max(bottom, l.top + l.height)
    }
  }

  return out
}

/** The rules on every 16 ms frame the Herdr stand-in lays out between and after the case's draws. */
function motionFailures(run: HerdrRun): Failure[] {
  const end = (run.steps.at(-1)?.[0] ?? 0) + 1500
  const afterAt = (t: number) => run.draws.findLast(d => d.at <= t)?.after ?? -1
  let f: Frames
  try {
    f = pagedFrames(run, end)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return [
      {
        look: LOOK,
        rule: /gpui-kit/.test(message) ? 'motion-id' : 'no-throw',
        at: run.steps.at(-1)?.[0] ?? 0,
        after: run.draws.at(-1)?.after ?? -1,
        detail: message.split('\n')[0] ?? '',
        seen: message,
      },
    ]
  }
  const at = (t: number) => ({ look: LOOK, at: t, after: afterAt(t) })
  const out: Failure[] = restFailures(f.rest, at(end))
  for (const c of f.cuts)
    out.push({
      ...at(c.at),
      rule: 'cut',
      detail: `"${c.text}" shows at ${c.opacity.toFixed(2)} with ${Math.round(c.share * 100)}% of it in its box ${c.box}`,
      seen: c,
    })
  const opacityAt = (id: string, t: number) => f.fading.find(x => x.at === t && x.id === id)?.opacity ?? 1
  const isHidden = (id: string, t: number) => {
    const row = id.replace(/^(panel|size|box|fit) /, '')
    return opacityAt(`form ${row}`, t) <= 0.02 || opacityAt(`panel ${row}`, t) <= 0.02
  }
  for (const j of f.jumps.filter(j => !(j.id.startsWith('panel ') && isHidden(j.id, j.at))))
    out.push({
      ...at(j.at),
      rule: 'jump',
      detail: `${j.id} moved ${j.by.toFixed(1)} px in one frame, off its spring`,
      seen: j,
    })
  for (const g of f.gaps)
    out.push({
      ...at(g.at),
      rule: 'connector-gap',
      detail: `a connector in ${g.id} breaks at y ${g.y.toFixed(1)}`,
      seen: g,
    })

  out.push(...vanishFailures(run, f.shown, at))
  out.push(...pressShowsFailures(run, f.shown, at))

  return out
}

/** Every rule the Herdr look broke in a run, resting rules first. */
export function herdrFailures(run: HerdrRun, input: string): Failure[] {
  if (run.error)
    return [
      {
        look: LOOK,
        rule: /gpui-kit/.test(run.error.message) ? 'motion-id' : 'no-throw',
        at: run.error.at,
        after: run.error.after,
        detail: run.error.message.split('\n')[0] ?? '',
        seen: run.error.message,
      },
    ]

  return [...run.draws.flatMap(d => restingFailures(d, input)), ...motionFailures(run).filter(f => f.at >= 0)]
}
