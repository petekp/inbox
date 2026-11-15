import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { UiScrollInput } from 'claude-code'
import type { On } from 'claude-code'
import { httpsHref } from '../hooks/inline'
// The test uses Marked's ESM entry because its package directory is not a Node relative import.
// @ts-expect-error The package's declaration file is not adjacent to its ESM entry.
import { marked } from '../codex/node_modules/marked/lib/marked.esm.js'
import { adjustScroll, documentActions, safeDocumentMarkdown, scrollBy } from '../hooks/pane-document'
import { clippedDocumentPreview } from '../hooks/pane-asks'
import { PRESS_GUARD_MS } from '../hooks/timing'
import { w, world } from './hooks-world'
import { PANE } from './hooks-helpers'

const LINK_PROBES = [
  '[x][r]\n[r]: file:///tmp/x.command "title"',
  '[x][]\n[x]: file:///tmp/x.command "title"',
  '[x][r]\n[r]:\n  file:///tmp/x.command',
  '[r]: /tmp/a.command "t"\n\n[r]',
  '![r]: /tmp/image.command "t"\n\n![r]',
  '[x][r]\n[r]: http://e.example/ "t"',
  '[a [b] c](file:///tmp/x.command)',
  '[wrapped\nlabel](file:///tmp/x.command)',
  'x:[a](file:///tmp/a)',
  'see:[a](http://e.example/)',
  String.raw`[x](file\:///a)`,
  '[x](/tmp/a.command)',
  String.raw`[x](\/tmp/a.command)`,
  '[x](/tmp/a%2ecommand)',
  '[x](&#102;ile:///a)',
  '![x](file:///tmp/image.command)',
  '![x](https://example.com/image)',
  '\\`[x](file:///tmp/x.command)`',
  'before ~~~ [x](file:///tmp/x.command) ~~~ after',
  'https://example.com/x.command',
  '<http://example.com/x.command>',
  'https://user:pass@example.com/private',
  '[x](https://good.com&commat;evil.example/x.command)',
  'https\\://example.com/escaped',
  '[safe](https://EXAMPLE.com/safe)',
  'http://example.com/x.command',
  'mailto:reader@example.com',
  'www.example.com/x.command',
  '<www.example.com/x.command>',
  '<reader@example.com>',
  '<&#102;ile:///tmp/x.command>',
  '[x](file&#58;///tmp/x.command)',
  '[x](file&#x3a;///tmp/x.command)',
  'www&#46;example.com/x.command',
  '<file:///tmp/x.command>',
  '<hr>',
].join('\n')

function parsedLinks(text: string) {
  const links: { type: string; href?: string }[] = []
  marked.walkTokens(marked.lexer(text), (token: { type: string; href?: string }) => {
    if (token.type === 'link' || token.type === 'image') links.push(token)
  })
  return links
}

async function readsReport(
  $: Engine,
  on: On,
  surface: 'terminal' | 'desktop',
  text = '# Weekly report\n\nRead [release notes](https://example.com/release) and [local file](file:///tmp/report).\n\n' +
    '| Choice | Result |\n| --- | --- |\n| One region | Ship safely |\n\n<hr>\n\n```ts\nship()\n```',
) {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: true, isFocused: true }
  w.documentFile = {
    path: '/reports/current.md',
    realPath: '/reports/weekly.md',
    text,
  }
  await $.session.start({ cwd: '/tmp/project', surface, isInteractive: true })
  await $.command.run({ command: 'inbox', args: '' } as never)
  const pane = await $.ui.mount({ ...PANE, surface })
  const recorded = await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'task',
    ask: 'Read the weekly report',
    document: '/reports/current.md',
  } as never)
  expect(recorded.result).toContain('Recorded.')
  await clock.settle()
  expect(JSON.parse(w.stored.get('s:session-1') ?? '{}').ledger.items[0]).toMatchObject({
    id: 'i1',
    document: '/reports/current.md',
  })
  if (!(await pane.find({ key: 'view-i1' }))) {
    const selectKey = surface === 'terminal' ? 'title-i1' : 'select-i1'
    expect(await pane.find({ key: selectKey }), `${surface} task selection control`).toBeTruthy()
    if (surface === 'terminal') await pane.press({ key: selectKey })
    else await pane.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: selectKey })
    await clock.settle()
    await clock.advance(PRESS_GUARD_MS)
    await clock.settle()
  }
  expect(await pane.find({ key: 'view-i1' }), `${surface} selected task marker`).toBeTruthy()
  const buttons = (await pane.findAll({ type: 'Button' })).map(button => button.key)
  expect(buttons, `selected task buttons: ${buttons.join(', ')}`).toContain('read-document-i1')
  await pane.press({ key: 'read-document-i1' })
  await clock.settle()
  const markdown = await pane.findAll({ type: 'Markdown' })
  expect(markdown).toHaveLength(1)
  const renderedText = markdown[0]?.props.text as string
  expect(renderedText).toBe(safeDocumentMarkdown(w.documentFile.text, true))
  const links = parsedLinks(renderedText)
  expect(links.every(link => link.type === 'link' && httpsHref(link.href ?? '') !== null)).toBe(true)
  expect(renderedText).toContain('<hr>')
  expect(await pane.find({ key: 'document-back' })).toBeTruthy()
  if (surface === 'terminal') {
    expect(await pane.find({ key: 'document-scroll-up' })).toMatchObject({ props: { hotkey: 'k' } })
    expect(await pane.find({ key: 'document-scroll-down' })).toMatchObject({ props: { hotkey: 'j' } })
  }
  await pane.press({ key: 'document-back' })
  await clock.settle()
  expect(await pane.findAll({ type: 'Markdown' })).toHaveLength(0)
  expect(await pane.find({ key: 'read-document-i1' })).toBeTruthy()
  expect(await pane.find({ key: 'document-back' })).toBeUndefined()
}

