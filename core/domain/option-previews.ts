// The previews of a question's options, from the record tool's `previews`, and the page that shows them side by side.

import type { Help, Item } from '../../types'
import type { Effect } from '../view/press-reducer'

export const OPEN_PREVIEWS_LABEL = 'Open previews'

/** A preview the page can show: an absolute file path or an https link. */
function previewTarget(text: string): string | null {
  return /^\/\S/.test(text) || /^https:\/\/\S+$/i.test(text) ? text : null
}

/**
 * Each option's preview from a record's `previews`, which lists one for each option in the order of `options`. An empty
 * entry gives that option none. `isAnyLeftOut` says an entry was neither an absolute file path nor an https link.
 */
export function previewsOf(
  input: Record<string, unknown>,
  options: string[],
): { previews: Record<string, string>; isAnyLeftOut: boolean } {
  const given = Array.isArray(input.previews) ? input.previews : []
  const entries = options.map((option, i) => {
    const raw = given[i]
    const text = typeof raw === 'string' ? raw.trim() : ''
    return { option, text, target: text === '' ? null : previewTarget(text) }
  })

  return {
    previews: Object.fromEntries(entries.flatMap(e => (e.target ? [[e.option, e.target] as const] : []))),
    isAnyLeftOut: entries.some(e => e.text !== '' && e.target === null),
  }
}

/** What a record's answer says when some of its `previews` were left out. */
export function previewsLeftOutText(input: Record<string, unknown>, options: string[]): string {
  return previewsOf(input, options).isAnyLeftOut
    ? ' Some previews were not an absolute file path or an https link, so they are left out.'
    : ''
}

/** Whether a step opens one of the item's previews, which the row shows only through Open previews. */
export function isPreviewStep(help: Help, previews: Readonly<Record<string, string>> | undefined): boolean {
  const targets = Object.values(previews ?? {})
  const target = help.kind === 'open' ? help.path : help.kind === 'link' ? help.url : null

  return target !== null && targets.includes(target)
}

/** Whether any of the item's options has a preview. */
export function hasPreviews(item: Pick<Item, 'options' | 'optionPreviews'>): boolean {
  return item.options.some(o => item.optionPreviews?.[o] !== undefined)
}

/** What Open previews opens: the item's page, which its host wrote. None when the host wrote no page. */
export function previewEffects(item: Pick<Item, 'previewPage'>): Effect[] {
  return item.previewPage ? [{ kind: 'open', target: item.previewPage, name: 'previews' }] : []
}

/**
 * The comparison page's data for a question's previews, as `hooks/compare-page.html` reads it. The choices follow
 * the row's order, with the recommended option first. Each note is its choice's summary.
 */
function previewPageData(item: Item) {
  const isRec = (o: string) => o === item.rec
  const options = [...item.options.filter(isRec), ...item.options.filter(o => !isRec(o))]

  return {
    question: item.ask,
    context: item.context ?? '',
    pick: item.rec ?? '',
    reason: item.recReason ?? '',
    choices: options.map(name => ({
      name,
      summary: item.optionDescriptions?.[name] ?? '',
      preview: item.optionPreviews?.[name] ?? '',
    })),
  }
}

/** The previews page of `item`: the comparison page template, then the question's data as JSON. */
export function previewPageText(template: string, item: Item): string {
  return `${template}${JSON.stringify(previewPageData(item), null, 2)}\n`
}
