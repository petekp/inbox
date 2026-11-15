// Reads the questions of the HTML form omp's `ask` tool takes from omp 18.18.3 on. omp's own parser is not exported
// from a package root, which is all a compiled omp resolves for an extension, so this reads the form itself. It follows
// `parseHtmlForm` in `pi-tui/src/html-form/parse.ts` and `fieldQuestions` in `pi-tui/src/html-form/data.ts`, and
// `omp/tests/ask-form.spec.ts` compares the two over a corpus of forms.
import { childElements, closest, contains, descendants, parseForm, textOf, type FormElement } from './ask-form-dom'

/** A form field as `dialogQuestions` reads a question. `recommended` is the index of the option the form preselects. */
type FormQuestion = { question: string; options: { label: string }[]; recommended?: number }

type Option = { label: string; checked: boolean }

type Field = { name: string; kind: 'text' | 'choice'; select: boolean; label: string; options: Option[] }

type Block = { kind: 'text'; text: string } | { kind: 'field'; field: Field } | { kind: 'other' }

type Section = { title: string; blocks: Block[] }

const SKIPPED = new Set([
  'button',
  'head',
  'iframe',
  'link',
  'meta',
  'noscript',
  'script',
  'style',
  'template',
  'title',
])
const BLOCK = new Set(
  'address article aside blockquote dd details div dl dt figure figcaption footer header li main nav p section'.split(
    ' ',
  ),
)
const HEADING = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'summary'])
const IGNORED_INPUTS = new Set(['button', 'file', 'image', 'reset', 'submit'])
const CONTROLS = new Set(['input', 'select', 'textarea'])

