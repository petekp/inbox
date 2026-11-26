import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { CLAUDE_CODE } from '../core/domain/model-text'
import { EMPTY } from '../core/domain/ledger'
import { closeItem } from '../core/domain/ledger-close'
import { NO_SESSION_PRS } from '../core/domain/help-steps'
import { TOOL_FIELDS } from '../core/domain/tool-schemas'
import { PREVIEW_PAGE_KEEP_MS, previewPlace, withPreviewPages, writePreviewPages } from '../core/runtime/preview-pages'
import type { PreviewFiles } from '../core/runtime/preview-pages'
import { recordItem } from '../core/runtime/tools'
import { rowKeyPlan } from '../core/view/action-plan'
import { applyPress } from '../core/view/press-reducer'
import { emptySession } from '../core/view/session-files'
import { sessionView } from '../core/view/session-view'
import { SETTLED_MS } from '../core/view/timing'

const glass = {
  kind: 'question',
  ask: 'Which glass look should the cards use?',
  options: ['Clear', 'Tinted', 'Frosted'],
  rec: 'Tinted',
  why: 'it reads on light and dark',
  option_notes: ['No tint', 'A blue tint', 'Blurred'],
  previews: ['/work/clear.png', 'https://example.com/tinted.png', 'tinted.png'],
  steps: ['/work/clear.png', '/work/notes.md'],
}

const recorded = () => recordItem(CLAUDE_CODE, { ...EMPTY, turn: 1 }, glass, 1000, TOOL_FIELDS)

function memoryFiles(start: Record<string, string>, changedAt: Record<string, number> = {}, firstListAwaits = '') {
  const saved = new Map(Object.entries(start))
  let isFirstList = firstListAwaits !== ''
  const files: PreviewFiles = {
    list: async folder => {
      if (isFirstList) {
        isFirstList = false
        for (let turn = 0; turn < 100 && !saved.has(firstListAwaits); turn++) await Promise.resolve()
      }
      return [...saved.keys()]
        .filter(p => p.startsWith(`${folder}/`))
        .map(p => ({ name: p.slice(folder.length + 1), mtimeMs: changedAt[p] ?? 2000 }))
    },
    read: async path => saved.get(path) ?? null,
    write: async (path, text) => void saved.set(path, text),
    remove: async path => void saved.delete(path),
  }

  return { files, saved }
}

test("a question's previews keep to their options, one that is not a path or https link is left out, a step that opens one leaves the steps, and a record of it again says it gave them", () => {
  const r = recorded()
  expect(r.result).toContain('Some previews were not an absolute file path or an https link, so they are left out.')
  const item = r.ledger.items[0]
  expect(item?.optionPreviews).toEqual({ Clear: '/work/clear.png', Tinted: 'https://example.com/tinted.png' })
  expect(item?.helps.map(h => (h.kind === 'open' ? h.path : h.kind))).toEqual(['/work/notes.md'])

  const again = recordItem(
    CLAUDE_CODE,
    r.ledger,
    { kind: 'question', ask: glass.ask, options: ['Frosted', 'Clear', 'Tinted'], previews: ['/work/frosted.png'] },
    1100,
    TOOL_FIELDS,
  )
  expect(again.result).toBe('Already open, so this record updated it and gave its options your previews.')
  expect(again.ledger.items[0]?.optionPreviews).toEqual({
    Clear: '/work/clear.png',
    Tinted: 'https://example.com/tinted.png',
    Frosted: '/work/frosted.png',
  })
})

