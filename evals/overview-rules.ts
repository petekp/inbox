import { isOpen, NAME_WORDS } from '../hooks/overview'
import type { Overview, Subject } from '../types'
import { isOpenPiece, rightStatuses } from './overview-facts'
import type { Facts, Piece } from './overview-facts'
import { startSession } from './overview-replay'
import type { Replay, Step, StepResult } from './overview-replay'

/** What a rule reads: the step, the state it left, and the state before it. */
export type RuleContext = {
  step: Step
  result: StepResult
  before: { overview: Overview | null; facts: Facts }
}

export type Rule = {
  id: string
  property: number
  /** What the rule checks, as the spec says it. */
  text: string
  /** The decision or issue the rule waits on. Until it is built, the rule is expected to fail and blocks nothing. */
  until?: string
  failures(ctx: RuleContext): string[]
}

export type RuleResult = { rule: string; property: number; failures: string[]; until: string | null }

/** A word that names a time, which code writes and the model never does. */
export const TIME_WORDS =
  /\b(today|yesterday|tonight|tomorrow|this (morning|afternoon|evening|week)|last night|ago|just now|earlier today|\d+\s*(m|h|d|min|mins|minutes?|hours?|days?))\b/i

/** What an event list is made of: a command, a path, a commit, a ticket, a count of things run, or a process step. */
export const EVENT_PATTERNS: RegExp[] = [
  /`/,
  /\b[\w-]+\.(?:ts|tsx|js|jsx|json|md|mjs|swift|py|rs|go|sh|css|html)\b/i,
  /\b[0-9a-f]{7,40}\b/,
  /(?:^|\s)#\d+\b|\b[A-Z]{2,}-\d+\b/,
  /\b\d+\s+(?:[\p{L}-]+\s+){0,2}(?:tests?|files?|commits?|lines?|calls?|ms|seconds?|minutes?|checks?)\b/iu,
  /\bcommit(?:s|ted|ting)?\b/i,
  /^(?:ran|run|edited|editing|opened|searched|grepped|installed|executed|called)\b/i,
  /\b(?:tests? (?:ran|run|pass(?:ing|es)?)|tool call|npm |git )\b/i,
  /\b(?:pushed|merged|tested|rebuilt|restarted)\b/i,
  /\b(?:running|in progress)\b|(?<!\bnot )\bstarted\b/i,
]

const STATUS_WORDS = /\b(ready|merged|passes|passing|waiting|shipped|published|done|blocked)\b/i
const OVER_WORDS = /\b(published|merged|shipped|released|done)\b/i
const DECISION_WORDS = /\b(needs? your|your (call|decision|answer|input)|decide|waiting on you|awaiting)\b/i
const NUMBERED = /#\d+\b/g

const shownOf = (o: Overview | null) => (o?.subjects ?? []).filter(s => s.into === null)

const subjectsFor = (p: Pick<Piece, 'match'>, o: Overview | null) =>
  shownOf(o).filter(s => new RegExp(p.match, 'i').test(s.name))

const label = (s: Subject) => `"${s.name}: ${s.text}"`

const SMALL_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'its'])

/** The words that tell two names apart: words of three letters or more but a few small ones, and every word with a number. */
function keyWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}.#]+/gu) ?? []

  return new Set(words.filter(w => (w.length >= 3 && !SMALL_WORDS.has(w)) || /\d/.test(w)))
}

const WORD = /[\p{L}\p{N}]+/gu
const restateWords = (text: string) => new Set((text.toLowerCase().match(WORD) ?? []).filter(w => w.length > 3))

/** Whether `text` has most of the key words of `other`, as a restatement does. */
export function restatesText(text: string, other: string): boolean {
  const mine = restateWords(text)
  const theirs = [...restateWords(other)]

  return theirs.length >= 3 && theirs.filter(w => mine.has(w)).length / theirs.length >= 0.7
}

function modelTexts(o: Overview | null): string[] {
  return [o?.goal ?? '', ...shownOf(o).flatMap(s => [s.name, s.text, s.was ?? ''])].filter(Boolean)
}

/** Whether a running child's label reads as words, not as a handle. */
function isPlainLabel(name: string, ref: string): boolean {
  const handle = ref.replace(/^herdr:/, '')
  const words = name.trim().split(/\s+/)

  return name !== handle && !/\w[-_]\w/.test(name) && words.length >= 2
}

export const RULES: Rule[] = [
  {
    id: 'no-time-words',
    property: 13,
    text: 'No text the model writes holds a time word: the head, a name, where it stands, or a was line.',
    failures: ({ result }) =>
      modelTexts(result.session.ledger.overview)
        .filter(t => TIME_WORDS.test(t))
        .map(t => `time word: "${t}"`),
  },
  {
    id: 'short-names',
    property: 3,
    text: 'A name has at most 3 words, no "…" and no question mark.',
    failures: ({ result }) =>
      shownOf(result.session.ledger.overview)
        .filter(s => s.name.trim().split(/\s+/).length > NAME_WORDS || /…|\?/.test(s.name))
        .map(s => `name: "${s.name}"`),
  },
  {
    id: 'text-is-state',
    property: 6,
    text: 'A text names no command, file, hash, ticket or PR number, count, or process step.',
    failures: ({ result }) =>
      shownOf(result.session.ledger.overview)
        .filter(s => EVENT_PATTERNS.some(re => re.test(s.text)))
        .map(s => `event text: ${label(s)}`),
  },
  {
    id: 'head-no-status',
    property: 1,
    text: 'The head holds no status word.',
    failures: ({ result }) => {
      const goal = result.session.ledger.overview?.goal ?? ''
      return STATUS_WORDS.test(goal) ? [`status word in the head: "${goal}"`] : []
    },
  },
  {
    id: 'head-follows',
    property: 1,
    text: 'The head names the focus in the facts. It changes where the focus moved, and holds where it did not.',
    failures: ({ result, before }) => {
      const goal = result.session.ledger.overview?.goal ?? ''
      const last = before.overview?.goal ?? ''
      const isFocusSame = result.facts.focusMatch === before.facts.focusMatch
      if (!new RegExp(result.facts.focusMatch, 'i').test(goal))
        return [`the head "${goal}" is not about /${result.facts.focusMatch}/`]
      return isFocusSame && last !== '' && goal !== last ? [`the head moved from "${last}" to "${goal}"`] : []
    },
  },
  {
    id: 'no-duplicates',
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
    property: 5,
    text: "No open subject's text says the work is over.",
    failures: ({ result }) =>
      shownOf(result.session.ledger.overview)
        .filter(s => isOpen(s) && OVER_WORDS.test(s.text))
        .map(s => `open, yet over: ${label(s)}`),
  },
  {
    id: 'open-pieces-kept',
    property: 5,
    text: 'Every open piece in the facts is an open subject, drawn as a row or in the queued fold.',
    failures: ({ result }) =>
      result.facts.pieces
        .filter(isOpenPiece)
        .filter(p => !subjectsFor(p, result.session.ledger.overview).some(isOpen))
        .map(p => `no open subject for ${p.names[0]}`),
  },
  {
    id: 'marks-true',
    property: 5,
    text: "Each piece's subject has a status its state allows.",
    failures: ({ result }) =>
      result.facts.pieces.flatMap(p =>
        subjectsFor(p, result.session.ledger.overview)
          .filter(s => !rightStatuses(p).includes(s.status))
          .map(s => `${label(s)} is ${s.status}, and ${p.names[0]} is ${p.state}`),
      ),
  },
  {
    id: 'not-work',
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
    property: 12,
    text: 'No was line ends cut with "…".',
    failures: ({ result }) =>
      shownOf(result.session.ledger.overview)
        .filter(s => s.was?.includes('…'))
        .map(s => `cut was line: "${s.was}"`),
  },
  {
    id: 'failure-shown',
    property: 13,
    text: 'While the last Overview call wrote nothing, the status line says so.',
    failures: ({ result }) =>
      result.isOverviewFailed && result.page.error === null ? ['the call failed, and the page does not say so'] : [],
  },
  {
    id: 'head-title',
    property: 1,
    text: 'The head is a title and a one-line description that does not repeat it.',
    until: '#148',
    failures: ({ result }) => {
      const head = result.page as unknown as { title?: unknown; description?: unknown }
      const isHead = typeof head.title === 'string' && typeof head.description === 'string'
      return isHead && head.title !== head.description ? [] : ['the head is one goal line']
    },
  },
  {
    id: 'no-live-line',
    property: 13,
    text: 'The page has no live line.',
    until: '#148',
    failures: ({ result }) => (result.page.live ? [`live line: "${result.page.live}"`] : []),
  },
  {
    id: 'stall-times',
    property: 13,
    text: 'A time shows only as a stall time, on held or waiting work that has waited 15 minutes, or a quiet child.',
    until: '#150',
    failures: ({ result }) =>
      result.page.rows.flatMap(r => {
        if (r.kind !== 'subject' && r.kind !== 'fold') return []
        const age = (r as { age?: string | null }).age
        const isStallTime = age !== undefined && age !== null && /^waiting\b/.test(age)
        return age && !isStallTime ? [`an age on a row: "${'name' in r ? r.name : r.text}  ${age}"`] : []
      }),
  },
  {
    id: 'filed-mark',
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

/** Runs every rule on one step. */
export function gradeStep(ctx: RuleContext): RuleResult[] {
  return RULES.map(r => ({ rule: r.id, property: r.property, failures: r.failures(ctx), until: r.until ?? null }))
}

/** Runs every rule on each step of a replay's run, each step against the state the step before left. */
export function gradeReplay(replay: Replay, steps: StepResult[]): RuleResult[][] {
  const start = { overview: startSession(replay).ledger.overview, facts: { ...replay.start.facts, changed: [] } }

  return steps.map((result, n) => {
    const prev = steps[n - 1]
    const before = prev ? { overview: prev.session.ledger.overview, facts: prev.facts } : start
    return gradeStep({ step: replay.steps[n]!, result, before })
  })
}

/** The failures that count against a run: every rule's but those that wait on a change not built yet. */
export function blockingFailures(results: RuleResult[]): RuleResult[] {
  return results.filter(r => r.until === null && r.failures.length > 0)
}
