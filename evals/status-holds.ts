import { heldToneOf } from '../core/view/help'
import { findMilestone, restatesGoal } from '../core/domain/status-goal-ops'
import { isNumberOnly, isOpen } from '../core/domain/status-limits'
import { parseStatus } from '../core/domain/status'
import type { Op } from '../core/domain/status'
import { drawnStatusRows } from '../core/view/status-folds'
import type { MilestoneRow } from '../core/view/status-goal-page'
import type { StatusPage } from '../core/view/status-page'
import type { SessionStatus } from '../types'
import type { Rule } from './status-rules'

/** A hold the code keeps. It reads the page and the saved Status at every step, and counts toward no rate. */
const hold = (r: Pick<Rule, 'id' | 'property' | 'text' | 'failures'>): Rule => ({
  ...r,
  reads: 'facts',
  opportunity: () => false,
  isHold: true,
})

/**
 * The ids of the subject rows the page draws after the goal, above Other work and under it. With no "Other work" label,
 * the head stands in for it when the list starts with work the goal does not need.
 */
function listIds(page: StatusPage, isOther: (id: string) => boolean): { main: string[]; other: string[] } {
  const ids = (rows: StatusPage['rows']) => rows.flatMap(r => (r.kind === 'subject' ? [r.id] : []))
  const labelAt = page.rows.findIndex(r => r.kind === 'part' && r.id === 'other')
  const [first] = ids(page.rows)
  const isHeadLabel = labelAt < 0 && page.rows[0]?.kind === 'part' && first !== undefined && isOther(first)
  const start = isHeadLabel ? 0 : labelAt

  return start < 0
    ? { main: ids(page.rows), other: [] }
    : { main: ids(page.rows.slice(0, start)), other: ids(page.rows.slice(start)) }
}

/** The id of the saved milestone a page milestone draws, which is not the row's own id when a subject is drawn in its place. */
const savedMilestoneId = (serves: Record<string, string>, row: MilestoneRow) =>
  row.subject ? (serves[row.id] ?? row.id) : row.id

/**
 * Whether a subject belongs under Other work: the goal does not need it, or the goal shows milestones and it serves
 * none of them.
 */
function isOtherWork(serves: Record<string, string>, page: StatusPage, id: string): boolean {
  const shown = new Set((page.goal?.milestones ?? []).map(m => savedMilestoneId(serves, m)))
  const to = serves[id]

  return to === 'none' || (shown.size > 0 && (to === undefined || !shown.has(to)))
}

/** Whether `op` closes the milestone `id` itself, as a DONE line for it or a MILESTONE line that names it done. */
function closesMilestone(op: Op, id: string, before: SessionStatus): boolean {
  if (op.kind === 'done') return findMilestone(before, op.ref)?.id === id
  return op.kind === 'milestone' && op.status === 'done' && findMilestone(before, op.name)?.id === id
}

