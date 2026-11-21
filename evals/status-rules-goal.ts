import { parseStatus } from '../core/domain/status'
import { isOpen, MILESTONE_SUBJECTS, MILESTONES_MAX, MILESTONES_MIN, nameKey } from '../core/domain/status-limits'
import { tooBigMilestones } from '../core/domain/status-prompt-goal'
import { milestonePath } from '../core/view/status-path'
import { rightStatuses } from './status-facts'
import type { MilestoneFact } from './status-facts'
import { label, milestonesFor, milestonesHolding, milestonesOf, subjectsFor } from './status-rule-helpers'
import type { Milestone, SessionStatus, SubjectStatus } from '../types'
import type { Rule, RuleContext } from './status-rules'

const hasCall = ({ step }: RuleContext) => step.call !== undefined
const isOpenMilestone = (m: Milestone) => m.status === 'working' || m.status === 'queued'

/**
 * The statuses right for one page milestone that stands for several of the facts' milestones: done once all are done,
 * working while any is, and working or queued while some are done and the rest wait.
 */
function rightForAll(ms: MilestoneFact[]): SubjectStatus[] {
  const kept = ms.filter(m => m.state !== 'dropped')
  if (kept.length <= 1) return (kept.length === 1 ? kept : ms).flatMap(rightStatuses)
  const also = kept.flatMap(m => m.alsoRight ?? [])
  if (kept.every(m => m.state === 'done')) return ['done', ...also]
  if (kept.some(m => m.state === 'working')) return ['working', ...also]
  return kept.some(m => m.state === 'done') ? ['working', 'queued', ...also] : kept.flatMap(rightStatuses)
}
const stripState = (failure: string) => failure.slice(0, failure.lastIndexOf(', and '))

