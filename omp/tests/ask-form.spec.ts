import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { fieldQuestions } from '../node_modules/@oh-my-pi/pi-tui/src/html-form/data'
import { parseHtmlForm, spansText } from '../node_modules/@oh-my-pi/pi-tui/src/html-form/parse'

import { formQuestions } from '../src/ask-form'

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

function ompQuestions(html: string) {
  const form = parseHtmlForm(html)
  const questions = fieldQuestions(form)

  return form.fields
    .filter(field => field.name !== '')
    .map(field => {
      const recommended = field.kind === 'choice' ? field.options.findIndex(o => o.checked) : -1

      return {
        question: questions.get(field) ?? '',
        options: field.kind === 'choice' ? field.options.map(o => ({ label: oneLine(spansText(o.label)) })) : [],
        ...(recommended >= 0 ? { recommended } : {}),
      }
    })
}

const radios = (name: string, ...labels: string[]) =>
  labels.map(label => `<label><input type="radio" name="${name}" value="${label}"> ${label}</label>`).join('')

const FORMS: Record<string, string> = {
  'one-level fieldset, captions and wrapped labels': `<form>
    <fieldset><legend>License</legend>
      <label><input type="radio" name="license" value="mit"> MIT</label>
      <label><input type="radio" name="license" value="apache" checked> Apache 2.0</label>
    </fieldset>
    <p>Which checks should CI run?</p>
    <label><input type="checkbox" name="checks" value="lint"> Lint</label>
    <label><input type="checkbox" name="checks" value="test"> Tests</label>
    <label>Package name <input type="text" name="pkg"></label>
    <input type="hidden" name="form_version" value="2">
  </form>`,
  'no named control': '<form><p>Which runtime?</p><input type="radio" value="node"> Node</form>',
  'nested fieldsets': `<form><fieldset><legend>Setup</legend>
    <fieldset><legend>Runtime</legend>${radios('rt', 'Node', 'Bun')}</fieldset>
    <fieldset><legend>Package manager</legend>${radios('pm', 'npm', 'pnpm')}</fieldset>
  </fieldset></form>`,
  'label with no control and no for':
    '<form><label>Which region?</label><select name="region"><option>US</option><option selected>EU</option></select></form>',
  'label for a control':
    '<form><label for="r">Which region?</label><select id="r" name="region"><option>US</option></select></form>',
  'label for a missing id': '<form><label for="nope">Which region?</label><input name="region"></form>',
  'two labels for one control':
    '<form><label for="r">First</label><label for="r">Second</label><input id="r" name="region"></form>',
  'list holding controls': `<form><ul><li>Pick a runtime: ${radios('rt', 'Node', 'Bun')}</li></ul></form>`,
  'ordered list holding controls': `<form><ol><li>Pick one<input name="a"></li><li>Pick two<input name="b"></li></ol></form>`,
  'list of text': '<form><ul><li>Note</li><li>Another</li></ul><input name="a"></form>',
  'empty list': '<form><p>Intro</p><ul><li></li></ul><input name="a"></form>',
  'table of controls': `<form><table>
    <tr><th></th><th>Keep</th><th>Drop</th></tr>
    <tr><td>Logs</td><td><input type="checkbox" name="keep" value="logs"></td><td><input type="checkbox" name="drop" value="logs"></td></tr>
    <tr><td>Cache</td><td><input type="checkbox" name="keep" value="cache"></td><td><input type="checkbox" name="drop" value="cache"></td></tr>
  </table></form>`,
  'table of text':
    '<form><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table><input name="a"></form>',
  'empty table': '<form><p>Intro</p><table></table><input name="a"></form>',
  'table with labelled controls':
    '<form><table><tr><td><label>Host <input name="host"></label></td><td><input name="port" aria-label="Port"></td></tr></table></form>',
  'nested table': '<form><table><tr><td><table><tr><td>x<input name="a"></td></tr></table></td></tr></table></form>',
  'content outside the first form':
    '<p>Intro text</p><form><input name="a"></form><form><p>Second</p><input name="b"></form>',
  'no form at all': '<p>Which?</p><input name="a"><select name="b"><option>x</option></select>',
  entities: `<form><p>Keep it &mdash; or drop it?</p><input name="a"><p>Fish &amp; chips &hellip; &#233; &#x1F600; &bogus; &#0;</p><input name="b"></form>`,
  'select with a disabled first option':
    '<form><select name="s"><option disabled>Pick</option><option>A</option><option>B</option></select></form>',
  'multiple select': '<form><select name="s" multiple><option>A</option><option>B</option></select></form>',
  'select with its own label': '<form><label>Region <select name="s"><option>A</option></select></label></form>',
  'lone checkbox': '<form><label><input type="checkbox" name="ok" value="yes"> I agree</label></form>',
  'checkbox with no label': '<form><input type="checkbox" name="ok" value="yes"></form>',
  'checkbox with no label or value': '<form><input type="checkbox" name="ok"></form>',
  'radio and checkbox of one name': `<form>${radios('a', 'x', 'y')}<input type="checkbox" name="a" value="z"></form>`,
  'textarea and typed inputs':
    '<form><textarea name="notes_text">hi</textarea><input type="number" name="n"><input type="file" name="f"><input type="submit" name="go"></form>',
  'textarea with a tag inside': '<form><p>Notes</p><textarea name="n"><b>x</b></textarea><input name="after"></form>',
  'aria-label and title':
    '<form><input name="a" aria-label="Alpha"><input name="b" title="Beta"><input name="c" aria-label="" title="Gamma"></form>',
  'headings and divs':
    '<form><h2>Step one</h2><div>Which db?</div><div>' + radios('db', 'pg', 'mysql') + '</div></form>',
  'hr and br': '<form>First<br>Second<hr>Third<br><input name="a"></form>',
  'caption cleared by an image': '<form><p>Which?</p><img src="x.png" alt="x"><input name="a"></form>',
  'image with no src keeps the caption': '<form><p>Which?</p><img alt="x"><input name="a"></form>',
  'caption cleared by a pre': '<form><p>Which?</p><pre>code</pre><input name="a"></form>',
  'caption cleared by an svg': '<form><p>Which?</p><svg><title>t</title><circle/></svg><input name="a"></form>',
  'script and style': '<form><script>if (a < b) {}</script><style>p{}</style><p>Name?</p><input name="a"></form>',
  'comments and doctype': '<!doctype html><form><!-- note --><p>Name?</p><input name="a"></form>',
  'skipped button holding a control': '<form><button><input name="in"></button><input name="out"></form>',
  'unclosed paragraphs and items': '<form><p>One<p>Two<input name="a"><ul><li>x<li>y</ul></form>',
  'unquoted and single-quoted attributes':
    "<form><input name=a aria-label='Alpha beta'><input name=b value=x/y></form>",
  'duplicate attributes': '<form><input name="a" name="b"></form>',
  'uppercase tags and attributes': '<FORM><LABEL>Name <INPUT NAME="a" TYPE="TEXT"></LABEL></FORM>',
  'label wrapping two controls': '<form><label>Both <input name="a"><input name="b"></label></form>',
  'legend outside a fieldset': '<form><legend>Loose</legend><input name="a"></form>',
  'two legends in a fieldset':
    '<form><fieldset><legend>One</legend><legend>Two</legend><input name="a"></fieldset></form>',
  'fieldset with no legend': `<form><p>Caption</p><fieldset>${radios('a', 'x', 'y')}</fieldset></form>`,
  'content after a fieldset': `<form><fieldset><legend>T</legend><input name="a"></fieldset><p>Later</p><input name="b"><input name="c"></form>`,
  'strong and code inside a caption':
    '<form><p>Pick <strong>one</strong> of <code>these</code></p><input name="a"></form>',
  'nbsp and spaces': '<form><p>A&nbsp;&nbsp;B   C</p><input name="a"></form>',
  'a bare angle bracket': '<form><p>a < b</p><input name="a"></form>',
  'definition list': '<form><dl><dt>Term</dt><dd>Meaning</dd></dl><input name="a"></form>',
  'details and summary': '<form><details><summary>More</summary>Body</details><input name="a"></form>',
  'label holding a block and an image': '<form><label><div>Alpha</div><img alt="pic"> <input name="a"></label></form>',
  'empty form': '<form></form>',
  'empty string': '',
}

for (const [name, html] of Object.entries(FORMS)) {
  test(`the questions of a form with ${name} are the ones omp names`, () => {
    expect(formQuestions(html)).toEqual(ompQuestions(html))
  })
}

test('every named entity omp decodes reads the same', () => {
  const source = readFileSync(new URL('../node_modules/@oh-my-pi/pi-utils/src/dom/parser.ts', import.meta.url), 'utf8')
  const table = source.slice(source.indexOf('const NAMED_ENTITIES'), source.indexOf('const ENTITY_PATTERN'))
  const names = [...table.matchAll(/^\t(\w+):/gm)].map(m => m[1]!)
  expect(names.length).toBeGreaterThan(100)
  const html = `<form>${names.map(n => `<p>&${n};&${n.toUpperCase()};</p><input type="radio" name="${n}">`).join('')}</form>`
  expect(formQuestions(html)).toEqual(ompQuestions(html))
})
