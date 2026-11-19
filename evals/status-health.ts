import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { parseStatus } from '../hooks/status'
import type { Op, StatusAnswer } from '../hooks/status'
import { applyOps, applyStatus } from '../hooks/status-ops'
import { upgradeStatus } from '../hooks/status-upgrade'
import { isChildRunning } from '../hooks/status-children'
import { IDLE_AFTER_MS, isOpen, nameKey, clipWords, NAME_KEPT } from '../hooks/status-limits'
import { hasSameWords } from '../hooks/status-goal-ops'
import { hasRunningGoal } from '../hooks/status-suggest'
import { STATUS_RECORD_VERSION } from '../hooks/status-records'
import type { StatusRecord } from '../hooks/status-records'
import type { SessionStatus, Subject } from '../types'

const USAGE = 'Usage: scripts/status-health.sh [--sessions] <records folder>'
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { sessions: { type: 'boolean', default: false } },
})
const root = positionals[0]
if (!root || !statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(USAGE)
  process.exit(2)
}

/** One record, read and replayed through this checkout's code. */
type Replayed = {
  session: number
  record: StatusRecord
  answer: StatusAnswer | null
  base: SessionStatus | null
  after: SessionStatus | null
  now: number
  askIds: Set<string>
  readSetAt: number | null
}

/** The time the answer applied: the call's start plus the time its attempts took. */
const appliedAt = (r: StatusRecord) => r.at + r.attempts.reduce((sum, a) => sum + (a.ms ?? 0), 0)

/**
 * The recorded Status before a call, with each milestone's text as the replay of the session's previous call left it,
 * for a milestone of the same id and name. Records hold the text the recording build left, so without this a change
 * to what code does with a milestone's text would show only in the call that made it.
 */
function withCarriedText(saved: SessionStatus | null, previous: SessionStatus | null): SessionStatus | null {
  if (!saved || !previous) return saved
  const kept = new Map(previous.milestones.map(m => [m.id, m]))
  const milestones = saved.milestones.map(m => {
    const was = kept.get(m.id)
    return was && was.name === m.name ? { ...m, text: was.text } : m
  })
  return { ...saved, milestones }
}

function replay(session: number, record: StatusRecord, previous: SessionStatus | null): Replayed {
  const text = record.attempts.filter(a => a.answer).at(-1)?.answer ?? null
  const answer = text === null ? null : parseStatus(text)
  const base = withCarriedText(upgradeStatus(record.before), previous)
  const now = appliedAt(record)
  const askIds = new Set((record.input?.asks ?? []).map(i => i.id))
  const readSetAt = record.input?.last?.goal?.setAt ?? null
  const isApplied = answer !== null && record.isWritten
  const after = isApplied ? applyStatus(base, answer, now, askIds, readSetAt) : base

  return { session, record, answer, base, after, now, askIds, readSetAt }
}

function readRecords(folder: string): Replayed[] {
  const sessions = readdirSync(folder)
    .filter(n => statSync(join(folder, n)).isDirectory())
    .sort()
  return sessions.flatMap((name, session) => {
    let previous: SessionStatus | null = null
    return readdirSync(join(folder, name))
      .filter(n => n.endsWith('.jsonl'))
      .sort()
      .flatMap(file => {
        let record: StatusRecord
        try {
          record = JSON.parse(readFileSync(join(folder, name, file), 'utf8').split('\n')[0]!) as StatusRecord
        } catch {
          return []
        }
        if (record.version !== STATUS_RECORD_VERSION) return []
        const r = replay(session, record, previous)
        if (record.isWritten) previous = r.after
        return [r]
      })
  })
}

