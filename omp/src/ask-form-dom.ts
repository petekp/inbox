import { decodeEntities } from './ask-form-entities'

/**
 * An element of a parsed form. `kids` holds child elements and the text between them. A comment is an element tagged
 * `#comment` that holds its text, since omp counts that text in an option's label.
 */
export type FormElement = {
  tag: string
  attrs: Map<string, string>
  kids: (FormElement | string)[]
  parent: FormElement | null
  svg: boolean
  /** Whether an `input`, `select` or `textarea` stands anywhere below this element. */
  holdsControl: boolean
}

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])
const CLOSE_ON_OPEN = new Map<string, string[]>(
  Object.entries({
    li: ['li'],
    dt: ['dt', 'dd'],
    dd: ['dt', 'dd'],
    tr: ['tr'],
    th: ['th', 'td'],
    td: ['th', 'td'],
    option: ['option'],
    thead: ['thead', 'tbody', 'tfoot'],
    tbody: ['thead', 'tbody', 'tfoot'],
    tfoot: ['thead', 'tbody', 'tfoot'],
  }),
)
const PARAGRAPH_CLOSERS = new Set(
  'address article aside blockquote div dl fieldset footer form h1 h2 h3 h4 h5 h6 header hr menu nav ol p pre section table ul'.split(
    ' ',
  ),
)
const RAW_TEXT_CLOSE = new Map([
  ['script', /<\/script\s*>/gi],
  ['style', /<\/style\s*>/gi],
])
const CONTROL_TAGS = new Set(['input', 'select', 'textarea'])

function newElement(tag: string, parent: FormElement | null, attrs = new Map<string, string>()): FormElement {
  return { tag, attrs, kids: [], parent, svg: false, holdsControl: false }
}

/** The text below an element, without its tags. */
export function textOf(el: FormElement): string {
  return el.kids.map(kid => (typeof kid === 'string' ? kid : textOf(kid))).join('')
}

function tagEnd(html: string, start: number): number {
  let quote = ''
  for (let i = start; i < html.length; i++) {
    const c = html[i]!
    if (quote) {
      if (c === quote) quote = ''
    } else if (c === '"' || c === "'") {
      quote = c
    } else if (c === '>') {
      return i
    }
  }

  return html.length - 1
}

function startTag(source: string): { tag: string; attrs: Map<string, string>; selfClosing: boolean } | null {
  const space = /\s/
  let i = 0
  while (space.test(source[i] ?? '')) i++
  const name = /[^\s/>]+/y
  name.lastIndex = i
  const named = name.exec(source)
  if (!named) return null
  i += named[0].length
  const attrs = new Map<string, string>()
  let selfClosing = false
  while (i < source.length) {
    while (space.test(source[i] ?? '')) i++
    if (source[i] === '/') {
      selfClosing = true
      break
    }
    const attrName = /[^\s=/>]+/y
    attrName.lastIndex = i
    const attr = attrName.exec(source)
    if (!attr) break
    i += attr[0].length
    while (space.test(source[i] ?? '')) i++
    let value = ''
    if (source[i] === '=') {
      i++
      while (space.test(source[i] ?? '')) i++
      const quote = source[i]
      if (quote === '"' || quote === "'") {
        i++
        const end = source.indexOf(quote, i)
        value = end < 0 ? source.slice(i) : source.slice(i, end)
        i = end < 0 ? source.length : end + 1
      } else {
        const bare = /[^\s>]+/y
        bare.lastIndex = i
        value = bare.exec(source)?.[0] ?? ''
        i += value.length
      }
    }
    const key = attr[0].toLowerCase()
    if (!attrs.has(key)) attrs.set(key, decodeEntities(value))
  }

  return { tag: named[0].toLowerCase(), attrs, selfClosing }
}

function isInTemplate(el: FormElement | null): boolean {
  for (; el; el = el.parent) if (el.tag === 'template') return true

  return false
}

function markHoldsControl(from: FormElement): void {
  for (let el: FormElement | null = from; el && !el.holdsControl; el = el.parent) el.holdsControl = true
}

