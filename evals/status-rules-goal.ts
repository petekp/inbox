import { parseStatus } from '../hooks/status'
import { isOpen, MILESTONES_MAX, MILESTONES_MIN, nameKey } from '../hooks/status-limits'
import { rightStatuses } from './status-facts'
import { label, milestonesOf, subjectsFor } from './status-rule-helpers'
import type { Rule, RuleContext } from './status-rules'

const hasCall = ({ step }: RuleContext) => step.call !== undefined
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
      const g = result.session.ledger.overview?.goal
      if (!clear) return []
      return g && new RegExp(clear.match, 'i').test(g.text) ? [] : [`no goal like /${clear.match}/`]
    },
  },
  {
    id: 'milestones-true',
    reads: 'facts',
    property: 15,
    text: "Each of the goal's milestones in the facts has a milestone with a status its state allows, and a goal has them once a call has read it.",
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      if (!o?.goal) return []
      if (o.goal.isAwaitingMilestones)
        return result.readSetAt === o.goal.setAt && !result.isStatusFailed
          ? [`"${o.goal.text}" has no milestones after a call`]
          : []
      return (result.facts.goal?.milestones ?? []).flatMap(m => {
        const saved = milestonesOf(o).filter(x => new RegExp(m.match, 'i').test(x.name))
        if (saved.length === 0) return [`no milestone for ${m.name}`]
        return saved
          .filter(x => !rightStatuses(m).includes(x.status))
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
