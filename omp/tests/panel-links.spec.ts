import { expect, test } from 'bun:test'
import { hyperlinkTools, panelLink } from '../src/host'
import { cutTitle, fit, linkedText, spread, visibleLength } from '../src/panel-text'
import { INITIAL_UI, drawPanel } from '../src/panel'
import { handleKey } from '../src/panel-keys'
import { drawLine } from '../src/panel-draw'
import { blankLine } from '../src/panel-lines'
import { indentedLinks } from '../src/panel-text'
import { NOW, screenOf, style, strip } from './panel-harness'

test('fits real omp OSC 8 links at narrow and wide panel widths', async () => {
  const { applyHyperlinkSetting, urlHyperlink } = await hyperlinkTools()
  applyHyperlinkSetting('always')
  const url = 'https://github.com/anthropics/claude-code/pull/7171'
  const link = linkedText('Read [PR 7171](' + url + ')', urlHyperlink)
  expect(link).toContain('\x1b]8;id=')
  expect(visibleLength(link)).toBe('Read PR 7171'.length)

  const narrow = cutTitle(linkedText('[Very long PR 7171](' + url + ')', urlHyperlink), 12)
  expect(visibleLength(narrow)).toBeLessThanOrEqual(12)
  expect(narrow).toMatch(/\x1b\]8;;\x1b\\…$/)
  const fitted = fit(link, 8)
  expect(visibleLength(fitted)).toBeLessThanOrEqual(8)
  expect(fitted).toContain('\x1b]8;;\x1b\\')
  expect(visibleLength(spread(link, '12m ago ', 80))).toBe(80)
  applyHyperlinkSetting('auto')
})

test('opening the panel survives an omp build without the hyperlink subpath', async () => {
  expect(await panelLink(async () => Promise.reject(new Error('missing render subpath')))).toBeUndefined()
})

test('selected item explanations preserve paragraphs, links, and scroll at width 42', async () => {
  const { applyHyperlinkSetting, urlHyperlink } = await hyperlinkTools()
  applyHyperlinkSetting('always')
  try {
    const source = screenOf()
    const row = source.view.needsYou.questions.find(item => item.state.is === 'open')!
    const detail =
      'Read [launch](https://x.io/release).\n\nSee [release notes](https://x.io/release).\n\nThe final consequence remains visible.'
    const screen = {
      ...source,
      view: {
        ...source.view,
        needsYou: {
          ...source.view.needsYou,
          questions: source.view.needsYou.questions.map(item => (item.id === row.id ? { ...item, detail } : item)),
        },
      },
    }
    const ui = { ...INITIAL_UI, selectedId: row.id }
    const drawn = drawPanel(screen, ui, 42, NOW, { ...style, link: urlHyperlink }, 14)
    const lines = drawn.lines.map(strip)
    const paragraphs = indentedLinks(detail, 2, 42, Infinity, text => text)
    expect(drawn.lines.join('\n')).toContain('\x1b]8;id=')
    expect(lines.every(line => visibleLength(line) <= 42)).toBe(true)
    expect(lines.join('\n')).toContain('↑↓ scroll')
    expect(paragraphs.filter(line => line.trim() === '')).toHaveLength(2)
    expect(handleKey(screen, { ...ui, detailScrollMax: drawn.detailScrollMax }, 'down', NOW).ui.detailTop).toBe(1)
    const bottom = drawPanel(
      screen,
      { ...ui, detailTop: drawn.detailScrollMax, detailScrollMax: drawn.detailScrollMax },
      42,
      NOW,
      { ...style, link: urlHyperlink },
      14,
    )
    expect(bottom.lines.map(strip).join(' ').replace(/\s+/g, ' ')).toContain('The final consequence remains visible.')
  } finally {
    applyHyperlinkSetting('auto')
  }
})

test('finding titles and details draw real OSC 8 links', async () => {
  const { applyHyperlinkSetting, urlHyperlink } = await hyperlinkTools()
  applyHyperlinkSetting('always')
  try {
    const source = screenOf()
    const row = source.view.findings.rows[0]!
    const screen = {
      ...source,
      view: {
        ...source.view,
        findings: {
          ...source.view.findings,
          rows: source.view.findings.rows.map(item =>
            item.id === row.id
              ? {
                  ...item,
                  title: 'Read [PR 7171](https://github.com/anthropics/claude-code/pull/7171)',
                  detail: 'See [release notes](https://example.com/release).',
                }
              : item,
          ),
        },
      },
    }
    const drawn = drawPanel(screen, { ...INITIAL_UI, tab: 'findings', selectedId: row.id }, 42, NOW, {
      ...style,
      link: urlHyperlink,
    })
    const output = drawn.lines.join('\n')
    const plain = drawn.lines.map(strip).join('\n')

    expect(output).toContain('\x1b]8;id=')
    expect(output).toContain('https://github.com/anthropics/claude-code/pull/7171')
    expect(output).toContain('https://example.com/release')
    expect(plain).toContain('Read PR 7171')
    expect(plain).toContain('See release notes')
  } finally {
    applyHyperlinkSetting('auto')
  }
})

test('option feedback and outcomes draw real OSC 8 links', async () => {
  const { applyHyperlinkSetting, urlHyperlink } = await hyperlinkTools()
  applyHyperlinkSetting('always')
  try {
    const option = '[PR 7171](https://github.com/anthropics/claude-code/pull/7171)'
    const source = screenOf()
    const draw = { screen: source, ui: INITIAL_UI, width: 80, now: NOW, style: { ...style, link: urlHyperlink } }
    const feedback = blankLine('i1')
    feedback.title = 'Merge this PR?'
    feedback.feedback = { text: `✓ ${option}`, tone: 'done', source: null }
    const settled = blankLine('i1')
    settled.title = 'Merge this PR?'
    settled.settled = { label: option, tone: 'done', undo: null, at: NOW }
    const lines = [...drawLine(feedback, false, draw), ...drawLine(settled, false, draw)]

    expect(lines.join('\n').match(/\x1b\]8;id=/g)).toHaveLength(2)
    expect(lines.join('\n')).toContain('https://github.com/anthropics/claude-code/pull/7171')
    expect(lines.map(strip).join('\n')).toContain('✓ PR 7171')
  } finally {
    applyHyperlinkSetting('auto')
  }
})

test('omp shows the recorded Markdown excerpt under its item', () => {
  const source = screenOf()
  const row = source.view.needsYou.questions.find(item => item.state.is === 'open')!
  const screen = {
    ...source,
    view: {
      ...source.view,
      needsYou: {
        ...source.view.needsYou,
        questions: source.view.needsYou.questions.map(item =>
          item.id === row.id
            ? { ...item, document: '/reports/rollout.md', documentPreview: '# One region first.' }
            : item,
        ),
      },
    },
  }
  const drawn = drawPanel(screen, { ...INITIAL_UI, selectedId: row.id }, 80, NOW, style, 20)

  expect(drawn.lines.map(strip).join('\n')).toContain('Report preview: # One region first.')
})