function addComment(parent: FormElement, text: string): void {
  const comment = newElement('#comment', parent)
  comment.kids.push(text)
  parent.kids.push(comment)
}

/**
 * Reads HTML into elements with omp's rules for which tags a new tag closes, its void and raw-text tags, and its
 * entities. It does not read an `<rss>` or `<feed>` document as XML, as omp does.
 */
export function parseForm(html: string): FormElement {
  const root = newElement('#document', null)
  const open: FormElement[] = []
  const top = () => open[open.length - 1] ?? root
  let i = 0
  while (i < html.length) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4)
      addComment(top(), html.slice(i + 4, end < 0 ? html.length : end))
      i = end < 0 ? html.length : end + 3
    } else if (html[i] !== '<') {
      const next = html.indexOf('<', i)
      const end = next < 0 ? html.length : next
      top().kids.push(decodeEntities(html.slice(i, end)))
      i = end
    } else if (html[i + 1] === '!' && /^<!doctype\b/i.test(html.slice(i, i + 10))) {
      const end = html.indexOf('>', i + 2)
      i = end < 0 ? html.length : end + 1
    } else if (html.startsWith('<![CDATA[', i)) {
      const end = html.indexOf(']]>', i + 9)
      top().kids.push(html.slice(i + 9, end < 0 ? html.length : end))
      i = end < 0 ? html.length : end + 3
    } else if (html[i + 1] === '/') {
      const end = tagEnd(html, i + 2)
      const name = (
        html
          .slice(i + 2, end)
          .trim()
          .split(/\s/, 1)[0] ?? ''
      ).toLowerCase()
      const at = open.findLastIndex(el => el.tag === name)
      if (at >= 0) open.length = at
      i = end + 1
    } else if (html[i + 1] === '!' || html[i + 1] === '?') {
      const end = html.indexOf('>', i + 2)
      i = end < 0 ? html.length : end + 1
    } else {
      const end = tagEnd(html, i + 1)
      const parsed = startTag(html.slice(i + 1, end))
      if (!parsed) {
        top().kids.push('<')
        i++
        continue
      }
      const current = open[open.length - 1]
      if (current?.tag === 'p' && PARAGRAPH_CLOSERS.has(parsed.tag)) open.pop()
      else if (current && CLOSE_ON_OPEN.get(parsed.tag)?.includes(current.tag)) open.pop()
      const parent = top()
      const element = newElement(parsed.tag, parent, parsed.attrs)
      element.svg = (parent !== root && parent.svg) || parsed.tag === 'svg'
      parent.kids.push(element)
      if (CONTROL_TAGS.has(parsed.tag) && !isInTemplate(parent)) markHoldsControl(parent)
      i = end + 1
      const rawClose = RAW_TEXT_CLOSE.get(parsed.tag)
      if (rawClose && !parsed.selfClosing) {
        rawClose.lastIndex = i
        const match = rawClose.exec(html)
        element.kids.push(html.slice(i, match?.index ?? html.length))
        i = match ? rawClose.lastIndex : html.length
        continue
      }
      if (!(VOID.has(parsed.tag) || (element.svg && parsed.selfClosing))) open.push(element)
    }
  }

  return root
}

/** Each element below `from`, in document order. Nothing inside a `<template>` counts, as in omp. */
export function descendants(from: FormElement): FormElement[] {
  const found: FormElement[] = []
  const visit = (el: FormElement) => {
    if (el.tag === 'template') return
    for (const kid of el.kids) {
      if (typeof kid === 'string') continue
      found.push(kid)
      visit(kid)
    }
  }
  visit(from)

  return found
}

export function childElements(of: FormElement): FormElement[] {
  return of.kids.filter((kid): kid is FormElement => typeof kid !== 'string')
}

/** The nearest element with this tag, starting at `from` itself. */
export function closest(from: FormElement, tag: string): FormElement | null {
  for (let el: FormElement | null = from; el; el = el.parent) if (el.tag === tag) return el

  return null
}

export function contains(outer: FormElement, inner: FormElement): boolean {
  for (let el: FormElement | null = inner; el; el = el.parent) if (el === outer) return true

  return false
}
