import { isOpen, NAME_WORDS } from '../hooks/status-limits'
import { NAMED_FOLD_TEXT, namedFoldMore, statusListRows } from '../hooks/status-page'
import type { SessionStatus, Subject } from '../types'
import { isOpenPiece, rightStatuses } from './status-facts'
import type { Facts } from './status-facts'
import { GOAL_RULES } from './status-rules-goal'
import { HOLD_RULES } from './status-holds'
import type { Step, StepResult } from './status-replay'
import {
  DECISION_WORDS,
  DATE_WORDS,
  ID_PATTERNS,
  milestoneNames,
  milestonesOf,
  NUMBERED,
  STATUS_WORDS,
  TIME_WORDS,
  WORD,
  headWords,
  isPlainLabel,
  keyWords,
  label,
  modelTexts,
  restatesText,
  shownOf,
  subjectsFor,
} from './status-rule-helpers'

/** What a rule reads: the step, the state it left, and the state before it. */
export type RuleContext = {
  step: Step
  result: StepResult
  before: { overview: SessionStatus | null; facts: Facts }
}

/**
 * Where a rule can newly fail: in text the step's answer wrote, wherever the answer wrote or the facts changed, or at
 * a step with a call and no change in the facts.
 */
export type Reads = 'answer' | 'facts' | 'quiet'

export type Rule = {
  id: string
  property: number
  reads: Reads
  /** What the rule checks, as the spec says it. */
  text: string
  /** The decision or issue the rule waits on. Until it is built, the rule is expected to fail and blocks nothing. */
  until?: string
  failures(ctx: RuleContext): string[]
  /** What makes two failures the same failure, so one left on the page counts once. The failure's text by default. */
  key?: (failure: string) => string
  /** Where the rule can newly fail, in place of what `reads` gives. */
  opportunity?: (ctx: RuleContext) => boolean
  /** A hold the code keeps, not the model: any failure blocks, and it counts toward no rate. */
  isHold?: true
}

/**
 * One rule at one step. `fresh` holds the failures that were not already there at the last step with a call, and
 * `isOpportunity` says whether the step could make the rule newly fail.
 */
export type RuleResult = {
  rule: string
  property: number
  failures: string[]
  fresh: string[]
  isOpportunity: boolean
  isHold: boolean
  until: string | null
}