/** The rules for the goal, its milestones and what each subject serves, and for an answer the host can apply. */
export const GOAL_RULES: Rule[] = [
  {
    id: 'answer-readable',
    reads: 'facts',
    opportunity: hasCall,
    property: 9,
    text: 'The answer the host would apply, after its one re-ask, parses.',
    failures: ({ result }) => {
      const call = result.calls.find(c => c.kind === 'status')
      const answer = call?.overLimit === null ? call.answers.at(-1) : null
      return answer != null && parseStatus(answer) === null ? [`unreadable answer: "${answer.slice(0, 80)}"`] : []
    },
  },
  {
    id: 'goal-left',
    reads: 'facts',
    opportunity: ctx => hasCall(ctx) && ctx.result.facts.goal?.isLeft === true,
    property: 14,
    text: 'A goal the facts say the work has left is retired or met, not still open, and no work is newly linked to its milestones.',
    failures: ({ result, before }) => {
      const left = result.facts.goal
      const o = result.session.ledger.overview
      const g = o?.goal
      if (!left?.isLeft || !o || !g || !new RegExp(left.match, 'i').test(g.text)) return []
      const milestones = new Set(o.milestones.map(m => m.id))
      const newlyLinked = o.subjects
        .filter(isOpen)
        .filter(s => milestones.has(o.serves[s.id] ?? '') && before.overview?.serves[s.id] !== o.serves[s.id])
        .map(s => `${label(s)} is newly linked to the left goal "${g.text}"`)
      if (g.metAt !== null)
        return left.isDropped ? [`"${g.text}" reads met after the person dropped its outcome`] : newlyLinked
      return [`"${g.text}" is still open`, ...newlyLinked]
    },
  },
  {
    id: 'goal-kept',
    reads: 'facts',
    opportunity: ctx => {
      const g = ctx.result.facts.goal
      return hasCall(ctx) && g != null && !g.isLeft && !g.mayEnd && g.text === ctx.before.facts.goal?.text
    },
    property: 14,
    text: 'A goal the facts keep, met or not, stays on the page.',
    failures: ({ result, before }) => {
      const kept = result.facts.goal
      const g = result.session.ledger.overview?.goal
      if (!kept || kept.isLeft || kept.mayEnd || kept.text !== before.facts.goal?.text) return []
      return g && new RegExp(kept.match, 'i').test(g.text) ? [] : [`the goal "${kept.text}" went`]
    },
  },
  {
    id: 'goal-only-when-clear',
    reads: 'facts',
    opportunity: ctx => hasCall(ctx) && !ctx.result.facts.goalClear,
    property: 14,
    text: 'No goal is set at a step that makes no next goal clear.',
    failures: ({ result, before }) => {
      const g = result.session.ledger.overview?.goal ?? null
      if (result.facts.goalClear || !g || g.source !== 'inferred') return []
      return g.setAt !== before.overview?.goal?.setAt ? [`set "${g.text}"`] : []
    },
  },
  {
    id: 'goal-when-clear',
    reads: 'facts',
    opportunity: ctx => hasCall(ctx) && !!ctx.result.facts.goalClear,
    property: 14,
    text: 'A step that makes the next goal clear shows that goal.',
    failures: ({ result }) => {
      const clear = result.facts.goalClear
      const o = result.session.ledger.overview
      const g = o?.goal
      if (!clear) return []
      const matches = (text: string | null | undefined) => !!text && new RegExp(clear.match, 'i').test(text)
      if (matches(g?.text)) return []
      const isGoalRunning = g != null && g.metAt === null
      const isSuggestedRight = clear.alsoSuggested === true && !isGoalRunning && matches(o?.suggestedGoal)
      if (isSuggestedRight) return []
      return [`no goal${clear.alsoSuggested ? ' or suggested goal' : ''} like /${clear.match}/`]
    },
  },
  {
    id: 'goal-suggested',
    reads: 'facts',
    opportunity: ctx => hasCall(ctx) && !!ctx.result.facts.goalSuggested,
    property: 14,
    text: 'While no goal runs, a step whose work most likely leads to an outcome suggests that outcome as the goal.',
    failures: ({ result }) => {
      const likely = result.facts.goalSuggested
      const o = result.session.ledger.overview
      const isGoalRunning = o?.goal != null && o.goal.metAt === null
      if (!likely || isGoalRunning) return []
      const suggested = o?.suggestedGoal ?? null
      if (suggested !== null && new RegExp(likely.match, 'i').test(suggested)) return []
      return [suggested === null ? `no suggested goal like /${likely.match}/` : `suggested "${suggested}"`]
    },
  },
  {
    id: 'milestones-true',
    reads: 'facts',
    property: 15,
    text: "Each of the goal's milestones in the facts has a milestone with a status its state allows, or none when it is dropped, and a goal has them once a call has read it. A working one may be planned in steps: while one of its milestones, or the one its work serves, is working, the others may be queued.",
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      if (!o?.goal) return []
      if (o.goal.isAwaitingMilestones)
        return result.readSetAt === o.goal.setAt && !result.isStatusFailed
          ? [`"${o.goal.text}" has no milestones after a call`]
          : []
      const facts = result.facts.goal?.milestones ?? []
      const standsFor = (x: Milestone) => facts.filter(m => milestonesFor(m, result.facts, o).some(y => y.id === x.id))
      const isStartedElsewhere = (m: MilestoneFact) =>
        m.state === 'working' &&
        [...milestonesFor(m, result.facts, o), ...milestonesHolding(m, result.facts, o)].some(
          y => y.status === 'working',
        )
      const isLaterStep = (x: Milestone) =>
        x.status === 'queued' && standsFor(x).every(m => rightStatuses(m).includes('queued') || isStartedElsewhere(m))
      return facts.flatMap(m => {
        const saved = milestonesFor(m, result.facts, o)
        if (saved.length === 0) return m.state === 'dropped' ? [] : [`no milestone for ${m.name}`]
        return saved
          .filter(x => !rightForAll(standsFor(x)).includes(x.status) && !isLaterStep(x))
          .map(x => `"${x.name}" is ${x.status}, and ${m.name} is ${m.state}`)
      })
    },
    key: stripState,
  },
  {
    id: 'milestones-shape',
    reads: 'answer',
    property: 15,
    text: `A goal has ${MILESTONES_MIN} to ${MILESTONES_MAX} milestones, none named after a subject.`,
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      if (!o?.goal || o.goal.isAwaitingMilestones) return []
      const kept = milestonesOf(o).filter(m => m.status !== 'dropped')
      const subjects = new Set(o.subjects.map(s => nameKey(s.name)))
      const isCountWrong = kept.length < MILESTONES_MIN || kept.length > MILESTONES_MAX
      return [
        ...(isCountWrong ? [`${kept.length} milestones for "${o.goal.text}"`] : []),
        ...kept.filter(m => subjects.has(nameKey(m.name))).map(m => `milestone "${m.name}" is named after a subject`),
      ]
    },
  },
  {
    id: 'milestone-text',
    reads: 'answer',
    property: 6,
    text: 'An open milestone that open work serves, which the call read with no text, says where it stands after it.',
    failures: ({ result, before }) => {
      const blankServed = (o: SessionStatus | null) => {
        const served = new Set(o?.subjects.filter(isOpen).map(s => o.serves[s.id]))
        return milestonesOf(o).filter(m => isOpenMilestone(m) && served.has(m.id) && m.text.trim() === '')
      }
      const read = new Set(blankServed(before.overview).map(m => m.id))
      return blankServed(result.session.ledger.overview)
        .filter(m => read.has(m.id))
        .map(m => `milestone "${m.name}" still has no text while work serves it`)
    },
  },
  {
    id: 'milestone-size',
    reads: 'facts',
    opportunity: hasCall,
    property: 15,
    text: `A milestone the call read marked too big still has more than ${MILESTONE_SUBJECTS} subjects after the step only when none of them is open.`,
    failures: ({ result, before }) => {
      const o = result.session.ledger.overview
      const read = tooBigMilestones(before.overview)
      return milestonesOf(o)
        .filter(m => read.has(m.id) && isOpen(m))
        .flatMap(m => {
          const work = o!.subjects.filter(s => s.status !== 'dropped' && o!.serves[s.id] === m.id)
          const isStillTooBig = work.length > MILESTONE_SUBJECTS && work.some(isOpen)
          return isStillTooBig ? [`"${m.name}" serves ${work.length} subjects`] : []
        })
    },
    key: failure => failure.slice(0, failure.lastIndexOf(' serves ')),
  },
  {
    id: 'milestone-next',
    reads: 'facts',
    opportunity: ctx => hasCall(ctx) && ctx.result.facts.goal?.next !== undefined,
    property: 15,
    text: 'The milestone that reads next is the queued one the facts say the plan takes up next.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      const fact = result.facts.goal?.milestones.find(m => m.id === result.facts.goal?.next)
      if (!o?.goal || o.goal.isAwaitingMilestones || fact === undefined) return []
      const next = milestonePath(milestonesOf(o)).find(s => s.place === 'next')?.milestone
      if (next === undefined) return [`no milestone reads next, and ${fact.name} comes next`]
      return new RegExp(fact.match, 'i').test(next.name)
        ? []
        : [`"${next.name}" reads next, and ${fact.name} comes next`]
    },
    key: failure => failure.slice(failure.lastIndexOf(', and ')),
  },
  {
    id: 'serves-linked',
    reads: 'facts',
    property: 16,
    text: 'Each subject the facts say what it serves is linked: one the goal needs to a milestone, and one it does not need to Other work. A piece with a second right link may take either.',
    failures: ({ step, result }) => {
      const o = result.session.ledger.overview
      if (!o?.goal || o.goal.isAwaitingMilestones) return []
      return result.facts.pieces.flatMap(p =>
        p.serves === undefined
          ? []
          : subjectsFor(p, o)
              .filter(isOpen)
              .flatMap(s => {
                const link = o.serves[s.id]
                const isLive = link === 'none' || o.milestones.some(m => m.id === link && m.status !== 'dropped')
                if (!isLive) return step.call ? [`${label(s)} is not linked`] : []
                const isNoneRight = p.serves === 'none' || p.servesAlso === 'none'
                const isMilestoneRight = p.serves !== 'none' || (p.servesAlso !== undefined && p.servesAlso !== 'none')
                if (!isNoneRight && link === 'none') return [`${label(s)} is under Other work, and the goal needs it`]
                return !isMilestoneRight && link !== 'none'
                  ? [`${label(s)} serves a milestone, and the goal does not need it`]
                  : []
              }),
      )
    },
  },
]
