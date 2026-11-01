import { parseStatus } from '../hooks/status'
import { isOpen, MILESTONES_MAX, MILESTONES_MIN } from '../hooks/status-limits'
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
    id: 'proposal-only-when-stated',
    reads: 'facts',
    opportunity: ctx => hasCall(ctx) && !ctx.result.facts.goalStated,
    property: 14,
    text: 'No proposal appears at a step where the person stated no new outcome with a finish line.',
    failures: ({ result, before }) => {
      const proposed = result.session.ledger.overview?.proposedGoal ?? null
      if (result.facts.goalStated) return []
      return proposed && proposed.text !== before.overview?.proposedGoal?.text ? [`proposed "${proposed.text}"`] : []
    },
  },
  {
    id: 'proposal-when-stated',
    reads: 'facts',
    opportunity: ctx => hasCall(ctx) && !!ctx.result.facts.goalStated,
    property: 14,
    text: 'A step where the person stated an outcome with a finish line shows a proposal of it, unless it is already the goal.',
    failures: ({ result }) => {
      const stated = result.facts.goalStated
      const o = result.session.ledger.overview
      if (!stated) return []
      const isMatch = (text: string | undefined) => text !== undefined && new RegExp(stated.match, 'i').test(text)
      return isMatch(o?.proposedGoal?.text) || isMatch(o?.goal?.text) ? [] : [`no proposal like /${stated.match}/`]
    },
  },
  {
    id: 'milestones-true',
    reads: 'facts',
    property: 15,
    text: "Each of the goal's milestones in the facts has a milestone with a status its state allows, and a goal has them once a call has read it.",
    failures: ({ step, result }) => {
      const o = result.session.ledger.overview
      if (!o?.goal) return []
      if (o.goal.isAwaitingMilestones)
        return step.call && !result.isStatusFailed ? [`"${o.goal.text}" has no milestones after a call`] : []
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
    text: `A goal or a proposal has ${MILESTONES_MIN} to ${MILESTONES_MAX} milestones.`,
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      const counts = [
        ...(o?.goal && !o.goal.isAwaitingMilestones
          ? [{ text: o.goal.text, n: milestonesOf(o).filter(m => m.status !== 'dropped').length }]
          : []),
        ...(o?.proposedGoal ? [{ text: o.proposedGoal.text, n: o.proposedGoal.milestones.length }] : []),
      ]
      return counts
        .filter(c => c.n < MILESTONES_MIN || c.n > MILESTONES_MAX)
        .map(c => `${c.n} milestones for "${c.text}"`)
    },
  },
  {
    id: 'serves-linked',
    reads: 'facts',
    property: 16,
    text: 'Each subject the facts say what it serves is linked: one the goal needs to a milestone, and one it does not need to Other work.',
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
                if (link === undefined) return step.call ? [`${label(s)} is not linked`] : []
                if (p.serves === 'none' && link !== 'none')
                  return [`${label(s)} serves a milestone, and the goal does not need it`]
                return p.serves !== 'none' && link === 'none'
                  ? [`${label(s)} is under Other work, and the goal needs it`]
                  : []
              }),
      )
    },
  },
]