const FIXED_RULES: Rule[] = [
  {
    id: 'no-time-words',
    reads: 'answer',
    property: 13,
    text: 'No text the model writes holds a time word or a date: the head, the goal or proposal, a milestone, a name, where it stands, or a was line.',
    failures: ({ result }) =>
      modelTexts(result.session.ledger.overview)
        .filter(t => TIME_WORDS.test(t) || DATE_WORDS.test(t))
        .map(t => `time word: "${t}"`),
  },
  {
    id: 'short-names',
    reads: 'answer',
    property: 3,
    text: 'A subject or milestone name has at most 3 words, no "…" and no question mark.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      return [...shownOf(o).map(s => s.name), ...milestoneNames(o)]
        .filter(name => name.trim().split(/\s+/).length > NAME_WORDS || /…|\?/.test(name))
        .map(name => `name: "${name}"`)
    },
  },
  {
    id: 'text-no-ids',
    reads: 'answer',
    property: 6,
    text: "A subject's or milestone's text names no command, file, hash, ticket or PR number, or count of things run.",
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      return [...shownOf(o), ...milestonesOf(o)]
        .filter(s => ID_PATTERNS.some(re => re.test(s.text)))
        .map(s => `id in the text: "${s.name}: ${s.text}"`)
    },
  },
  {
    id: 'no-semicolons',
    reads: 'answer',
    property: 6,
    text: 'No name, where it stands, head, milestone or goal joins clipped phrases with a semicolon.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      const head = o?.head ? [o.head.title, o.head.description] : []
      const goals = [o?.goal?.text ?? '']
      const pieces = [...shownOf(o), ...milestonesOf(o)].flatMap(s => [s.name, s.text])

      return [...head, ...goals, ...pieces].filter(t => t.includes(';')).map(t => `semicolon: "${t}"`)
    },
  },
  {
    id: 'head-no-status',
    reads: 'answer',
    property: 1,
    text: 'The head holds no status word.',
    failures: ({ result }) => {
      const head = headWords(result.session.ledger.overview)
      return STATUS_WORDS.test(head) ? [`status word in the head: "${head}"`] : []
    },
  },
  {
    id: 'head-follows',
    reads: 'facts',
    property: 1,
    text: 'The head names the focus in the facts, and its title no longer names finished work the focus moved on from. It changes where the focus moved, and holds where it did not.',
    failures: ({ result, before }) => {
      const now = result.session.ledger.overview?.head ?? null
      const earlier = before.overview?.head ?? null
      const head = headWords(result.session.ledger.overview)
      const last = headWords(before.overview)
      const { focusMatch, pastMatch } = result.facts
      const isFocusSame = focusMatch === before.facts.focusMatch
      const isDescriptionFilled = earlier?.description === '' && now?.title === earlier.title
      if (!new RegExp(focusMatch, 'i').test(head)) return [`the head "${head}" is not about /${focusMatch}/`]
      const shown = result.session.ledger.overview?.goal ? now?.description || now?.title || '' : (now?.title ?? '')
      if (pastMatch && now && new RegExp(pastMatch, 'i').test(shown))
        return [`the head "${shown}" still names /${pastMatch}/`]
      return isFocusSame && last !== '' && head !== last && !isDescriptionFilled
        ? [`the head moved from "${last}" to "${head}"`]
        : []
    },
  },
  {
    id: 'no-duplicates',
    reads: 'answer',
    property: 4,
    text: 'No two open subjects, and no two open milestones, share every key word of a name, numbers included, or the same issue or PR number.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      const pairs = (open: Pick<Subject, 'name' | 'text'>[]) =>
        open.flatMap((a, i) =>
          open.slice(i + 1).flatMap(b => {
            const [x, y] = [keyWords(a.name), keyWords(b.name)].sort((p, q) => p.size - q.size)
            const isSameName = x!.size > 0 && [...x!].every(w => y!.has(w))
            const numbers = (s: Pick<Subject, 'text'>): string[] => s.text.match(NUMBERED) ?? []
            const shared = numbers(a).filter(n => numbers(b).includes(n))
            return isSameName || shared.length > 0 ? [`"${a.name}: ${a.text}" and "${b.name}: ${b.text}"`] : []
          }),
        )
      return [...pairs(shownOf(o).filter(isOpen)), ...pairs(milestonesOf(o).filter(isOpen))]
    },
  },
  {
    id: 'piece-once',
    reads: 'facts',
    property: 4,
    text: 'No piece in the facts has two open subjects, and no milestone in the facts has two open milestones.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      const pieces = result.facts.pieces.flatMap(p => {
        const open = subjectsFor(p, o).filter(isOpen)
        return open.length > 1 ? [`${p.names[0]} shows as ${open.map(label).join(' and ')}`] : []
      })
      const milestones = (result.facts.goal?.milestones ?? []).flatMap(m => {
        const open = milestonesOf(o).filter(x => isOpen(x) && new RegExp(m.match, 'i').test(x.name))
        return open.length > 1 ? [`${m.name} shows as ${open.map(x => `"${x.name}"`).join(' and ')}`] : []
      })
      return [...pieces, ...milestones]
    },
  },
  {
    id: 'open-pieces-kept',
    reads: 'facts',
    property: 5,
    text: 'Every open piece in the facts is an open subject, drawn as a row or in the "N more" fold.',
    failures: ({ result }) =>
      result.facts.pieces
        .filter(isOpenPiece)
        .filter(p => !subjectsFor(p, result.session.ledger.overview).some(isOpen))
        .map(p => `no open subject for ${p.names[0]}`),
  },
  {
    id: 'marks-true',
    reads: 'facts',
    property: 5,
    text: "Each piece's subject has a status its state allows.",
    failures: ({ result }) =>
      result.facts.pieces.flatMap(p =>
        subjectsFor(p, result.session.ledger.overview)
          .filter(s => !rightStatuses(p).includes(s.status))
          .map(s => `${label(s)} is ${s.status}, and ${p.names[0]} is ${p.state}`),
      ),
    key: failure => failure.slice(0, failure.lastIndexOf(', and ')),
  },
  {
    id: 'not-work',
    reads: 'answer',
    property: 3,
    text: 'No subject is an ask, a finding, a task for the person or a standing rule. No text restates an open ask or finding.',
    failures: ({ result }) => {
      const subjects = shownOf(result.session.ledger.overview)
      const ledger = result.session.ledger
      const asks = [...ledger.items.map(i => i.ask), ...ledger.findings.map(f => f.title)]
      return [
        ...result.facts.notWork.flatMap(n =>
          subjects.filter(s => new RegExp(n.match, 'i').test(s.name)).map(s => `${n.kind} as a subject: ${label(s)}`),
        ),
        ...subjects.flatMap(s =>
          asks.filter(a => restatesText(`${s.name} ${s.text}`, a)).map(a => `${label(s)} restates "${a}"`),
        ),
      ]
    },
  },
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
    id: 'asks-linked',
    reads: 'facts',
    property: 8,
    text: 'Each open ask is linked only to subjects it holds up, and an ask that holds up nothing is linked to none.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      return result.facts.asks.flatMap(a => {
        const item = result.session.ledger.items.find(i => new RegExp(a.match, 'i').test(i.ask))
        if (!item) return [`no open ask like /${a.match}/`]
        const ids = o?.askSubjects[item.id] ?? []
        const linked = shownOf(o).filter(s => ids.includes(s.id))
        const pieces = result.facts.pieces.filter(p => a.holdsUp.includes(p.id))
        if (pieces.length === 0) return linked.map(s => `"${item.ask}" holds up nothing, and is linked to ${label(s)}`)
        if (linked.length === 0) return [`"${item.ask}" is linked to no subject`]
        return linked
          .filter(s => !pieces.some(p => new RegExp(p.match, 'i').test(s.name)))
          .map(s => `"${item.ask}" is linked to ${label(s)}, not ${pieces.map(p => p.names[0]).join(' or ')}`)
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
  {
    id: 'children-linked',
    reads: 'facts',
    property: 7,
    text: 'Each running child is linked to the subject it serves.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      return result.facts.children.flatMap(c => {
        const child = o?.children.find(x => x.ref === c.ref)
        const piece = result.facts.pieces.find(p => p.id === c.serves)
        if (!child || !piece) return [`no child ${c.ref}`]
        const subject = shownOf(o).find(s => s.id === child.subjectId)
        return subject && new RegExp(piece.match, 'i').test(subject.name)
          ? []
          : [`${child.name} is under ${subject ? label(subject) : 'no subject'}, not ${piece.names[0]}`]
      })
    },
  },
  {
    id: 'child-labels',
    reads: 'facts',
    property: 7,
    text: 'A running child reads in plain words: not its host handle, no words joined by "-" or "_", at least two words.',
    until: '#149',
    failures: ({ result }) =>
      (result.session.ledger.overview?.children ?? [])
        .filter(c => c.endedAt === null && !isPlainLabel(c.name, c.ref))
        .map(c => `child label "${c.name}"`),
  },
  {
    id: 'no-news-no-move',
    reads: 'quiet',
    property: 11,
    text: 'On a step that changed no work, no subject or milestone is added, no last-changed time moves, and the goal and proposal hold.',
    failures: ({ step, result, before }) => {
      if (!step.call || result.facts.changed.length > 0) return []
      const o = result.session.ledger.overview
      const moved = <T extends { id: string; name: string; changedAt: number }>(now: T[], then: T[]) => {
        const was = new Map(then.map(x => [x.id, x]))
        return now.flatMap(x => {
          const old = was.get(x.id)
          if (!old) return [`added "${x.name}"`]
          return old.changedAt === x.changedAt ? [] : [`moved "${x.name}"`]
        })
      }
      const goalMoved = (o?.goal?.text ?? null) !== (before.overview?.goal?.text ?? null)
      return [
        ...moved(shownOf(o), shownOf(before.overview)),
        ...moved(milestonesOf(o), milestonesOf(before.overview)),
        ...(goalMoved ? ['the goal block changed'] : []),
      ]
    },
  },
  {
    id: 'changes-move',
    reads: 'facts',
    property: 10,
    text: "On a step that changed work, each changed piece's last-changed time moves. A new link alone moves nothing.",
    failures: ({ step, result }) => {
      if (!step.call) return []
      const isLinkOnly = (id: string) => {
        const change = step.facts?.pieces?.find(p => p.id === id)
        return change !== undefined && Object.keys(change).every(k => k === 'id' || k === 'serves')
      }
      return result.facts.changed.flatMap(id => {
        const piece = result.facts.pieces.find(p => p.id === id)
        if (piece === undefined || isLinkOnly(id)) return []
        const subjects = subjectsFor(piece, result.session.ledger.overview)
        return subjects.some(s => s.changedAt === result.now) ? [] : [`${piece.names[0]} changed, and no row moved`]
      })
    },
  },
  {
    id: 'was-on-reversal',
    reads: 'facts',
    property: 12,
    text: 'A changed plan puts a was line on its subject, and a step of plain progress adds none.',
    failures: ({ step, result, before }) => {
      const o = result.session.ledger.overview
      const reversed = (step.facts?.pieces ?? []).filter(p => p.was || p.merged).map(p => p.id)
      const missing = result.facts.pieces
        .filter(p => reversed.includes(p.id))
        .filter(p => !subjectsFor(p, o).some(s => s.was))
        .map(p => `${p.names[0]} changed plan, and has no was line`)
      const hadWas = new Set(
        shownOf(before.overview)
          .filter(s => s.was)
          .map(s => s.id),
      )
      const reversedSubjects = new Set(
        result.facts.pieces.filter(p => reversed.includes(p.id)).flatMap(p => subjectsFor(p, o).map(s => s.id)),
      )
      const added = shownOf(o)
        .filter(s => s.was && !hadWas.has(s.id) && !reversedSubjects.has(s.id))
        .map(s => `a was line on plain progress: ${label(s)}, was ${s.was}`)
      return [...missing, ...added]
    },
  },
  {
    id: 'was-not-cut',
    reads: 'answer',
    property: 12,
    text: 'No was or merged-in line ends cut with "…".',
    failures: ({ result }) =>
      shownOf(result.session.ledger.overview).flatMap(s =>
        [s.was, s.merged]
          .filter((line): line is string => line?.includes('…') === true)
          .map(line => `cut line: "${line}"`),
      ),
  },
  {
    id: 'failure-shown',
    reads: 'facts',
    property: 13,
    text: 'While the last Status call wrote nothing, the status line says so.',
    failures: ({ result }) =>
      result.isStatusFailed && result.page.error === null ? ['the call failed, and the page does not say so'] : [],
  },
  {
    id: 'head-title',
    reads: 'answer',
    property: 1,
    text: 'The head is a title of at most 3 words, with no "…" or question mark, and a description that does not repeat it.',
    failures: ({ result }) => {
      const head = result.page.head
      if (head === null) return ['the page has no head']
      const titleWords = new Set(head.title.toLowerCase().match(WORD) ?? [])
      const descriptionWords = head.description?.toLowerCase().match(WORD) ?? []
      const isTitleLong = head.title.trim().split(/\s+/).length > NAME_WORDS
      return [
        ...(isTitleLong || /…|\?/.test(head.title) ? [`title: "${head.title}"`] : []),
        ...(descriptionWords.length === 0 ? ['the head has no description'] : []),
        ...(descriptionWords.length > 0 && descriptionWords.every(w => titleWords.has(w))
          ? [`the description repeats the title: "${head.description}"`]
          : []),
      ]
    },
  },
  {
    id: 'finished-named',
    reads: 'facts',
    property: 10,
    text: 'Every piece that finished or was dropped since the last look is drawn as a row, or named or counted in the "Also done" or "Also dropped" line.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      const look = o?.lastLookAt ?? null
      const rows = statusListRows(result.page)
      const drawn = new Set(rows.flatMap(r => (r.kind === 'subject' ? [r.id] : [])))
      /** The names every line for `status` shows, and how many more those lines count, across the parts of the list. */
      const lineOf = (status: 'done' | 'dropped') => {
        const lines = rows.flatMap(r =>
          r.kind === 'fold' && new RegExp(`^(.+-)?also-${status}$`).test(r.id)
            ? [r.text.slice(NAMED_FOLD_TEXT[status].length).split(', ')]
            : [],
        )
        const hiddenOf = (parts: string[]) => Number(parts.at(-1)?.match(/^\+(\d+) more$/)?.[1] ?? 0)
        return {
          names: new Set(lines.flatMap(parts => (hiddenOf(parts) > 0 ? parts.slice(0, -1) : parts))),
          hidden: lines.reduce((n, parts) => n + hiddenOf(parts), 0),
        }
      }
      const lines = { done: lineOf('done'), dropped: lineOf('dropped') }
      const missing = shownOf(o)
        .flatMap(s => (s.status === 'done' || s.status === 'dropped' ? [{ ...s, status: s.status }] : []))
        .filter(s => look === null || s.changedAt > look)
        .filter(s => !drawn.has(s.id) && !lines[s.status].names.has(s.name))
      return (['done', 'dropped'] as const).flatMap(status => {
        const left = missing.filter(s => s.status === status)
        const counted = lines[status].hidden
        return left.length === counted
          ? []
          : [
              `${left.length} ${status === 'done' ? 'finished' : 'dropped'} unseen pieces neither drawn nor named, and the line counts ${namedFoldMore(counted)}: ${left.map(label).join(', ')}`,
            ]
      })
    },
  },
]

export const RULES: Rule[] = [...FIXED_RULES, ...GOAL_RULES, ...HOLD_RULES]
