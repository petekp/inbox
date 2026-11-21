import type { Update } from '../core/domain/reply-parse'
import type { Ledger } from '../types'

/** Patterns are case-insensitive regular expressions. */
export type Check =
  | { open: string }
  | { closed: string; outcome?: string }
  | { added: number }
  | {
      new: string
      kind?: 'question' | 'task'
      rec?: string | null
      help?: string
      design?: boolean
      /** A pattern that no option or rec of any new item like `new` may match. */
      noOption?: string
    }
  | { notNew: string }
  | { noHelp: string }
  | { item: string; rec?: string; options?: string }
  | { waiting: string; options?: string; rec?: string }
  | { openItems: number }
  /** NEW lines the code dropped as repeats, which the other checks cannot see. */
  | { dropped: number }

/** Pairs each check with its own item, so one item cannot pass two checks, by augmenting paths. */
function matchEach<C, I>(checks: C[], items: I[], fits: (c: C, i: I) => boolean): Map<C, I> {
  const owner = new Map<I, C>()
  const claim = (c: C, seen: Set<I>): boolean =>
    items.some(i => {
      if (seen.has(i) || !fits(c, i)) return false
      seen.add(i)
      const held = owner.get(i)
      if (held !== undefined && !claim(held, seen)) return false
      owner.set(i, c)

      return true
    })
  for (const c of checks) claim(c, new Set())

  return new Map([...owner].map(([i, c]) => [c, i]))
}

export function failures(before: Ledger, after: Ledger, checks: Check[], masked: string[]): string[] {
  const has = (pattern: string, text: string | null) => text !== null && new RegExp(pattern, 'i').test(text)
  const added = after.items.filter(i => !before.items.some(b => b.id === i.id))
  const isOpen = (id: string) => after.items.some(i => i.id === id) || after.findings.some(f => f.id === id)
  const closedOutcome = (id: string) =>
    after.closed.find(c => c.id === id)?.outcome ?? after.closedFindings.find(f => f.id === id)?.outcome ?? null
  const newChecks = checks.filter((c): c is Extract<Check, { new: string }> => 'new' in c)
  const newMatches = matchEach(
    newChecks,
    added,
    (c, i) =>
      has(c.new, i.ask) &&
      (!c.kind || i.kind === c.kind) &&
      (c.rec === undefined || (c.rec === null ? i.rec === null : has(c.rec, i.rec))) &&
      (!c.help || i.helps.some(h => h.kind === c.help)) &&
      (c.design === undefined || (i.isDesignChoice === true) === c.design),
  )
  const out: string[] = []
  for (const c of checks) {
    if ('open' in c && !isOpen(c.open)) out.push(`${c.open} closed`)
    else if ('closed' in c) {
      const outcome = closedOutcome(c.closed)
      if (outcome === null) out.push(`${c.closed} still open`)
      else if (c.outcome && !has(c.outcome, outcome)) out.push(`${c.closed} closed as "${outcome}"`)
    } else if ('added' in c && added.length !== c.added) out.push(`${added.length} items added`)
    else if ('new' in c) {
      const match = newMatches.get(c)
      if (!match)
        out.push(
          `no new item like /${c.new}/: ${added.map(i => `"${i.ask}" kind=${i.kind} options=${i.options.join(' / ')} rec=${i.rec} design=${i.isDesignChoice === true} helps=${i.helps.map(h => h.kind).join('+') || '-'}`).join(', ')}`,
        )
      const { noOption } = c
      const withBadAnswer = noOption
        ? added.filter(i => has(c.new, i.ask) && [...i.options, i.rec].some(o => has(noOption, o)))
        : []
      for (const i of withBadAnswer)
        out.push(`new item "${i.ask}" has an answer like /${noOption}/: options=${i.options.join(' / ')} rec=${i.rec}`)
    } else if ('notNew' in c && added.some(i => has(c.notNew, i.ask))) out.push(`added an item like /${c.notNew}/`)
    else if ('noHelp' in c && added.some(i => i.helps.some(h => h.kind === c.noHelp))) out.push(`a ${c.noHelp} step`)
    else if ('waiting' in c) {
      const match = after.items.find(
        i =>
          has(c.waiting, i.ask) &&
          (!c.options || has(c.options, i.options.join(' / '))) &&
          (!c.rec || has(c.rec, i.rec)),
      )
      if (!match)
        out.push(
          `no open item like /${c.waiting}/: ${after.items.map(i => `"${i.ask}" options=${i.options.join(' / ')} rec=${i.rec}`).join(', ')}`,
        )
    } else if ('dropped' in c && masked.length !== c.dropped)
      out.push(`the code dropped ${masked.length} NEW lines: ${masked.map(a => `"${a}"`).join(', ')}`)
    else if ('openItems' in c && after.items.length !== c.openItems)
      out.push(`${after.items.length} open items: ${after.items.map(i => `"${i.ask}"`).join(', ')}`)
    else if ('item' in c) {
      const item = after.items.find(i => i.id === c.item)
      if (!item) out.push(`${c.item} closed`)
      else if (c.rec && !has(c.rec, item.rec)) out.push(`${c.item} rec=${item.rec}`)
      else if (c.options && !has(c.options, item.options.join(' / ')))
        out.push(`${c.item} options ${item.options.join(' / ')}`)
    }
  }

  return out
}

export function maskedAsks(update: Update, before: Ledger, after: Ledger): string[] {
  const made = new Set(after.items.filter(i => !before.items.some(b => b.id === i.id)).map(i => i.ask))

  return update.added.map(a => a.ask).filter(ask => !made.has(ask))
}