/** The holds the code keeps, checked at every step of every run. Any failure blocks. */
export const HOLD_RULES: Rule[] = [
  hold({
    id: 'no-number-names',
    property: 6,
    text: 'No open subject and no head is named only by a PR or issue number.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      const names = [...(o?.subjects ?? []).filter(isOpen).map(s => s.name), ...(o?.head ? [o.head.title] : [])]
      return names.filter(isNumberOnly).map(name => `named by a number: "${name}"`)
    },
  }),
  hold({
    id: 'typed-goal-kept',
    property: 14,
    text: 'A typed goal that is not met, with linked work still open, changes only on a press.',
    failures: ({ step, result, before }) => {
      const o = before.overview
      const g = o?.goal
      if (!o || !g || g.source !== 'typed' || g.metAt !== null) return []
      const isWorkOpen = o.subjects.some(s => isOpen(s) && o.milestones.some(m => m.id === o.serves[s.id]))
      const now = result.session.ledger.overview?.goal?.text ?? null
      const isPressed = (step.events ?? []).some(e => 'press' in e)
      return isWorkOpen && now !== g.text && !isPressed
        ? [`the typed goal "${g.text}" went to "${now}" with no press`]
        : []
    },
  }),
  hold({
    id: 'goal-not-repeated',
    property: 14,
    text: 'A goal set with no press restates neither the goal before it nor a goal the person removed.',
    failures: ({ step, result, before }) => {
      const was = before.overview?.goal ?? null
      const o = result.session.ledger.overview
      const g = o?.goal
      const isPressed = (step.events ?? []).some(e => 'press' in e)
      if (!o || !g || isPressed || g.setAt === was?.setAt) return []
      const isGoal = was !== null && restatesGoal(g.text, was.text)
      const isRemoved = o.removedGoals.some(key => restatesGoal(g.text, key))
      return isGoal || isRemoved ? [`set "${g.text}" again`] : []
    },
  }),
  hold({
    id: 'met-follows',
    property: 15,
    text: 'The goal shows met exactly while every milestone that is not dropped is done.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      const shown = result.page.goal
      if (!o?.goal || !shown) return []
      const kept = o.milestones.filter(m => m.status !== 'dropped')
      const isMet = !o.goal.isAwaitingMilestones && kept.length > 0 && kept.every(m => m.status === 'done')
      if (shown.isMet === isMet) return []
      return [
        shown.isMet ? 'the goal shows met with a milestone open' : 'every milestone is done and the goal is not met',
      ]
    },
  }),
  hold({
    id: 'work-closed-milestone-text',
    property: 15,
    text: 'A milestone that closes because its linked work closed, with no line of the answer closing it, shows no text.',
    failures: ({ result, before }) => {
      const o = result.session.ledger.overview
      const was = before.overview
      if (!o || !was) return []
      const ops = result.calls
        .filter(c => c.kind === 'status' && c.overLimit === null)
        .flatMap(c => c.answers)
        .flatMap(a => {
          const parsed = parseStatus(a)
          return parsed?.kind === 'ops' ? parsed.ops : []
        })
      const wasOpen = (id: string) => was.milestones.some(x => x.id === id && isOpen(x))
      return o.milestones
        .filter(m => m.status === 'done' && m.text.trim() !== '' && wasOpen(m.id))
        .filter(m => !ops.some(op => closesMilestone(op, m.id, was)))
        .map(m => `"${m.name}" closed with its work and still reads "${m.text}"`)
    },
  }),
  hold({
    id: 'held-milestone',
    property: 15,
    text: 'A milestone draws its mark in a held color exactly while it is open and an open ask holds it up, itself or through a subject that serves it: the needs-you color while an open question does, else the tasks color.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      if (!o) return []
      return (result.page.goal?.milestones ?? []).flatMap(row => {
        const m = o.milestones.find(x => x.id === savedMilestoneId(o.serves, row))
        if (!m) return [`"${row.name}" is drawn with no saved milestone`]
        const serving = Object.keys(o.serves).filter(id => o.serves[id] === m.id)
        const holds = result.session.ledger.items.filter(i => {
          const to = o.askSubjects[i.id] ?? []
          return to.some(id => id === m.id || serving.includes(id))
        })
        const isHeld = isOpen(m) && holds.length > 0
        const drawnHeldTone = row.tone === 'needsYou' || row.tone === 'tasks' ? row.tone : null
        const heldTone = isHeld ? heldToneOf(holds.map(i => i.kind)) : null
        if (drawnHeldTone === heldTone) return []
        return [
          heldTone === null
            ? `"${m.name}" draws in the ${drawnHeldTone} color with no open ask`
            : `"${m.name}" is held and draws in ${drawnHeldTone ?? 'no held color'} where its asks give ${heldTone}`,
        ]
      })
    },
  }),
  hold({
    id: 'held-milestone-open',
    property: 15,
    text: 'A milestone an open ask holds up, itself or through a subject that serves it, is not done.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      if (!o?.goal || o.goal.isAwaitingMilestones) return []
      const isHeld = (id: string) => {
        const ids = new Set([id, ...Object.keys(o.serves).filter(s => o.serves[s] === id)])
        return result.session.ledger.items.some(i => (o.askSubjects[i.id] ?? []).some(to => ids.has(to)))
      }
      return o.milestones
        .filter(m => m.status === 'done' && isHeld(m.id))
        .map(m => `"${m.name}" is done while an open ask holds it up`)
    },
  }),
  hold({
    id: 'other-work-shows-news',
    property: 16,
    text: 'Under Other work, an open subject that changed since the person looked, or that an ask holds up, has its own row.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      if (!o?.goal) return []
      const drawn = new Set(
        drawnStatusRows(result.page, () => false).flatMap(r => (r.kind === 'subject' ? [r.id] : [])),
      )
      const held = new Set(result.session.ledger.items.flatMap(i => o.askSubjects[i.id] ?? []))
      const isNews = (changedAt: number, id: string) =>
        o.lastLookAt === null || changedAt > o.lastLookAt || held.has(id)
      return o.subjects
        .filter(
          x => x.into === null && isOtherWork(o.serves, result.page, x.id) && isOpen(x) && isNews(x.changedAt, x.id),
        )
        .filter(x => !drawn.has(x.id))
        .map(x => `"${x.name}" folded under Other work with news`)
    },
  }),
  hold({
    id: 'other-work-place',
    property: 16,
    text: 'While the goal shows milestones, every subject not under one sits under Other work. While it shows none, a subject not linked yet sits above Other work.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      if (!o?.goal) return []
      const name = (id: string) => `"${o.subjects.find(x => x.id === id)?.name ?? id}"`
      const isOther = (id: string) => isOtherWork(o.serves, result.page, id)
      const { main, other } = listIds(result.page, isOther)
      return [
        ...other.filter(id => !isOther(id)).map(id => `${name(id)} is under Other work, and the goal needs it`),
        ...main.filter(isOther).map(id => `${name(id)} sits above Other work, and belongs under it`),
      ]
    },
  }),
]
