import assert from 'node:assert/strict'
import { test } from 'node:test'
import { h, render } from 'preact'
import { JSDOM } from 'jsdom'
import { Window } from 'happy-dom'
import { emptyState } from '../src/state'
import { viewOf } from '../src/core'
import { NO_HOLDS } from '../../hooks/timing'
import { task } from './row-actions-fixtures'
import TAB_HTML from '../src/tab.html'

test('the Codex row press opens a sanitized reader, and both back controls return to the list', async () => {
  const state = emptyState('document-reader')
  state.ledger = task().ledger
  state.ledger.items = state.ledger.items.map(row =>
    row.id === 'i1' ? { ...row, document: '/reports/week.md', documentPreview: 'Weekly report' } : row,
  )
  state.heard = { ...state.heard, startAt: 1 }
  state.presence = { ...state.presence, turnsStarted: 1, turnsApplied: 1 }
  const report =
    '# Weekly report\n\n' +
    'Read [release notes](https://example.com/release).\n\n' +
    'Unsafe [script](javascript:alert(1)) and [local file](file:///tmp/report).\n\n' +
    '<script>window.wasExecuted = true</script>\n\n' +
    '<hr>\n\n' +
    '![tracking](https://example.com/pixel.png)\n\n' +
    Array.from({ length: 30 }, (_, n) => `Paragraph ${n}`).join('\n\n')
  const browser = new Window({
    url: 'https://inbox.test/',
    settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true },
  })
  let documentReads = 0
  let rowPresses = 0
  const openedLinks: string[] = []
  const view = {
    ...viewOf(state, Date.now(), NO_HOLDS),
    thread: 'document-reader',
    devPage: 'document-reader-page',
    serverBuild: SERVER_BUILD,
    isFetchingPrs: false,
    isGhMissing: false,
  }
  browser.parent.postMessage = message => {
    const request = message as {
      id?: number
      method?: string
      params?: { name?: string; arguments?: { document?: string }; url?: string }
    }
    if (request.id === undefined) return
    let result: unknown
    let error: { code: number; message: string } | undefined
    if (request.method === 'ui/initialize') result = {}
    else if (request.method === 'ui/open-link') {
      openedLinks.push(request.params?.url ?? '')
      error = { code: -1, message: 'Blocked' }
    } else if (request.params?.name === 'inbox_view' && request.params.arguments?.document) {
      documentReads++
      result = { structuredContent: { text: report } }
    } else if (request.params?.name === 'inbox_view') result = { structuredContent: view }
    else if (request.params?.name === 'inbox_press') {
      rowPresses++
      throw new Error('Reading a report must not record a row press.')
    } else throw new Error(`Unexpected request: ${request.method} ${request.params?.name ?? ''}`)
    queueMicrotask(() =>
      browser.dispatchEvent(
        new browser.MessageEvent('message', {
          data: { jsonrpc: '2.0', id: request.id, result, ...(error ? { error } : {}) },
        }),
      ),
    )
  }

  const wait = (ms = 0) => new Promise<void>(resolve => setTimeout(resolve, ms))
  const until = async (ready: () => boolean) => {
    for (let n = 0; n < 80 && !ready(); n++) await wait(10)
    assert.ok(ready())
  }
  const button = (label: string) =>
    [...browser.document.querySelectorAll('button')].find(b => b.textContent?.includes(label))
  try {
    browser.document.write(TAB_HTML)
    await until(() => button('Read report') !== undefined)
    button('Read report')!.click()
    await until(() => browser.document.querySelector('.document-reader') !== null)
    const reader = browser.document.querySelector('.document-reader')!
    await until(() => browser.document.activeElement === reader)
    assert.equal(reader.querySelector('h1')?.textContent, 'Check the build')
    const reportLink = reader.querySelector('.body a')!
    assert.equal(reportLink.textContent, 'release notes')
    reportLink.dispatchEvent(new browser.MouseEvent('click', { bubbles: true }))
    await until(() => reader.querySelector('.body a') === null)
    assert.deepEqual(openedLinks, ['https://example.com/release'])
    assert.match(reader.querySelector('.body')?.textContent ?? '', /release notes \(https:\/\/example\.com\/release\)/)
    assert.equal(documentReads, 1)
    assert.match(browser.document.querySelector('#inbox-style')?.textContent ?? '', /overflow: auto/)
    const scrolls: number[] = []
    Object.defineProperty(reader, 'scrollBy', { value: ({ top }: { top: number }) => scrolls.push(top) })
    for (const key of ['j', 'ArrowDown', 'k', 'ArrowUp'])
      reader.dispatchEvent(new browser.KeyboardEvent('keydown', { key, bubbles: true }))
    assert.deepEqual(scrolls, [40, 40, -40, -40])

    browser.document.body.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'b', bubbles: true }))
    await until(() => browser.document.querySelector('.document-reader') === null)
    browser.document.body.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'v', bubbles: true }))
    await until(() => browser.document.querySelector('.document-reader') !== null)
    browser.document.body.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await until(() => browser.document.querySelector('.document-reader') === null)
    browser.document.body.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'v', bubbles: true }))
    await until(() => browser.document.querySelector('.document-reader') !== null)
    button('Back to inbox')!.click()
    await until(() => browser.document.querySelector('.document-reader') === null)
    assert.equal(documentReads, 3)
    assert.equal(rowPresses, 0)
  } finally {
    await browser.happyDOM.close()
  }
})

