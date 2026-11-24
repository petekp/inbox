import { demoSession } from '../core/view/demo'
import { emptySession } from '../core/view/session-files'
import type { Session } from '../types'
import type { Case, Ev, Look } from './case'
import { outcomesOf } from './host'
import type { Rng } from './rng'
import { text } from './texts'

export const START = Date.UTC(2026, 10, 10, 12)

const KEYS = ['j', 'k', 'enter', 'left', 'right', 'up', 'down', 'tab', 'u', 'z', 'w', '?', 'escape', 'backspace']
const LETTERS = [...'abcdefghilmnorsxy123']
const NAMES = ['Sync retries', 'Settings page', 'Release notes', 'Flaky test']
const OPEN = ['working', 'queued', 'waits-on-other']

function words(rng: Rng, n: number): string[] {
  return Array.from({ length: n }, () => text(rng))
}

/** Replaces the texts a row shows with texts from the corpus, leaving the fields other fields point at. */
function withTexts(s: Session, rng: Rng, share: number): Session {
  const swap = (t: string) => (rng.chance(share) ? text(rng, 0.2) : t)
  const items = s.ledger.items.map(i => ({
    ...i,
    ask: swap(i.ask),
    ...('context' in i && typeof i.context === 'string' ? { context: swap(i.context) } : {}),
  }))
  const findings = s.ledger.findings.map(f => ({ ...f, title: swap(f.title), detail: swap(f.detail) }))
  const views = Object.fromEntries(
    Object.entries(s.prViews.views).map(([ref, v]) => [ref, { ...v, title: swap(v.title) }]),
  )

  return { ...s, ledger: { ...s.ledger, items, findings }, prViews: { ...s.prViews, views } }
}

function keptSome<T>(rng: Rng, list: T[]): T[] {
  const mode = rng.int(0, 3)
  if (mode === 0) return list
  if (mode === 1) return []
  return list.filter(() => rng.chance(0.5))
}

function startSession(rng: Rng): Session {
  if (rng.chance(0.25)) return emptySession()
  const demo = demoSession(START, 'Claude')
  const ledger = {
    ...demo.ledger,
    items: keptSome(rng, demo.ledger.items),
    findings: keptSome(rng, demo.ledger.findings),
  }

  return withTexts({ ...demo, ledger }, rng, rng.pick([0, 0.3, 1]))
}

export function recordArgs(rng: Rng): Record<string, unknown> {
  const kind = rng.pick(['question', 'question', 'task', 'finding'] as const)
  if (kind === 'finding')
    return {
      kind,
      finding_kind: rng.pick(['issue', 'opportunity']),
      title: text(rng),
      detail: text(rng),
      ...(rng.chance(0.3) ? { path: '/repo/src/a.ts' } : {}),
    }
  const steps = rng.chance(0.4)
    ? rng.pick([
        ['npm test'],
        ['https://example.com/a', '/repo/README.md'],
        ['/repo/x', 'git push', 'https://example.com'],
      ])
    : []
  if (kind === 'task') return { kind, ask: text(rng), ...(steps.length ? { steps } : {}) }
  const options = words(rng, rng.pick([0, 1, 2, 3, 5, 12]))
  const rec = options.length > 0 && rng.chance(0.6) ? rng.pick(options) : undefined

  return {
    kind,
    ask: text(rng),
    options,
    ...(rec === undefined ? {} : { rec, why: text(rng) }),
    ...(rng.chance(0.5) ? { context: text(rng) } : {}),
    ...(rng.chance(0.3) ? { option_notes: options.map(() => text(rng)) } : {}),
    ...(steps.length ? { steps } : {}),
    ...(rng.chance(0.15) ? { design_choice: true } : {}),
  }
}

function statusLines(rng: Rng): string[] {
  const name = () => (rng.chance(0.8) ? rng.pick(NAMES) : text(rng))
  const line = () =>
    rng.pick([
      () => `NEW: ${rng.pick(OPEN)} | ${name()} | ${text(rng)}`,
      () => `SET: ${name()} | ${rng.pick(OPEN)} | ${text(rng)}`,
      () => `DONE: ${name()} | ${text(rng)}`,
      () => `DROP: ${name()} | ${text(rng)}`,
      () => `GOAL: ${text(rng)} | ${rng.pick(['done', 'working'])} ${name()}: ${text(rng)}; queued ${name()}`,
      () => `MILESTONE: ${rng.pick(['done', 'working', 'queued'])} | ${name()} | ${text(rng)}`,
      () => `HEAD: ${text(rng)} | ${text(rng)}`,
      () => 'NO CHANGE',
    ])()

  return Array.from({ length: rng.int(1, 5) }, line)
}

function waitMs(rng: Rng): number {
  const r = rng.next()
  if (r < 0.45) return rng.int(16, 200)
  if (r < 0.85) return rng.int(200, 1500)
  return rng.int(2000, 12000)
}

function eventOf(rng: Rng, look: Look): Ev {
  const r = rng.next()
  if (r < 0.3) return { is: 'wait', ms: waitMs(rng) }
  if (r < 0.5) return rng.chance(0.6) ? { is: 'key', key: rng.pick(KEYS) } : { is: 'key', key: rng.pick(LETTERS) }
  if (r < 0.68 && look === 'herdr')
    return { is: 'click', on: rng.pick(['row', 'button', 'button', 'tab'] as const), n: rng.int(0, 7) }
  if (r < 0.72) return { is: 'type', text: text(rng) }
  if (r < 0.8) return { is: 'record', args: recordArgs(rng) }
  if (r < 0.85)
    return rng.chance(0.5)
      ? { is: 'close', n: rng.int(0, 9), answer: text(rng) }
      : { is: 'close', n: rng.int(0, 9), reason: text(rng) }
  if (r < 0.89) return { is: 'status', lines: statusLines(rng) }
  if (r < 0.93) return { is: 'turn', to: rng.pick(['start', 'end'] as const) }
  if (r < 0.96)
    return {
      is: 'prs',
      n: rng.int(0, 5),
      change: rng.pick(['clean', 'conflict', 'merged', 'closed', 'threads-done', 'checks-pass'] as const),
    }
  if (r < 0.98)
    return {
      is: 'order',
      picks: Array.from({ length: rng.int(0, 4) }, () => rng.int(0, 5)),
      label: text(rng),
      why: text(rng),
    }
  if (r < 0.99 && look === 'herdr') return { is: 'end' }

  return { is: 'wait', ms: waitMs(rng) }
}

export function caseOf(rng: Rng, look: Look): Case {
  const events = Array.from({ length: rng.int(4, 40) }, () => eventOf(rng, look))

  return {
    look,
    session: startSession(rng),
    outcomes: outcomesOf(rng),
    takeAfterMs: rng.chance(0.1) ? null : rng.pick([20, 80, 200, 600, 2000]),
    width: rng.pick([10, 24, 40, 60, 80, 100, 140, 220, rng.int(10, 220)]),
    events,
  }
}
