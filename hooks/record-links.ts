import { inlineLinks, linkLabel, parseInline } from './inline'

/** A field of a `record` call, by the name the agent gave it. */
type RecordField = 'title' | 'ask' | 'detail' | 'options'

type UnlinkedRef = { field: RecordField; text: string }

/** A field's text as the agent sent it, before it is cut, and the most visible characters the inbox keeps of it. */
type FieldText = { field: RecordField; text: string; max: number }

const FENCE = /```[\s\S]*?```/g
const URL_TEXT = /<?https?:\/\/[^\s>]+>?/g
const LINKED_PATH = /\/(?:pulls?|issues|merge_requests)\/(\d+)/g
const MAX_NAMED = 3

const anyCase = (word: string) => [...word].map(c => `[${c.toUpperCase()}${c}]`).join('')

/**
 * A PR or issue reference: "PR 12", "PR #12", "PRs 1", "pull request 12", "issue #12", their Japanese names,
 * "repo#12", "owner/repo#12" or "#12". The number is group 1. "issue" and "pull request" may take any letter case.
 * "PR" is upper case and never follows a hyphen, so a name such as "build-pr21" is not one. A number followed by a
 * counter word ("PR 2 件") is a count, and one followed by a letter ("#12ab") is not a number.
 */
const REF = new RegExp(
  String.raw`(?<![\w/#&])(?:(?<!-)(?:PRs?|${anyCase('pull')}\s+${anyCase('request')}[sS]?|${anyCase('issue')}[sS]?|プルリク(?:エスト)?|イシュー)\s*#?|(?:[\w.-]+\/)?[\w.-]+#|#)([1-9]\d*)(?!\w)(?!\s*(?:件|本|個|つ|点|回|枚))`,
  'g',
)

/**
 * The references in `text`, matched in its NFKC form so that full-width "＃１２" counts, each quoted as written. A match
 * that ends inside one character's NFKC form quotes that whole character.
 */
function refs(text: string): { text: string; n: string }[] {
  let normal = ''
  const from: number[] = []
  const to: number[] = []
  let i = 0
  for (const ch of text) {
    const n = ch.normalize('NFKC')
    for (let k = 0; k < n.length; k++) {
      from.push(i)
      to.push(i + ch.length)
    }
    normal += n
    i += ch.length
  }

  return [...normal.matchAll(REF)].map(m => ({
    text: text.slice(from[m.index] ?? 0, to[m.index + m[0].length - 1] ?? i).trim(),
    n: m[1] ?? '',
  }))
}

/** The text of `value` a reference could hide in, without code, URLs or valid links, or with only their labels. */
function plain(value: string, keepLabels: boolean): string {
  return parseInline(value.replace(FENCE, ' '))
    .map(span => (span.code || (span.link && !keepLabels) ? ' ' : span.text))
    .join('')
    .replace(URL_TEXT, ' ')
}

/** The numbers `value` links: those its valid links name in their labels or as a PR or issue path. */
function linkedIn(value: string): string[] {
  return parseInline(value.replace(FENCE, ' ')).flatMap(span =>
    span.link ? [...refs(span.text).map(r => r.n), ...pathNumbers(span.link)] : [],
  )
}

function pathNumbers(url: string): string[] {
  return [...url.matchAll(LINKED_PATH)].map(m => m[1] ?? '')
}

/**
 * The PR and issue references a record names without a link, in field order. A reference counts as linked when the
 * record links its number anywhere outside options, since an option shows only a link's label, or a step links to it.
 * `stepUrls` are the URLs of the record's link steps.
 */
export function unlinkedRefs(fields: Partial<Record<RecordField, string[]>>, stepUrls: string[] = []): UnlinkedRef[] {
  const order: RecordField[] = ['title', 'ask', 'detail', 'options']
  const linked = new Set([
    ...order.filter(f => f !== 'options').flatMap(f => (fields[f] ?? []).flatMap(v => linkedIn(v))),
    ...stepUrls.flatMap(pathNumbers),
  ])

  return order.flatMap(field =>
    (fields[field] ?? []).flatMap(value =>
      refs(plain(value, field === 'options'))
        .filter(r => !linked.has(r.n))
        .map(r => ({ field, text: r.text })),
    ),
  )
}

/**
 * Why a `record` call must be sent again, or null when its links are fine: a field over its limit would lose its
 * links to the cut, or a field names a PR or issue without a link. It reads each field as the agent sent it.
 */
export function recordLinksAnswer(fields: FieldText[], stepUrls: string[] = []): string | null {
  const long = fields.find(f => inlineLinks(f.text).length > 0 && linkLabel(f.text).length > f.max)
  if (long)
    return `Not recorded: ${long.field} is over its limit of ${long.max} characters, so cutting it would drop its links. Shorten it so its links survive; a link counts as its label.`
  const byField: Partial<Record<RecordField, string[]>> = {}
  for (const f of fields) (byField[f.field] ??= []).push(f.text)
  const found = unlinkedRefs(byField, stepUrls)

  return found.length > 0 ? unlinkedRefsAnswer(found) : null
}

/** The answer to a `record` call that names `found`, which must not be empty. */
export function unlinkedRefsAnswer(found: UnlinkedRef[]): string {
  const named = found.slice(0, MAX_NAMED)
  const fields = [...new Set(named.map(r => r.field))].map(
    field =>
      `${field} names ${named
        .filter(r => r.field === field)
        .map(r => `"${r.text}"`)
        .join(' and ')}`,
  )
  const more = found.length > MAX_NAMED ? `, and ${found.length - MAX_NAMED} more` : ''
  const option = found.some(r => r.field === 'options')
    ? " An option shows only a link's label, so link what an option names in detail or steps."
    : ''

  return (
    `Not recorded: ${fields.join(', ')}${more}, without a link. ` +
    'Write each PR or issue as a Markdown link at its first mention, such as [owner/repo#123](https://github.com/owner/repo/pull/123); later mentions in the same record need none. Only https links count, and a link with a title or inside italics is not read as a link.' +
    option +
    ' If it is not a PR or issue, write it without "#", or put code in backticks.'
  )
}