test('the Codex reader renders sanitized Markdown with only safe HTTPS links', async () => {
  const browser = new JSDOM('<div id="app"></div>', { url: 'https://inbox.test/' }).window
  const globals = globalThis as typeof globalThis & { parent?: typeof browser }
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    parent: globals.parent,
    AbortController: globalThis.AbortController,
    Element: globalThis.Element,
  }
  const openedLinks: string[] = []
  Object.assign(globalThis, {
    window: browser,
    document: browser.document,
    parent: browser.parent,
    AbortController: browser.AbortController,
    Element: browser.Element,
  })
  browser.parent.postMessage = message => {
    const sent = message as { id: number; method: string; params: { url: string } }
    openedLinks.push(sent.params.url)
    queueMicrotask(() =>
      browser.dispatchEvent(
        new browser.MessageEvent('message', {
          data: { jsonrpc: '2.0', id: sent.id, error: { code: -1, message: 'Blocked' } },
        }),
      ),
    )
  }

  const root = browser.document.getElementById('app')!
  try {
    const { DocumentReader } = await import('../src/tab-document')
    render(
      h(DocumentReader, {
        document: {
          title: 'Weekly report',
          text:
            '# Weekly report\n\n' +
            'Read [release notes](https://example.com/release).\n\n' +
            'Unsafe [script](javascript:alert(1)) and [local file](file:///tmp/report).\n\n' +
            '<script>window.wasExecuted = true</script>\n\n' +
            '<hr>\n\n' +
            '![tracking](https://example.com/pixel.png)',
          error: null,
        },
        close: () => {},
      }),
      root,
    )
    const body = root.querySelector('.body')!
    assert.equal(root.querySelector('.body h1')?.textContent, 'Weekly report')
    assert.equal(root.querySelector('.body script, .body img, .body hr'), null)
    assert.match(body.textContent ?? '', /<hr>/)
    assert.equal(body.querySelector('a')?.textContent, 'release notes')
    assert.equal(body.querySelector('a')?.getAttribute('href'), 'https://example.com/release')
    assert.equal(body.querySelectorAll('a').length, 1)
    assert.match(body.textContent ?? '', /release notes/)
    assert.match(body.textContent ?? '', /script and local file/)
    assert.doesNotMatch(body.textContent ?? '', /javascript:|file:\/\//)
    body.querySelector('a')!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.deepEqual(openedLinks, ['https://example.com/release'])
    assert.equal(body.querySelector('a'), null)
    assert.match(body.textContent ?? '', /release notes \(https:\/\/example\.com\/release\)/)
    assert.equal((browser as unknown as { wasExecuted?: boolean }).wasExecuted, undefined)
  } finally {
    render(null, root)
    Object.assign(globalThis, previous)
    browser.close()
  }
})