test('reader back and scroll actions use b, k, and j, and scroll offsets stay in the pane', async () => {
  const preview = clippedDocumentPreview('abcdefghij', 4, 5)
  const scrolls: number[] = []
  const actions = documentActions(
    {} as never,
    async () => {},
    async by => void scrolls.push(by),
  )
  actions.scroll(-1).onPress({} as never)
  actions.scroll(1).onPress({} as never)

  expect(preview.spans).toHaveLength(3)
  expect(preview.bodyLines).toBe(2)
  expect(actions.back().hotkey).toBe('b')
  expect(scrolls).toEqual([-1, 1])
  const input = {
    component: 'Pane',
    requestId: PANE.requestId,
    offset: 18,
    by: 4,
    bodyRows: 10,
    contentRows: 30,
    origin: { kind: 'plugin', name: 'inbox' },
  } as UiScrollInput
  let moved = input
  await scrollBy(1, async () => {
    moved = adjustScroll(input)
  })
  expect(moved.offset).toBe(15)
  await scrollBy(-1, async () => {
    moved = adjustScroll(input)
  })
  expect(moved.offset).toBe(13)
})

test('report Markdown parses only validated inline HTTPS links and leaves HTML tags as text', () => {
  const text =
    '[safe](https://EXAMPLE.com/a) [file](file:///tmp/a) [http](http://example.com) [bad](javascript:alert(1))\n' +
    '[entity](https://good.com&commat;evil.example/x) ![image](https://example.com/image)\n' +
    '[![i](https://e.example/a.png)\nx [![t](https://track.example/p.gif) y\n' +
    '[ref][r]\n[r]: https://example.com/ref "title"\n\n`[code](file:///tmp/code)`\n\n<hr>'
  const inert = safeDocumentMarkdown(text)
  const safe = safeDocumentMarkdown(text, true)

  expect(parsedLinks(inert)).toEqual([])
  expect(parsedLinks(safe).map(link => link.href)).toEqual(['https://example.com/a'])
  expect(parsedLinks(safe).filter(link => link.type === 'image')).toEqual([])
  expect(parsedLinks(safe).every(link => link.type === 'link' && httpsHref(link.href ?? '') !== null)).toBe(true)
  expect(safe).toContain('<hr>')
  expect(safe).not.toContain('&lt;hr>')
})

test('the terminal reads a report through the native Markdown element and returns to the list', async ($, on) => {
  await readsReport($, on, 'terminal')
})

test('the desktop pane reads a report through the native Markdown element and returns to the list', async ($, on) => {
  await readsReport($, on, 'desktop')
})

test('neutralized Markdown parses without link or image tokens and leaves prose readable', () => {
  const readable = 'http is a word; 10:30; Note:this; reader@example.com; `<Array<string> [x](y)>`; <hr>'
  const safe = safeDocumentMarkdown(readable)

  expect(safe.replaceAll('\u200b', '')).toBe(readable)
  expect(safe).toContain('<hr>')
  expect(parsedLinks(safe)).toEqual([])
})

test('report Markdown has no link or image tokens after parsing the security probes', () => {
  const safe = safeDocumentMarkdown(LINK_PROBES)

  expect(safe).toContain('<hr>')
  expect(safe).not.toContain('&lt;hr>')
  expect(parsedLinks(safe)).toEqual([])
})

test('the terminal draws only validated HTTPS report links and keeps HTML tags as text', async ($, on) => {
  await readsReport($, on, 'terminal', LINK_PROBES)
})

test('the desktop pane draws only validated HTTPS report links and keeps HTML tags as text', async ($, on) => {
  await readsReport($, on, 'desktop', LINK_PROBES)
})