/** A count over sessions: each session's hits and chances, pooled and as the median of the sessions' shares. */
class Rate {
  readonly bySession = new Map<number, { hits: number; of: number }>()
  add(session: number, isHit: boolean): void {
    const s = this.bySession.get(session) ?? { hits: 0, of: 0 }
    s.of += 1
    if (isHit) s.hits += 1
    this.bySession.set(session, s)
  }
  get hits(): number {
    return [...this.bySession.values()].reduce((n, s) => n + s.hits, 0)
  }
  get of(): number {
    return [...this.bySession.values()].reduce((n, s) => n + s.of, 0)
  }
  text(): string {
    const shares = [...this.bySession.values()].map(s => s.hits / s.of).sort((a, b) => a - b)
    const median = shares.length === 0 ? NaN : shares[Math.floor((shares.length - 1) / 2)]!
    const pct = (x: number) => (Number.isNaN(x) ? '-' : `${(100 * x).toFixed(1)}%`)
    return `${this.hits} of ${this.of} (${pct(this.hits / this.of)}), median per session ${pct(median)} over ${shares.length} sessions`
  }
}

const findSubject = (o: SessionStatus, ref: string): Subject | null => {
  const key = nameKey(clipWords(ref, NAME_KEPT))
  return o.subjects.find(s => s.id === ref) ?? o.subjects.find(s => isOpen(s) && nameKey(s.name) === key) ?? null
}
const opsOf = (a: StatusAnswer | null): Op[] => (a?.kind === 'ops' ? a.ops : [])

/**
 * Head descriptions code dropped: an answer's HEAD line keeps the title of a head that had a description and writes
 * a new description, and the head after the answer keeps the old one.
 */
function staleHead(rs: Replayed[]): Rate {
  const rate = new Rate()
  for (const r of rs) {
    const line = opsOf(r.answer).findLast(op => op.kind === 'head')
    const last = r.base?.head
    if (!r.record.isWritten || line?.kind !== 'head' || !last?.description) continue
    if (!hasSameWords(last.title, line.title) || line.description === '') continue
    if (hasSameWords(last.description, line.description)) continue
    rate.add(r.session, r.after?.head?.description === last.description)
  }
  return rate
}

/** Open milestones with blank text, after each written answer, of all and of those with linked open work. */
function blankMilestones(rs: Replayed[]): { all: Rate; linked: Rate } {
  const all = new Rate()
  const linked = new Rate()
  for (const r of rs) {
    const o = r.after
    if (!r.record.isWritten || !o?.goal) continue
    for (const m of o.milestones.filter(isOpen)) {
      const isBlank = m.text.trim() === ''
      all.add(r.session, isBlank)
      const hasWork = o.subjects.some(s => isOpen(s) && o.serves[s.id] === m.id)
      if (hasWork) linked.add(r.session, isBlank)
    }
  }
  return { all, linked }
}

/**
 * Working subjects the call read as idle: changed `IDLE_AFTER_MS` or more before the call, with no open ask and no
 * running child holding them. Counts those the answer left untouched, and those it touched by setting them working.
 */
function idleSubjects(rs: Replayed[]): { untouched: Rate; setWorking: Rate } {
  const untouched = new Rate()
  const setWorking = new Rate()
  for (const r of rs) {
    const last = upgradeStatus(r.record.input?.last ?? null)
    const at = r.record.input?.now ?? r.record.at
    if (!last || r.answer === null) continue
    const askIds = new Set((r.record.input?.asks ?? []).map(i => i.id))
    const held = new Set(Object.entries(last.askSubjects).flatMap(([ask, ids]) => (askIds.has(ask) ? ids : [])))
    const running = new Set(last.children.filter(c => isChildRunning(c, at)).map(c => c.subjectId))
    const idle = last.subjects.filter(
      s => s.status === 'working' && at - s.changedAt >= IDLE_AFTER_MS && !held.has(s.id) && !running.has(s.id),
    )
    for (const s of idle) {
      const lines = opsOf(r.answer).filter(
        op => 'ref' in op && op.kind !== 'link' && findSubject(last, op.ref)?.id === s.id,
      )
      untouched.add(r.session, lines.length === 0)
      if (lines.length > 0)
        setWorking.add(
          r.session,
          lines.some(op => op.kind === 'set' && op.status === 'working'),
        )
    }
  }
  return { untouched, setWorking }
}

/**
 * Calls that read a met goal, or no goal, with no suggestion shown: how many answers wrote a SUGGEST line with an
 * outcome or `SUGGEST: -`, and how many left a suggestion on the page.
 */
