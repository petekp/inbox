import { isOpen, NAME_WORDS } from '../hooks/status-limits'
import type { SessionStatus, Subject } from '../types'
import { isOpenPiece, rightStatuses } from './status-facts'
import type { Facts } from './status-facts'
import type { Step, StepResult } from './status-replay'
import {
  DECISION_WORDS,
  EVENT_PATTERNS,
  NUMBERED,
  OVER_WORDS,
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
  until: string | null
}

export const RULES: Rule[] = [
  {
    id: 'no-time-words',
    reads: 'answer',
    property: 13,
    text: 'No text the model writes holds a time word: the head, a name, where it stands, or a was line.',
    failures: ({ result }) =>
      modelTexts(result.session.ledger.overview)
        .filter(t => TIME_WORDS.test(t))
        .map(t => `time word: "${t}"`),
  },
  {
    id: 'short-names',
    reads: 'answer',
    property: 3,
    text: 'A name has at most 3 words, no "…" and no question mark.',
    failures: ({ result }) =>
      shownOf(result.session.ledger.overview)
        .filter(s => s.name.trim().split(/\s+/).length > NAME_WORDS || /…|\?/.test(s.name))
        .map(s => `name: "${s.name}"`),
  },
  {
    id: 'text-is-state',
    reads: 'answer',
    property: 6,
    text: 'A text names no command, file, hash, ticket or PR number, count, or process step.',
    failures: ({ result }) =>
      shownOf(result.session.ledger.overview)
        .filter(s => EVENT_PATTERNS.some(re => re.test(s.text)))
        .map(s => `event text: ${label(s)}`),
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
      if (pastMatch && now && new RegExp(pastMatch, 'i').test(now.title))
        return [`the head's title "${now.title}" still names /${pastMatch}/`]
      return isFocusSame && last !== '' && head !== last && !isDescriptionFilled
        ? [`the head moved from "${last}" to "${head}"`]
        : []
    },
  },
  {
    id: 'no-duplicates',
    reads: 'answer',
    property: 4,
    text: 'No two open subjects share every key word of a name, numbers included, or the same issue or PR number.',
    failures: ({ result }) => {
      const open = shownOf(result.session.ledger.overview).filter(isOpen)
      return open.flatMap((a, i) =>
        open.slice(i + 1).flatMap(b => {
          const [x, y] = [keyWords(a.name), keyWords(b.name)].sort((p, q) => p.size - q.size)
          const isSameName = x!.size > 0 && [...x!].every(w => y!.has(w))
          const numbers = (s: Subject): string[] => s.text.match(NUMBERED) ?? []
          const shared = numbers(a).filter(n => numbers(b).includes(n))
          return isSameName || shared.length > 0 ? [`${label(a)} and ${label(b)}`] : []
        }),
      )
    },
  },
  {
    id: 'piece-once',
    reads: 'facts',
    property: 4,
    text: 'No piece in the facts has two open subjects.',
    failures: ({ result }) =>
      result.facts.pieces.flatMap(p => {
        const open = subjectsFor(p, result.session.ledger.overview).filter(isOpen)
        return open.length > 1 ? [`${p.names[0]} shows as ${open.map(label).join(' and ')}`] : []
      }),
  },
  {
    id: 'open-not-over',
    reads: 'answer',
    property: 5,
    text: "No open subject's text says the work is over.",
    failures: ({ result }) =>
      shownOf(result.session.ledger.overview)
        .filter(s => isOpen(s) && OVER_WORDS.test(s.text))
        .map(s => `open, yet over: ${label(s)}`),
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
    text: "Each piece's subject has a status its state allows. Filed work closed as done is left to filed-mark.",
    failures: ({ result }) =>
      result.facts.pieces.flatMap(p =>
        subjectsFor(p, result.session.ledger.overview)
          .filter(s => !rightStatuses(p).includes(s.status))
          .filter(s => !(p.state === 'filed' && s.status === 'done'))
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
    text: "A held subject's text names no decision.",
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      const held = new Set(result.session.ledger.items.flatMap(i => o?.askSubjects[i.id] ?? []))
      return shownOf(o)
        .filter(s => held.has(s.id) && DECISION_WORDS.test(s.text))
        .map(s => `held, and names the decision: ${label(s)}`)
    },
  },
  {
    id: 'asks-linked',
    reads: 'facts',
    property: 8,
    text: 'Each open ask is linked to a subject it holds up, and an ask that holds up nothing is linked to none.',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      return result.facts.asks.flatMap(a => {
        const item = result.session.ledger.items.find(i => new RegExp(a.match, 'i').test(i.ask))
        if (!item) return [`no open ask like /${a.match}/`]
        const linked = shownOf(o).find(s => s.id === o?.askSubjects[item.id])
        const pieces = result.facts.pieces.filter(p => a.holdsUp.includes(p.id))
        if (pieces.length === 0)
          return linked ? [`"${item.ask}" holds up nothing, and is linked to ${label(linked)}`] : []
        if (!linked) return [`"${item.ask}" is linked to no subject`]
        return pieces.some(p => new RegExp(p.match, 'i').test(linked.name))
          ? []
          : [`"${item.ask}" is linked to ${label(linked)}, not ${pieces.map(p => p.names[0]).join(' or ')}`]
      })
    },
  },
  {
    id: 'ask-holds-several',
    reads: 'facts',
    property: 8,
    text: 'An ask that holds up several pieces marks each of them.',
    until: '#140',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      return result.facts.asks
        .filter(a => a.holdsUp.length > 1)
        .flatMap(a => {
          const item = result.session.ledger.items.find(i => new RegExp(a.match, 'i').test(i.ask))
          const linked = item ? [o?.askSubjects[item.id]].flat() : []
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
    text: 'On a step that changed no work, no subject is added, and no last-changed time moves.',
    failures: ({ step, result, before }) => {
      if (!step.call || result.facts.changed.length > 0) return []
      const was = new Map(shownOf(before.overview).map(s => [s.id, s]))
      return shownOf(result.session.ledger.overview).flatMap(s => {
        const old = was.get(s.id)
        if (!old) return [`added ${label(s)}`]
        return old.changedAt === s.changedAt ? [] : [`moved ${label(s)}`]
      })
    },
  },
  {
    id: 'changes-move',
    reads: 'facts',
    property: 10,
    text: "On a step that changed work, each changed piece's last-changed time moves.",
    failures: ({ step, result }) => {
      if (!step.call) return []
      return result.facts.changed.flatMap(id => {
        const piece = result.facts.pieces.find(p => p.id === id)!
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
    id: 'filed-mark',
    reads: 'facts',
    property: 5,
    text: 'Work filed for later closes with its own mark, not ✓.',
    until: '#137',
    failures: ({ result }) =>
      result.facts.pieces
        .filter(p => p.state === 'filed')
        .flatMap(p => subjectsFor(p, result.session.ledger.overview))
        .filter(s => s.status === 'done' || s.status === 'dropped')
        .map(s => `filed work closed as ${s.status}: ${label(s)}`),
  },
  {
    id: 'finished-named',
    reads: 'facts',
    property: 10,
    text: 'Every piece that finished since the last look is drawn as a row.',
    until: '#138',
    failures: ({ result }) => {
      const o = result.session.ledger.overview
      const look = o?.lastLookAt ?? null
      const drawn = new Set(result.page.rows.flatMap(r => (r.kind === 'subject' ? [r.id] : [])))
      return shownOf(o)
        .filter(s => !isOpen(s) && s.status === 'done' && (look === null || s.changedAt > look) && !drawn.has(s.id))
        .map(s => `finished, unseen and folded: ${label(s)}`)
    },
  },
]
