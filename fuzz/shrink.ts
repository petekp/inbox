import type { Case, Ev } from './case'

type Fails = (c: Case) => Promise<boolean>

/** Each case with one chunk of `list` left out, largest chunks first. */
export function* without<T>(list: T[]): Generator<T[]> {
  for (let size = Math.max(1, Math.floor(list.length / 2)); size >= 1; size = Math.floor(size / 2)) {
    for (let from = 0; from < list.length; from += size) yield [...list.slice(0, from), ...list.slice(from + size)]
    if (size === 1) break
  }
}

const shorter = (t: string): string[] =>
  t.length === 0
    ? []
    : [...new Set(['', [...t].slice(0, 1).join(''), [...t].slice(0, Math.ceil([...t].length / 2)).join('')])].filter(
        s => s !== t,
      )

function simplerEvents(e: Ev): Ev[] {
  if (e.is === 'wait')
    return [...new Set([0, 16, 100, Math.round(e.ms / 2), Math.round(e.ms / 100) * 100])]
      .filter(ms => ms < e.ms)
      .map(ms => ({ ...e, ms }))
  if (e.is === 'type') return shorter(e.text).map(text => ({ ...e, text }))
  if (e.is === 'status') return [...without(e.lines)].filter(l => l.length > 0).map(lines => ({ ...e, lines }))
  if (e.is === 'record') {
    const strings = Object.entries(e.args).filter((x): x is [string, string] => typeof x[1] === 'string')
    const lists = Object.entries(e.args).filter((x): x is [string, unknown[]] => Array.isArray(x[1]) && x[1].length > 0)
    return [
      ...strings.flatMap(([k, v]) => shorter(v).map(s => ({ ...e, args: { ...e.args, [k]: s } }))),
      ...lists.flatMap(([k, v]) => [...without(v)].map(l => ({ ...e, args: { ...e.args, [k]: l } }))),
    ]
  }
  return []
}

/** Smaller sessions: the same with one list of rows, findings, closed rows or PRs cut down. */
function* simplerSessions(c: Case): Generator<Case> {
  const s = c.session
  for (const items of without(s.ledger.items)) yield { ...c, session: { ...s, ledger: { ...s.ledger, items } } }
  for (const findings of without(s.ledger.findings))
    yield { ...c, session: { ...s, ledger: { ...s.ledger, findings } } }
  for (const closed of without(s.ledger.closed)) yield { ...c, session: { ...s, ledger: { ...s.ledger, closed } } }
  const views = Object.entries(s.prViews.views)
  for (const kept of without(views))
    yield { ...c, session: { ...s, prViews: { ...s.prViews, views: Object.fromEntries(kept) } } }
}

function* candidates(c: Case): Generator<Case> {
  for (const events of without(c.events)) yield { ...c, events }
  yield* simplerSessions(c)
  for (const [i, e] of c.events.entries())
    for (const simpler of simplerEvents(e)) yield { ...c, events: c.events.map((x, j) => (j === i ? simpler : x)) }
  if (c.width !== 80) yield { ...c, width: 80 }
}

/** The smallest case found that still fails, trying one smaller case at a time until none fails or `budget` runs out. */
export async function shrink(c: Case, fails: Fails, budget = 200): Promise<{ shrunk: Case; tries: number }> {
  let best = c
  let tries = 0
  for (let isSmaller = true; isSmaller && tries < budget;) {
    isSmaller = false
    for (const next of candidates(best)) {
      if (++tries > budget) break
      if (await fails(next)) {
        best = next
        isSmaller = true
        break
      }
    }
  }

  return { shrunk: best, tries }
}
