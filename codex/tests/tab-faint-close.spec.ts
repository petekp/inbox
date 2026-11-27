import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FAINT_OPACITY, LEAVE_FADE_MS } from '../../core/view/row-motion'
import { FRAME_MS } from '../../core/view/springs'
import { inTab } from './tab-harness'

test('a row closed again while its turned-back panel is faint steps the panel down at once and shrinks without waiting for its fade', async context => {
  await inTab(async ({ moves, fades, settle, after }) => {
    await import('../src/tab')
    const { read } = await import('../src/tab-ui')
    await settle()
    await read()
    await settle()
    await after(600)
    const rowOf = (id: string) => {
      const row = Array.from(document.querySelectorAll<HTMLElement>('[data-motion]')).find(e =>
        e.dataset.motion?.includes(id),
      )
      if (!row) throw new Error(`no row for ${id}`)
      return row
    }
    const press = async (id: string) => {
      const line = rowOf(id).querySelector<HTMLElement>('button.line')
      if (!line) throw new Error(`row ${id} has no line button`)
      line.click()
      await settle()
    }
    await press('i1')
    await after(LEAVE_FADE_MS + 40)
    await press('i1')
    await after(FRAME_MS * 2)
    fades.length = 0
    moves.length = 0
    await press('i1')
    const panelFades = fades.filter(f => f.el.closest('.panel') && rowOf('i1').contains(f.el))
    const fadesOut = panelFades.filter(f => f.to === 0)
    assert.ok(
      fadesOut.length > 0 &&
        fadesOut.every(f => f.from <= FAINT_OPACITY && f.delay === 0 && f.duration === LEAVE_FADE_MS),
      `the faint panel does not fade out at once from faint: ${JSON.stringify(panelFades.map(({ from, to, delay, duration }) => ({ from, to, delay, duration })))}`,
    )
    const shrinks = moves.filter(m => m.key.includes('i1'))
    assert.ok(shrinks.length > 0, 'closing i1 started no glide')
    for (const m of shrinks) assert.equal(m.delay, 0, `${m.key} waits ${m.delay} ms for the panel to fade`)
  }, context)
})
