// Reads the questions of the HTML form omp's `ask` tool takes from omp 18.18.3 on. omp's own parser is not exported
// from a package root, which is all a compiled omp resolves for an extension, so this reads the form itself. It follows
// `parseHtmlForm` in `pi-tui/src/html-form/parse.ts` and `fieldQuestions` in `pi-tui/src/html-form/data.ts`. A text
// field's question is its label, else its name. A choice field's question is its own label, else the text right
// before it, else its fieldset's legend, else a lone option's label, else its name.

/** A form field as `dialogQuestions` reads a question. `recommended` is the index of the option the form preselects. */
type FormQuestion = { question: string; options: { label: string }[]; recommended?: number }

type Option = { wrapped: string; fallback: string; checked: boolean }

type Field = {
  name: string
  /** A radio or checkbox group's question is the text around it, since each `<label>` names one of its options. */
  kind: 'text' | 'select' | 'group'
  /** The text of the `<label>` around the control. */
  wrapped: string
  /** The control's `<label for>`, `aria-label` or `title`. */
  detached: string
  caption: string
  title: string
  options: Option[]
}

const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g
const ATTR = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const SKIPPED = new Set(['script', 'style', 'svg', 'pre'])
const CONTEXT_BLOCKS = new Set(['ul', 'ol', 'table'])
const BLOCKS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'section', 'form', 'hr'])
const UNANSWERED_INPUTS = new Set(['hidden', 'submit', 'button', 'reset', 'image'])
const LABEL = /<label\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/label>/gi

function decoded(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? whole
    const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)

    return Number.isFinite(n) ? String.fromCodePoint(n) : whole
  })
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function attrsOf(raw: string): Map<string, string> {
  return new Map([...raw.matchAll(ATTR)].map(m => [m[1]!.toLowerCase(), decoded(m[2] ?? m[3] ?? m[4] ?? '')]))
}

/** The text of each `<label for>` by the id it names, wherever the label stands in the form. */
function labelsFor(html: string): Map<string, string> {
  return new Map(
    [...html.matchAll(LABEL)].flatMap(m => {
      const id = attrsOf(m[1] ?? '').get('for')

      return id === undefined ? [] : [[id, oneLine(decoded((m[2] ?? '').replace(/<[^>]*>/g, ' ')))] as const]
    }),
  )
}

function questionOf(f: Field): string {
  const own = f.wrapped || f.detached
  if (f.kind === 'text') return oneLine(own || f.name.replace(/[_-]+/g, ' '))
  const lone = f.options.length === 1 ? optionLabel(f.options[0]!) : ''

  return oneLine(own || f.caption || f.title || lone || f.name)
}

function optionLabel(o: Option): string {
  return o.wrapped || o.fallback
}