test('the host writes a question’s previews page from the comparison template, removes its pages for rows no longer open, and the row opens it with o after its answers', async () => {
  const place = previewPlace({ XDG_STATE_HOME: '/state', HOME: '/home/me' }, 'claude-code', 'abc-123')
  if (!place) throw new Error('a state folder gives a place for previews pages')
  const s = withPreviewPages({ ...emptySession(), ledger: recorded().ledger }, place)
  const page = '/state/inbox/previews/claude-code-abc-123-i1.html'
  expect(s.ledger.items[0]?.previewPage).toBe(page)

  const stale = '/state/inbox/previews/claude-code-abc-123-i9.html'
  const otherSession = '/state/inbox/previews/claude-code-other-i1.html'
  const { files, saved } = memoryFiles({ '/plugin/compare-page.html': '<template>', [stale]: 'x', [otherSession]: 'y' })
  await writePreviewPages(files, place, s.ledger, '/plugin/compare-page.html', 3000)
  const text = saved.get(page) ?? ''
  expect(text.startsWith('<template>')).toBe(true)
  expect(JSON.parse(text.slice('<template>'.length))).toEqual({
    question: glass.ask,
    context: '',
    pick: 'Tinted',
    reason: 'it reads on light and dark',
    choices: [
      { name: 'Tinted', summary: 'A blue tint', preview: 'https://example.com/tinted.png' },
      { name: 'Clear', summary: 'No tint', preview: '/work/clear.png' },
      { name: 'Frosted', summary: 'Blurred', preview: '' },
    ],
  })
  expect([saved.has(stale), saved.has(otherSession)]).toEqual([false, true])

  const row = sessionView(s, 2000, SETTLED_MS).needsYou.questions[0]
  if (!row) throw new Error('the question is drawn')
  const keys = rowKeyPlan(row, true).keys.map(k =>
    k.slot === 'action' || k.slot === 'choice' ? [k.action.label, k.action.kind, k.hotkey] : null,
  )
  expect(keys).toEqual([
    ['Open previews', 'local', 'o'],
    ['Open notes.md', 'local', 'f'],
  ])
  const pressed = applyPress(
    s.ledger,
    undefined,
    { action: 'previews', id: 'i1' },
    {
      now: 3000,
      turnsStarted: 1,
      holdMs: 1000,
      sessionPrs: NO_SESSION_PRS,
      comparePage: '/plugin/compare-page.html',
      compareInBackground: true,
    },
  )
  if ('stale' in pressed) throw new Error('the press finds its row')
  expect(pressed.effects).toEqual([{ kind: 'open', target: page, name: 'previews' }])

  const unplaced = withPreviewPages(s, null)
  const plain = sessionView(unplaced, 2000, SETTLED_MS).needsYou.questions[0]
  expect(plain?.actions.some(a => a.press.action === 'previews')).toBe(false)
})

test('a closed question keeps its page for Undo until it ages out, a page no session changed in that time is removed, and overlapping writes keep each page', async () => {
  const place = previewPlace({ XDG_STATE_HOME: '/state' }, 'codex', 's1')
  if (!place) throw new Error('a state folder gives a place for previews pages')
  const opened = withPreviewPages({ ...emptySession(), ledger: recorded().ledger }, place).ledger
  const page = '/state/inbox/previews/codex-s1-i1.html'
  const ended = '/state/inbox/previews/omp-old-i4.html'
  const closed = closeItem(opened, 'i1', { outcome: 'Tinted', how: 'answered' }, 5000)
  const template = '/plugin/compare-page.html'
  const { files, saved } = memoryFiles({ [template]: '<template>', [page]: 'x', [ended]: 'y' }, { [ended]: 4000 })

  await writePreviewPages(files, place, closed, template, 6000)
  expect([saved.has(page), saved.has(ended)]).toEqual([true, true])
  await writePreviewPages(files, place, closed, template, 5000 + PREVIEW_PAGE_KEEP_MS)
  expect([saved.has(page), saved.has(ended)]).toEqual([false, false])

  const second = recordItem(
    CLAUDE_CODE,
    opened,
    { kind: 'question', ask: 'Which frame?', options: ['Frosted', 'Clear'], previews: ['/f.png', '/c.png'] },
    1200,
    TOOL_FIELDS,
  )
  const both = withPreviewPages({ ...emptySession(), ledger: second.ledger }, place).ledger
  const secondPage = '/state/inbox/previews/codex-s1-i2.html'
  const racing = memoryFiles({ [template]: '<template>' }, {}, secondPage)
  await Promise.all([
    writePreviewPages(racing.files, place, opened, template, 7000),
    writePreviewPages(racing.files, place, both, template, 7000),
  ])
  expect([racing.saved.has(page), racing.saved.has(secondPage)]).toEqual([true, true])
})

test('an approval whose options have previews is not asked for a screenshot step', () => {
  const approval = {
    kind: 'question',
    ask: 'Ship this header?',
    options: ['Yes', 'No'],
    previews: ['/work/header.png', ''],
    steps: ['/work/header.png'],
  }
  const r = recordItem(CLAUDE_CODE, EMPTY, approval, 1000, TOOL_FIELDS)
  expect(r.result).not.toContain("can't approve")
  const again = recordItem(CLAUDE_CODE, r.ledger, approval, 1100, TOOL_FIELDS)
  expect(again.result).not.toContain('added its new steps')
})
