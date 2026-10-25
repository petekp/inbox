// Finds the inbox question that copies an agent's dialog question.

import type { DialogQuestion, Item, Ledger } from '../types'
import { restates } from './ledger'
import { RECOMMENDED_SUFFIX } from './model-text'

type AskedQuestion = Pick<DialogQuestion, 'question' | 'options'>

function optionKey(option: string): string {
  return option.replace(RECOMMENDED_SUFFIX, '').trim().toLowerCase()
}

function optionsKey(options: string[]): string {
  return options.map(optionKey).sort().join('\n')
}

function hasSameOptions(item: Item, q: AskedQuestion): boolean {
  return item.options.length > 0 && optionsKey(item.options) === optionsKey(q.options)
}

/**
 * The item that copies `q`, when exactly one does. Options alone pick it only when no other item of `items` has those
 * options and no other question of `questions` has the item's. Otherwise the item's ask must restate `q`'s title, and
 * no other question's title.
 */
export function copyOf(q: AskedQuestion, items: Item[], questions: AskedQuestion[]): Item | null {
  const byOptions = items.filter(i => hasSameOptions(i, q))
  const [only] = byOptions
  if (only && byOptions.length === 1 && questions.filter(o => hasSameOptions(only, o)).length === 1) return only
  const pool = byOptions.length > 0 ? byOptions : items
  const byAsk = pool.filter(i => restates(i.ask, q.question))
  const [asked] = byAsk
  if (!asked || byAsk.length !== 1) return null
  const restated = questions.filter(o => restates(asked.ask, o.question))

  return restated.length === 1 ? asked : null
}

/**
 * Gives each question the update added in `turn` the option descriptions of the dismissed dialog question it copies.
 * An item copies a question only when `copyOf` finds it among all the turn's questions, and only options with the same
 * label get a description.
 */
export function withOptionDescriptions(
  before: Ledger,
  after: Ledger,
  turn: number,
  dismissed: DialogQuestion[],
): Ledger {
  const described = dismissed.filter(q => Object.keys(q.descriptions).length > 0)
  if (described.length === 0) return after
  const added = new Set(after.items.map(i => i.id).filter(id => !before.items.some(i => i.id === id)))
  const turnQuestions = after.items.filter(i => i.kind === 'question' && i.turn === turn)
  const descriptionsById = new Map<string, Record<string, string>>()
  for (const q of described) {
    const copy = copyOf(q, turnQuestions, dismissed)
    if (!copy || !added.has(copy.id)) continue
    const byKey = new Map(Object.entries(q.descriptions).map(([label, text]) => [optionKey(label), text]))
    const descriptions = Object.fromEntries(
      copy.options.flatMap(o => {
        const text = byKey.get(optionKey(o))
        return text === undefined ? [] : [[o, text]]
      }),
    )
    if (Object.keys(descriptions).length > 0) descriptionsById.set(copy.id, descriptions)
  }
  if (descriptionsById.size === 0) return after

  return {
    ...after,
    items: after.items.map(i => {
      const descriptions = descriptionsById.get(i.id)
      return descriptions ? { ...i, optionDescriptions: descriptions } : i
    }),
  }
}