/** The questions of an `ask` form, in form order, one per named field. */
export function formQuestions(html: string): FormQuestion[] {
  const fields: Field[] = []
  const groups = new Map<string, Field>()
  const labelFor = labelsFor(html)
  let loose = ''
  let caption = ''
  let title = ''
  let fieldsetDepth = 0
  let context: { depth: number; text: string } | null = null
  let legend: string | null = null
  let skipped: { tag: string; depth: number } | null = null
  let label: { text: string; targets: ((text: string) => void)[] } | null = null
  let select: Field | null = null
  let option: { text: string; value: string; checked: boolean } | null = null

  const flush = () => {
    if (oneLine(loose) !== '') caption = oneLine(loose)
    loose = ''
  }
  const endOption = () => {
    if (option) {
      const text = oneLine(option.text)
      select?.options.push({ wrapped: text, fallback: option.value, checked: option.checked })
    }
    option = null
  }
  const detachedOf = (attrs: Map<string, string>) => {
    const id = attrs.get('id')

    return (id !== undefined ? labelFor.get(id) : undefined) || attrs.get('aria-label') || attrs.get('title') || ''
  }
  const addField = (name: string, kind: Field['kind'], attrs: Map<string, string>): Field => {
    flush()
    const field: Field = { name, kind, wrapped: '', detached: detachedOf(attrs), caption, title, options: [] }
    caption = ''
    fields.push(field)
    if (kind !== 'group') label?.targets.push(text => (field.wrapped = text))

    return field
  }

  for (const [, slash, rawTag, rawAttrs, text] of html.matchAll(TOKEN)) {
    const tag = rawTag?.toLowerCase()
    const isClose = slash === '/'
    if (skipped) {
      if (tag === skipped.tag) skipped.depth += isClose ? -1 : 1
      if (skipped.depth === 0) skipped = null
      continue
    }
    if (text !== undefined) {
      const plain = decoded(text)
      if (option) option.text += plain
      else if (legend !== null) legend += plain
      else if (label) label.text += plain
      else if (context) context.text += plain
      else loose += plain
      continue
    }
    if (!tag) continue
    const attrs = attrsOf(rawAttrs ?? '')
    const name = attrs.get('name') ?? ''
    if (tag === 'option' || tag === 'select') endOption()
    if (isClose) {
      if (tag === 'legend' && legend !== null) {
        if (fieldsetDepth === 1) title = oneLine(legend)
        legend = null
      } else if (tag === 'label' && label) {
        const done = oneLine(label.text)
        label.targets.forEach(set => set(done))
        label = null
      } else if (tag === 'fieldset') {
        fieldsetDepth = Math.max(0, fieldsetDepth - 1)
        if (fieldsetDepth === 0) [loose, caption, title] = ['', '', '']
      } else if (tag === 'select') {
        select = null
      } else if (CONTEXT_BLOCKS.has(tag) && context) {
        context.depth -= 1
        if (context.depth === 0 && oneLine(context.text) !== '') caption = ''
        if (context.depth === 0) context = null
      } else if (BLOCKS.has(tag)) {
        flush()
      }
      continue
    }
    if (tag === 'fieldset') {
      flush()
      fieldsetDepth += 1
      if (fieldsetDepth === 1) [caption, title] = ['', '']
    } else if (tag === 'legend') {
      legend = ''
    } else if (tag === 'label') {
      flush()
      label = { text: '', targets: [] }
    } else if (tag === 'select' && name !== '') {
      select = addField(name, 'select', attrs)
    } else if (tag === 'option') {
      if (select) option = { text: '', value: attrs.get('value') ?? '', checked: attrs.has('selected') }
    } else if (tag === 'textarea' || tag === 'input') {
      const type = tag === 'textarea' ? 'textarea' : (attrs.get('type') ?? 'text').toLowerCase()
      if (tag === 'textarea') skipped = { tag, depth: 1 }
      if (name === '' || UNANSWERED_INPUTS.has(type)) continue
      if (type !== 'radio' && type !== 'checkbox') {
        addField(name, 'text', attrs)
        continue
      }
      const key = `${type}:${name}`
      const field = groups.get(key) ?? addField(name, 'group', new Map())
      groups.set(key, field)
      const added: Option = {
        wrapped: '',
        fallback: detachedOf(attrs) || attrs.get('value') || name,
        checked: attrs.has('checked'),
      }
      field.options.push(added)
      label?.targets.push(text => (added.wrapped = text))
    } else if (CONTEXT_BLOCKS.has(tag)) {
      flush()
      if (context) context.depth += 1
      else context = { depth: 1, text: '' }
    } else if (SKIPPED.has(tag) || tag === 'img') {
      flush()
      caption = ''
      if (tag !== 'img') skipped = { tag, depth: 1 }
    } else if (BLOCKS.has(tag)) {
      flush()
    }
  }

  return fields.map(f => {
    const recommended = f.options.findIndex(o => o.checked)

    return {
      question: questionOf(f),
      options: f.options.map(o => ({ label: optionLabel(o) })),
      ...(recommended >= 0 ? { recommended } : {}),
    }
  })
}