function suggestions(rs: Replayed[], isMet: boolean): { written: Rate; shown: Rate } {
  const written = new Rate()
  const shown = new Rate()
  for (const r of rs) {
    const last = upgradeStatus(r.record.input?.last ?? null)
    if (!last || r.answer === null || !r.record.isWritten) continue
    const isCase = isMet ? last.goal !== null && last.goal.metAt !== null : last.goal === null
    if (!isCase || last.suggestedGoal !== null || hasRunningGoal(last)) continue
    written.add(
      r.session,
      opsOf(r.answer).some(op => op.kind === 'suggest'),
    )
    shown.add(r.session, (r.after?.suggestedGoal ?? null) !== null)
  }
  return { written, shown }
}

/** A Status with the look's fields cleared, as text, so two Statuses compare by what the call can change. */
const canon = (o: SessionStatus | null) =>
  JSON.stringify(o && { ...o, look: null, lastLookAt: null, missedInLastLook: null, lastCallReadAt: null })

/** For each op kind, how many lines the answers wrote and how many changed nothing when applied after the lines before them. */
function dropsByKind(rs: Replayed[]): Map<string, { written: number; dropped: number }> {
  const counts = new Map<string, { written: number; dropped: number }>()
  for (const r of rs) {
    const ops = opsOf(r.answer)
    if (!r.record.isWritten || ops.length === 0) continue
    let before = canon(applyOps(r.base, [], r.now, r.askIds, r.readSetAt))
    for (let k = 1; k <= ops.length; k++) {
      const after = canon(applyOps(r.base, ops.slice(0, k), r.now, r.askIds, r.readSetAt))
      const kind = ops[k - 1]!.kind
      const c = counts.get(kind) ?? { written: 0, dropped: 0 }
      c.written += 1
      if (after === before) c.dropped += 1
      counts.set(kind, c)
      before = after
    }
  }
  return counts
}

const records = readRecords(root)
const sessions = new Set(records.map(r => r.session)).size
const span =
  records.length === 0 ? [] : [Math.min(...records.map(r => r.record.at)), Math.max(...records.map(r => r.record.at))]
const day = (at: number) => new Date(at).toISOString().slice(0, 10)
const head = staleHead(records)
const blank = blankMilestones(records)
const idle = idleSubjects(records)
const met = suggestions(records, true)
const none = suggestions(records, false)
const drops = dropsByKind(records)

console.log(`Status health: ${records.length} records in ${sessions} sessions, ${span.map(day).join(' to ')}`)
console.log(`Answers replayed through this checkout's parseStatus and applyStatus.`)
console.log('')
console.log(`Head descriptions dropped: ${head.text()}`)
console.log(`Open milestones with blank text: ${blank.all.text()}`)
console.log(`  with linked open work: ${blank.linked.text()}`)
console.log(`Idle working subjects left untouched: ${idle.untouched.text()}`)
console.log(`  touched ones set working again: ${idle.setWorking.text()}`)
console.log(`Goal met, no suggestion: answers with SUGGEST ${met.written.text()}`)
console.log(`  suggestion shown after: ${met.shown.text()}`)
console.log(`No goal, no suggestion: answers with SUGGEST ${none.written.text()}`)
console.log(`  suggestion shown after: ${none.shown.text()}`)
console.log('')
console.log('Lines code dropped, by kind:')
for (const [kind, c] of [...drops].sort((a, b) => b[1].written - a[1].written))
  console.log(
    `  ${kind.padEnd(10)} ${String(c.dropped).padStart(6)} of ${String(c.written).padStart(6)} (${((100 * c.dropped) / c.written).toFixed(1)}%)`,
  )

if (values.sessions) {
  console.log('')
  console.log('By session (numbered by folder order): head drops, blank milestones, idle untouched')
  const ids = [...new Set(records.map(r => r.session))]
  const cell = (rate: Rate, s: number) => {
    const x = rate.bySession.get(s)
    return x ? `${x.hits}/${x.of}` : '-'
  }
  for (const s of ids)
    console.log(
      `  ${String(s).padStart(4)}  ${cell(head, s).padEnd(8)} ${cell(blank.all, s).padEnd(8)} ${cell(idle.untouched, s)}`,
    )
}
