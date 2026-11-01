import { HELD_MARK } from '../hooks/help'
import { isOpen, nameKey } from '../hooks/status-limits'
import type { StatusPage } from '../hooks/status-page'
import type { Rule } from './status-rules'

/** A hold the code keeps. It reads the page and the saved Status at every step, and counts toward no rate. */
const hold = (r: Pick<Rule, 'id' | 'property' | 'text' | 'failures'>): Rule => ({
  ...r,
  reads: 'facts',
  opportunity: () => false,
  isHold: true,
})

/** The ids of the subject rows the page draws under Other work. */
function otherWorkIds(page: StatusPage): string[] {
  const start = page.rows.findIndex(r => r.kind === 'part')
  if (start < 0) return []

  return page.rows.slice(start).flatMap(r => (r.kind === 'subject' ? [r.id] : []))
}

/** The holds the code keeps for the goal, checked at every step of every run. Any failure blocks. */
export const HOLD_RULES: Rule[] = [
  hold({
    id: 'goal-on-press',
    property: 14,
    text: 'The goal changes only on a press.',
    failures: ({ step, result, before }) => {
      const was = before.overview?.goal?.text ?? null
      const now = result.session.ledger.overview?.goal?.text ?? null
      const isPressed = (step.events ?? []).some(e => 'press' in e)
      return was !== now && !isPressed ? [`the goal went from "${was}" to "${now}" with no press`] : []
    },
  }),
  hold({
    id: 'proposal-not-repeated',
    property: 14,
    text: 'No proposal has the name key of the goal or of a goal the person declined.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      const p = o?.proposedGoal
      if (!o || !p) return []
      const key = nameKey(p.text)
      const isGoal = o.goal !== null && nameKey(o.goal.text) === key
      return isGoal || o.declinedGoals.includes(key) ? [`proposed "${p.text}" again`] : []
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
    id: 'held-milestone',
    property: 15,
    text: 'A milestone shows ◆ exactly while it is open and an open ask holds it up, itself or through a subject that serves it.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      if (!o) return []
      return (result.page.goal?.milestones ?? []).flatMap(row => {
        const m = o.milestones.find(x => x.id === row.id)
        if (!m) return [`"${row.name}" is drawn with no saved milestone`]
        const serving = Object.keys(o.serves).filter(id => o.serves[id] === m.id)
        const isHeld =
          isOpen(m) &&
          result.session.ledger.items.some(i => {
            const to = o.askSubjects[i.id]
            return to === m.id || (to !== undefined && serving.includes(to))
          })
        const isDrawnHeld = row.mark === HELD_MARK.mark
        if (isDrawnHeld === isHeld) return []
        return [`"${m.name}" ${isDrawnHeld ? 'shows ◆ with no open ask' : 'is held and shows no ◆'}`]
      })
    },
  }),
  hold({
    id: 'other-work-shows-news',
    property: 16,
    text: 'Under Other work, an open subject that changed since the person looked, or that an ask holds up, has its own row.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      if (!o?.goal) return []
      const drawn = new Set(result.page.rows.flatMap(r => (r.kind === 'subject' ? [r.id] : [])))
      const held = new Set(result.session.ledger.items.flatMap(i => o.askSubjects[i.id] ?? []))
      const isNews = (changedAt: number, id: string) =>
        o.lastLookAt === null || changedAt > o.lastLookAt || held.has(id)
      return o.subjects
        .filter(x => x.into === null && o.serves[x.id] === 'none' && isOpen(x) && isNews(x.changedAt, x.id))
        .filter(x => !drawn.has(x.id))
        .map(x => `"${x.name}" folded under Other work with news`)
    },
  }),
  hold({
    id: 'unlinked-in-main',
    property: 16,
    text: 'A subject not linked to a milestone yet sits in the main list, not under Other work.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      return otherWorkIds(result.page)
        .filter(id => o?.serves[id] !== 'none')
        .map(id => `"${o?.subjects.find(x => x.id === id)?.name ?? id}" is under Other work without a link there`)
    },
  }),
]
