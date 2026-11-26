import { isOpen } from '../core/domain/status-limits'
import {
  DECISION_WORDS,
  label,
  milestonesAsPiece,
  milestonesFor,
  milestonesOf,
  shownOf,
  subjectsFor,
} from './status-rule-helpers'
import type { Rule } from './status-rules'

/** Text that says work waits on the person, as "waiting on your check", "needs your yes" or "ready for your review". */
const WAITS_ON_PERSON =
  /\b(wait(s|ing)? (on|for) (you|your)\b|awaits? your|awaiting your|needs? your|for your (review|check|look|try|sign-?off|approval|input|answer|go|yes|ok)\b|your (check|try|yes|ok|okay|approval|answer|look|go|review|input|sign-?off|call)\b)/i

/** The rules for the person's open asks: what each one holds up, and what a held row says. */
export const ASK_RULES: Rule[] = [
  {
    id: 'held-text',
    reads: 'answer',
    property: 9,
    text: "A held subject's or milestone's text names no decision.",
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      const held = new Set(result.session.ledger.items.flatMap(i => o?.askSubjects[i.id] ?? []))
      return [...shownOf(o), ...milestonesOf(o)]
        .filter(s => held.has(s.id) && DECISION_WORDS.test(s.text))
        .map(s => `held, and names the decision: "${s.name}: ${s.text}"`)
    },
  },
  {
    id: 'no-wait-on-person',
    reads: 'answer',
    property: 9,
    text: "No open subject's or milestone's text says it waits on the person. The open ask says that.",
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      return [...shownOf(o), ...milestonesOf(o)]
        .filter(s => isOpen(s) && WAITS_ON_PERSON.test(s.text))
        .map(s => `waits on the person: "${s.name}: ${s.text}"`)
    },
  },
  {
    id: 'asks-linked',
    reads: 'facts',
    property: 8,
    text: 'Each open ask is linked only to subjects it holds up, or to the milestone a piece it holds up is the whole of, and an ask that holds up nothing is linked to none, or only to a subject of its own when its facts allow one.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      return result.facts.asks.flatMap(a => {
        const item = result.session.ledger.items.find(i => new RegExp(a.match, 'i').test(i.ask))
        if (!item) return [`no open ask like /${a.match}/`]
        const ids = o?.askSubjects[item.id] ?? []
        const linked = shownOf(o).filter(s => ids.includes(s.id))
        const pieces = result.facts.pieces.filter(p => a.holdsUp.includes(p.id))
        const heldMilestones = pieces
          .flatMap(p => milestonesAsPiece(p, result.facts, o))
          .filter(m => ids.includes(m.id))
        if (pieces.length === 0 && a.neverHoldsUp)
          return result.facts.pieces
            .filter(p => a.neverHoldsUp?.includes(p.id))
            .flatMap(p => linked.filter(s => new RegExp(p.match, 'i').test(s.name)))
            .map(s => `"${item.ask}" never holds up ${s.name}, and is linked to it`)
        if (pieces.length === 0)
          return [
            ...linked.map(s => `"${item.ask}" holds up nothing, and is linked to ${label(s)}`),
            ...milestonesOf(o)
              .filter(m => ids.includes(m.id))
              .map(m => `"${item.ask}" holds up nothing, and is linked to the milestone "${m.name}"`),
          ]
        const servedIds = new Set(
          (result.facts.goal?.milestones ?? [])
            .filter(m => pieces.some(p => p.serves === m.id || p.servesAlso === m.id))
            .flatMap(m => milestonesFor(m, result.facts, o))
            .map(m => m.id),
        )
        const otherMilestones = milestonesOf(o).filter(m => ids.includes(m.id) && !servedIds.has(m.id))
        const names = pieces.map(p => p.names[0]).join(' or ')
        if (linked.length === 0 && heldMilestones.length === 0 && otherMilestones.length === 0)
          return [`"${item.ask}" is linked to no subject`]
        return [
          ...linked
            .filter(s => !pieces.some(p => new RegExp(p.match, 'i').test(s.name)))
            .map(s => `"${item.ask}" is linked to ${label(s)}, not ${names}`),
          ...otherMilestones.map(m => `"${item.ask}" is linked to the milestone "${m.name}", not ${names}`),
        ]
      })
    },
  },
  {
    id: 'ask-holds-several',
    reads: 'facts',
    property: 8,
    text: 'An ask that holds up several pieces marks each of them.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      return result.facts.asks
        .filter(a => a.holdsUp.length > 1)
        .flatMap(a => {
          const item = result.session.ledger.items.find(i => new RegExp(a.match, 'i').test(i.ask))
          const linked = item ? (o?.askSubjects[item.id] ?? []) : []
          return result.facts.pieces
            .filter(p => a.holdsUp.includes(p.id))
            .filter(p => !subjectsFor(p, o).some(s => linked.includes(s.id)))
            .map(p => `"${a.text}" does not hold up ${p.names[0]}`)
        })
    },
  },
]
