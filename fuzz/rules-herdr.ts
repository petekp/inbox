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

const LOOK = 'herdr'
const FRAME_MS = 16

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

type ShownText = { block: string; text: string; opacity: number; share: number }

type Frames = ReturnType<typeof framesOf>

/**
 * The frames of a run, one page at a time. The view draws a new page, a tab, Help or session, at rest, and `framesOf`
 * moves rows from the draw before, so each page replays from its first draw.
 */
function pagedFrames(run: HerdrRun, end: number): Frames {
  const starts = [...new Set([0, ...run.pageAt.filter(t => t > 0)])].sort((a, b) => a - b)
  const merged: Frames = { jumps: [], titles: [], gaps: [], heights: [], slides: [], cuts: [], fading: [], shown: [] }
  for (const [i, from] of starts.entries()) {
    const to = starts[i + 1] ?? end
    const page = run.steps.filter(s => s[0] >= from && s[0] < to)
    const before = run.steps.findLast(s => s[0] < from)
    const first = page[0]?.[0] === from || !before ? page : [[from, before[1]] as Step, ...page]
    const shifted = first.map(s => [s[0] - from, ...s.slice(1)] as Step)
    const f = framesOf(shifted, to - from)
    const moved = <T extends { at: number }>(list: T[]) => list.map(x => ({ ...x, at: x.at + from }))
    merged.jumps.push(...moved(f.jumps))
    merged.titles.push(...moved(f.titles))
    merged.gaps.push(...moved(f.gaps))
    merged.cuts.push(...moved(f.cuts))
    merged.fading.push(...moved(f.fading).filter(x => x.at >= from))
    merged.shown.push(...moved(f.shown).filter(x => x.at >= from))
  }
  return merged
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
  const out: Failure[] = []
  const at = (t: number) => ({ look: LOOK, at: t, after: afterAt(t) })
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

  const frames = new Map<number, ShownText[]>()
  for (const s of f.shown) frames.set(s.at, [...(frames.get(s.at) ?? []), s])
  const times = [...frames.keys()].sort((a, b) => a - b)
  const stepTimes = run.steps.map(s => s[0])
  const isStep = (t: number) => stepTimes.some(s => s > t - FRAME_MS && s <= t)
  const keyOf = (s: ShownText) => `${s.block}|${s.text}`
  for (let i = 1; i < times.length; i++) {
    const t = times[i] ?? 0
    const before = frames.get(times[i - 1] ?? 0) ?? []
    const now = new Map((frames.get(t) ?? []).map(s => [keyOf(s), s]))
    const blocksNow = new Set([...now.values()].map(s => s.block))
    const stem = (t: string) => t.replace(/…$/, '')
    const goesOn = (s: ShownText) =>
      [...now.values()].some(
        n => n.block === s.block && (n.text.startsWith(stem(s.text)) || s.text.startsWith(stem(n.text))),
      )
    const shownIn = (list: Iterable<ShownText>, block: string) =>
      [...list].filter(s => s.block === block && s.opacity * s.share >= CUT_OPACITY && s.text.trim() !== '').length
    for (const s of before) {
      const isShown = s.opacity * s.share >= CUT_OPACITY && s.text.trim() !== ''
      if (!isShown || now.has(keyOf(s)) || !blocksNow.has(s.block) || isStep(t) || goesOn(s)) continue
      if (shownIn(now.values(), s.block) >= shownIn(before, s.block)) continue
      out.push({
        ...at(t),
        rule: 'vanish',
        detail: `"${s.text}" in ${s.block} went from ${s.opacity.toFixed(2)} to gone in one frame, with no draw then`,
        seen: s,
      })
    }
  }

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