/** Collapses whitespace as HTML layout does and trims the ends. */
function normalized(text: string): string {
  return text
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim()
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

const isControl = (el: FormElement) => CONTROLS.has(el.tag)

/** The text of an element, without its controls, as a label reads it. */
function textWithoutControls(el: FormElement): string {
  let text = ''
  const visit = (node: FormElement | string) => {
    if (typeof node === 'string') {
      text += node
      return
    }
    if (SKIPPED.has(node.tag) || isControl(node) || node.tag === 'svg') return
    if (node.tag === 'br') text += '\n'
    else if (node.tag === 'img') text += node.attrs.get('alt') ?? ''
    else {
      if (BLOCK.has(node.tag) || HEADING.has(node.tag)) text += ' '
      node.kids.forEach(visit)
    }
  }
  el.kids.forEach(visit)

  return normalized(text)
}

class FormReader {
  readonly fields: Field[] = []
  readonly sections: Section[] = [{ title: '', blocks: [] }]
  private readonly groups = new Map<string, Field>()
  private readonly labelFor = new Map<string, FormElement>()
  private inline = ''
  private fieldsetDepth = 0

  constructor(root: FormElement) {
    const below = descendants(root)
    const ids = new Set(below.filter(isControl).flatMap(el => el.attrs.get('id') || []))
    for (const label of below.filter(el => el.tag === 'label')) {
      const target = label.attrs.get('for')
      if (target && ids.has(target) && !this.labelFor.has(target)) this.labelFor.set(target, label)
    }
    this.walkKids(root)
    this.flush()
  }

  private get section(): Section {
    return this.sections[this.sections.length - 1]!
  }

  private flush(): void {
    const text = normalized(this.inline)
    this.inline = ''
    if (text !== '') this.section.blocks.push({ kind: 'text', text })
  }

  private walkKids(el: FormElement): void {
    el.kids.forEach(kid => this.walk(kid))
  }

  private walk(node: FormElement | string): void {
    if (typeof node === 'string') {
      this.inline += node
      return
    }
    const { tag } = node
    if (SKIPPED.has(tag)) return
    switch (tag) {
      case 'br':
        this.inline += '\n'
        return
      case 'hr':
        this.flush()
        return
      case 'input':
      case 'select':
      case 'textarea':
        this.control(node, undefined)
        return
      case 'label':
        this.label(node)
        return
      case 'fieldset':
        this.fieldset(node)
        return
      case 'legend':
        this.flush()
        this.walkKids(node)
        this.flush()
        return
      case 'ul':
      case 'ol':
        this.list(node)
        return
      case 'pre':
        this.flush()
        this.section.blocks.push({ kind: 'other' })
        return
      case 'table':
        this.table(node)
        return
      case 'img':
        if (!node.attrs.get('src')?.trim()) return
        this.flush()
        this.section.blocks.push({ kind: 'other' })
        return
      case 'svg':
        this.flush()
        this.section.blocks.push({ kind: 'other' })
        return
    }
    const isBlock = BLOCK.has(tag) || HEADING.has(tag)
    if (isBlock) this.flush()
    this.walkKids(node)
    if (isBlock) this.flush()
  }

  private label(label: FormElement): void {
    const target = label.attrs.get('for')
    if (target && this.labelFor.get(target) === label) return
    const controls = descendants(label).filter(isControl)
    if (controls.length === 0) {
      this.walkKids(label)
      return
    }
    this.flush()
    const text = textWithoutControls(label)
    controls.forEach(control => this.control(control, text))
  }

  private fieldset(fieldset: FormElement): void {
    this.flush()
    const legend = childElements(fieldset).find(el => el.tag === 'legend')
    if (this.fieldsetDepth > 0) {
      if (legend) this.walk(legend)
    } else {
      this.startSection(legend ? textWithoutControls(legend) : '')
    }
    this.fieldsetDepth++
    fieldset.kids.filter(kid => kid !== legend).forEach(kid => this.walk(kid))
    this.flush()
    this.fieldsetDepth--
    if (this.fieldsetDepth === 0) this.startSection('')
  }

  private startSection(title: string): void {
    if (this.section.blocks.length === 0 && this.section.title === '') this.section.title = title
    else this.sections.push({ title, blocks: [] })
  }

  private list(list: FormElement): void {
    this.flush()
    if (descendants(list).some(isControl)) {
      this.walkKids(list)
      this.flush()
      return
    }
    const hasText = childElements(list).some(el => el.tag === 'li' && textWithoutControls(el) !== '')
    if (hasText) this.section.blocks.push({ kind: 'other' })
  }

  private table(table: FormElement): void {
    this.flush()
    const rows = descendants(table).filter(el => el.tag === 'tr' && closest(el, 'table') === table)
    const cellsOf = (row: FormElement) => childElements(row).filter(el => el.tag === 'td' || el.tag === 'th')
    if (!descendants(table).some(isControl)) {
      if (rows.some(row => cellsOf(row).length > 0)) this.section.blocks.push({ kind: 'other' })
      return
    }
    let header: string[] = []
    for (const row of rows) {
      const cells = cellsOf(row)
      const rowHasControl = descendants(row).some(isControl)
      if (cells.every(cell => cell.tag === 'th') && !rowHasControl) {
        header = cells.map(textWithoutControls)
        continue
      }
      const rowText = cells
        .filter(cell => !descendants(cell).some(isControl))
        .map(textWithoutControls)
        .filter(text => text !== '')
        .join(' · ')
      if (rowText !== '') this.section.blocks.push({ kind: 'text', text: normalized(rowText) })
      cells.forEach((cell, column) => {
        for (const control of descendants(cell).filter(isControl)) {
          const own = closest(control, 'label')
          const text = own && contains(cell, own) ? textWithoutControls(own) : textWithoutControls(cell)
          this.control(control, text !== '' ? text : (header[column] ?? ''))
        }
      })
    }
  }

  private detachedLabel(control: FormElement): string {
    const id = control.attrs.get('id')
    const label = id ? this.labelFor.get(id) : undefined
    if (label) return textWithoutControls(label)

    return normalized(control.attrs.get('aria-label') ?? control.attrs.get('title') ?? '')
  }

  private control(control: FormElement, wrapping: string | undefined): void {
    this.flush()
    const label = wrapping ? wrapping : this.detachedLabel(control)
    const name = control.attrs.get('name') ?? ''
    if (control.tag === 'select') {
      const options = descendants(control)
        .filter(el => el.tag === 'option')
        .map(el => ({
          label: oneLine(textOf(el)),
          checked: el.attrs.has('selected'),
          disabled: el.attrs.has('disabled'),
        }))
      const first = options.find(o => !o.disabled)
      if (!control.attrs.has('multiple') && !options.some(o => o.checked) && first) first.checked = true
      this.addField({ name, kind: 'choice', select: true, label, options })
      return
    }
    if (control.tag === 'textarea') {
      this.addField({ name, kind: 'text', select: false, label: label || nameLabel(name), options: [] })
      return
    }
    const type = (control.attrs.get('type') ?? 'text').toLowerCase()
    if (IGNORED_INPUTS.has(type) || type === 'hidden') return
    if (type === 'radio' || type === 'checkbox') {
      const value = control.attrs.get('value')
      const option = { label: label || (value ?? name), checked: control.attrs.has('checked') }
      const key = `${type}\0${name}`
      const group = this.groups.get(key)
      if (group) {
        group.options.push(option)
        return
      }
      const field: Field = { name, kind: 'choice', select: false, label: '', options: [option] }
      this.groups.set(key, field)
      this.addField(field)
      return
    }
    this.addField({ name, kind: 'text', select: false, label: label || nameLabel(name), options: [] })
  }

  private addField(field: Field): void {
    this.fields.push(field)
    this.section.blocks.push({ kind: 'field', field })
  }

  /** The question of each field: its own label, else the text block before it, else its section title, else a lone option's label, else its name. */
  questions(): Map<Field, string> {
    const questions = new Map<Field, string>()
    for (const section of this.sections) {
      let caption = ''
      for (const block of section.blocks) {
        if (block.kind === 'field') {
          const { field } = block
          const lone = field.kind === 'choice' && field.options.length === 1 ? field.options[0]!.label : ''
          questions.set(field, oneLine(field.label || caption || section.title || lone || field.name))
          caption = ''
        } else {
          caption = block.kind === 'text' ? block.text : ''
        }
      }
    }

    return questions
  }
}

function nameLabel(name: string): string {
  return name.replace(/[_-]+/g, ' ')
}

/** The questions of an `ask` form, in form order, one per named field. */
export function formQuestions(html: string): FormQuestion[] {
  const document = parseForm(html)
  const form = descendants(document).find(el => el.tag === 'form')
  const reader = new FormReader(form ?? document)
  const questions = reader.questions()

  return reader.fields.flatMap(field => {
    if (field.name === '') return []
    const recommended = field.options.findIndex(o => o.checked)

    return [
      {
        question: questions.get(field) ?? field.name,
        options: field.options.map(o => ({ label: oneLine(o.label) })),
        ...(recommended >= 0 ? { recommended } : {}),
      },
    ]
  })
}
