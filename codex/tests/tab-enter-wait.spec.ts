import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ENTER_FADE_MS, FAINT_OPACITY, LEAVE_FADE_MS, ROW_STATE_MS } from '../../core/view/row-motion'
import { FRAME_MS } from '../../core/view/springs'
import TAB_HTML from '../src/tab.html'
import { EMPTY_SESSION_STATUS } from '../../core/domain/status-limits'
import { inTab, item, opacityNow } from './tab-harness'

test('a row that enters while another leaves keeps the rest of its wait and its edge scaling when a redraw lands 40 or 80 ms into the wait or 60 ms into the growth, so the list never grows before it shrinks; a row the person opens grows once the panel of the row it closes has faded out, and fades its own panel in once its space is nearly open, a close they turn back fades its panel back from where it is, at once, held faint while its row regrows from a shrink, a moving row’s title keeps the closed row’s weight in both its forms and fades with its full title only while its line rests, and a dismissed open row draws only its settled line', async context => {
  await inTab(async ({ state, moves, lineRests, fades, settle, after }) => {
    await import('../src/tab')
    const { read } = await import('../src/tab-ui')
    await settle()
    let last = item('i2', 'Tag the release', 2)
    for (const [n, redrawAtMs] of [40, 80, 180].entries()) {
      const arriving = item(`i${3 + n}`, `Reply to review ${n}`, 3 + n)
      state.ledger = { ...state.ledger, items: [item('i1', 'Check the build', 1), arriving] }
      moves.length = 0
      const readAt = Date.now()
      await read()
      await settle()
      const shrinksAt = readAt + LEAVE_FADE_MS
      const growth = () => moves.filter(m => m.key.includes(arriving.id))
      assert.ok(growth().length > 0, `${arriving.id} does not grow: ${JSON.stringify(moves)}`)
      assert.ok(growth().every(m => m.startsAt >= shrinksAt - 2))
      moves.length = 0
      await after(redrawAtMs)
      await read()
      await settle()
      assert.ok(growth().length > 0, `the redraw ${redrawAtMs} ms in restarted no glide of ${arriving.id}`)
      for (const m of growth()) assert.ok(m.scalesEdges, `${m.key} restarts without scaling its padding and margin`)
      for (const m of growth())
        assert.ok(m.startsAt >= shrinksAt - 2, `${m.key} grows ${shrinksAt - m.startsAt} ms before ${last.id} shrinks`)
      await after(ROW_STATE_MS.leaving + 200)
      last = arriving
    }
    const pressed = item('i9', 'Update the changelog', 9)
    const subject = {
      id: 's1',
      name: 'Changelog',
      status: 'working' as const,
      text: 'notes for the release',
      was: null,
      merged: null,
      createdAt: 1,
      changedAt: 1,
      closedAt: null,
      into: null,
    }
    state.ledger = {
      ...state.ledger,
      overview: { ...EMPTY_SESSION_STATUS, subjects: [subject], askSubjects: { [pressed.id]: [subject.id] } },
      items: [item('i1', 'Check the build', 1), pressed],
    }
    await read()
    await settle()
    await after(40)
    moves.length = 0
    fades.length = 0
    const rowOf = (id: string) =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-motion]')).find(e => e.dataset.motion?.includes(id))!
    const press = async (id: string) => {
      rowOf(id).querySelector<HTMLElement>('button.line')!.click()
      await settle()
    }
    const panelFades = (id: string) =>
      fades
        .filter(f => f.el.closest('.panel') && rowOf(id).contains(f.el))
        .map(({ from, to, delay }) => ({ from, to, delay }))
    const pressedAt = Date.now()
    await press(pressed.id)
    const titleForms = (id: string, at: number) =>
      (['.text.short', '.text:not(.short)'] as const).map(form => {
        const el = rowOf(id).querySelector<HTMLElement>(`.line > ${form}`)
        const shown = opacityNow(
          fades.findLast(f => f.el === el),
          at,
        )
        return shown ?? (form === '.text.short' ? 0 : 1)
      })
    const bothFormsAt = (id: string) =>
      Array.from(
        { length: Math.floor((ROW_STATE_MS.opening + ENTER_FADE_MS) / FRAME_MS) + 1 },
        (_, n) => n * FRAME_MS,
      ).filter(t => {
        const [short, full] = titleForms(id, pressedAt + t)
        return short! >= 0.02 && full! >= 0.02
      })
    const closingBoth = bothFormsAt('i1')
    assert.ok(
      closingBoth.every(t => t <= LEAVE_FADE_MS),
      `i1 shows both title forms after its line holds: ${closingBoth}`,
    )
    const openingBoth = bothFormsAt(pressed.id)
    const lineRestsAt = [...lineRests].find(([key]) => key.includes(pressed.id))?.[1]
    assert.ok(lineRestsAt !== undefined, `${pressed.id}'s line does not grow`)
    assert.ok(
      openingBoth.length > 0 &&
        openingBoth.every(t => pressedAt + t >= lineRestsAt - FRAME_MS) &&
        (openingBoth.at(-1) ?? 0) - (openingBoth[0] ?? 0) <= ENTER_FADE_MS,
      `${pressed.id} shows both title forms outside one fade after its line rests at ${lineRestsAt - pressedAt}: ${openingBoth}`,
    )
    const closingShort = titleForms('i1', pressedAt + LEAVE_FADE_MS / 2)[0]!
    assert.ok(closingShort > 0.02 && closingShort < 0.98, `the closing title swaps in one frame: ${closingShort}`)
    assert.deepEqual(titleForms('i1', pressedAt), [0, 1], 'the closing title does not start from its full form')
    assert.deepEqual(
      titleForms('i1', pressedAt + LEAVE_FADE_MS),
      [1, 0],
      'the closing title has not faded to its closed form',
    )
    assert.deepEqual(titleForms(pressed.id, pressedAt + ROW_STATE_MS.opening + ENTER_FADE_MS), [0, 1])
    const shrinks = moves.filter(m => m.key.includes('i1'))
    assert.ok(shrinks.length > 0, 'closing i1 started no glide')
    for (const m of shrinks)
      assert.ok(m.delay >= LEAVE_FADE_MS, `${m.key} shrinks ${m.delay} ms in, before its panel fades`)
    assert.ok(
      panelFades('i1').some(f => f.from === 1 && f.to === 0 && f.delay === 0),
      `the closing panel does not fade out at once: ${JSON.stringify(panelFades('i1'))}`,
    )
    const opens = moves.filter(m => m.key.includes(pressed.id))
    assert.ok(opens.length > 0, `pressing ${pressed.id} started no glide`)
    for (const m of opens)
      assert.ok(
        Math.abs(m.delay - LEAVE_FADE_MS) < 1,
        `${m.key} waits ${m.delay} ms, not until the closing panel fades`,
      )
    const shows = panelFades(pressed.id)
    assert.ok(
      shows.some(f => f.from === 0 && f.to === 1 && f.delay > LEAVE_FADE_MS),
      `the opened panel does not wait for its space: ${JSON.stringify(shows)}`,
    )
    const style = document.createElement('style')
    style.textContent = [...TAB_HTML.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n')
    document.head.append(style)
    await after(ROW_STATE_MS.closing + 50)
    const weightOf = (from: ParentNode, selector: string) => {
      const el = from.querySelector<HTMLElement>(selector)
      if (!el) throw new Error(`no ${selector}`)
      return getComputedStyle(el).fontWeight
    }
    const closedWeight = weightOf(rowOf('i1'), '.row.collapsed:not(.closing) .line .text')
    await press('i1')
    assert.equal(weightOf(rowOf('i1'), '.row.selected .line .text:not(.short)'), closedWeight)
    assert.equal(weightOf(rowOf('i1'), '.row.selected .line .text.short'), closedWeight)
    assert.equal(weightOf(rowOf(pressed.id), '.row.closing .line .text:not(.short)'), closedWeight)
    assert.equal(weightOf(rowOf(pressed.id), '.row.closing .line .text.short'), closedWeight)
    const fadesOut = () => fades.filter(f => f.to === 0 && f.el.closest('.panel') && rowOf(pressed.id).contains(f.el))
    const stillFadingOut = () => fadesOut().filter(f => f.anim.playState !== 'idle').length
    for (const turnsBackAtMs of [60, 0]) {
      await after(turnsBackAtMs)
      assert.ok(fadesOut().length > 0, `closing ${pressed.id} faded no panel out`)
      fades.splice(0, fades.length, ...fadesOut())
      await press(pressed.id)
      assert.deepEqual(
        panelFades(pressed.id).filter(f => f.from === 0),
        [],
        `a close the person turned back ${turnsBackAtMs} ms in fades its panel in again from nothing`,
      )
      assert.equal(stillFadingOut(), 0, `a close turned back ${turnsBackAtMs} ms in leaves its panel fading out`)
      if (turnsBackAtMs)
        assert.ok(
          panelFades(pressed.id).some(f => f.from > 0 && f.from < 1 && f.to === 1),
          `a close turned back ${turnsBackAtMs} ms in does not fade its panel back from what it shows`,
        )
      await after(ROW_STATE_MS.opening + 50)
      fades.length = 0
      if (turnsBackAtMs) await press('i1')
    }
    await press(pressed.id)
    await after(LEAVE_FADE_MS + 40)
    fades.length = 0
    await press(pressed.id)
    const lateFades = () =>
      fades.filter(
        f => f.el.closest('.panel') && !f.el.matches('.holds-up') && rowOf(pressed.id).contains(f.el) && f.to > 0,
      )
    const dims = lateFades()
    assert.ok(
      dims.length > 0 && dims.every(f => f.delay === 0 && f.to === FAINT_OPACITY),
      `a close turned back once its row began to shrink does not fade its panel at once to a faint opacity: ${JSON.stringify(dims.map(({ to, delay }) => ({ to, delay })))}`,
    )
    await after(Math.max(...dims.map(f => f.duration)) + FRAME_MS)
    const holds = lateFades().filter(f => f.from === FAINT_OPACITY && f.to === FAINT_OPACITY)
    await after(Math.max(0, ...holds.map(f => f.duration)) + FRAME_MS)
    assert.ok(
      lateFades().every(f => f.to <= FAINT_OPACITY || f.from === FAINT_OPACITY),
      'a turned-back panel fades past faint before its space is nearly open',
    )
    assert.ok(
      lateFades().some(f => f.from === FAINT_OPACITY && f.to === 1),
      'a turned-back panel held faint does not fade on to full once its space is nearly open',
    )
    await after(ROW_STATE_MS.opening + 50)
    fades.length = 0
    assert.ok(
      rowOf(pressed.id).querySelector('.panel .branch.holds-up') !== null,
      `${pressed.id} draws no Holds up line`,
    )
    const third = item('i7', 'Answer the review', 7)
    state.ledger = { ...state.ledger, items: [...state.ledger.items, third] }
    await read()
    await settle()
    await after(ROW_STATE_MS.entering + 200)
    const opensNow = async (id: string, what: string) => {
      moves.length = 0
      await press(id)
      const opens = moves.filter(m => m.key.includes(id))
      assert.ok(opens.length > 0, `pressing ${id} started no glide`)
      for (const m of opens) assert.equal(m.delay, 0, `${m.key} waits ${m.delay} ms after ${what}`)
    }
    await press('i1')
    const i1Shows = panelFades('i1').find(f => f.from === 0 && f.to === 1)
    assert.ok(i1Shows && i1Shows.delay >= LEAVE_FADE_MS, `i1's panel shows too soon: ${JSON.stringify(i1Shows)}`)
    await after(LEAVE_FADE_MS)
    await press(pressed.id)
    await opensNow(third.id, 'the close of a turned-back row whose panel shows nothing yet')
    await after(ROW_STATE_MS.closing + 50)
    await press('i1')
    await after(60)
    await press(third.id)
    const arriving = item('i8', 'Rerun the checks', 8)
    state.ledger = { ...state.ledger, items: [...state.ledger.items, arriving] }
    moves.length = 0
    await after(20)
    await read()
    await settle()
    const grows = moves.filter(m => m.key.includes(arriving.id))
    assert.ok(grows.length > 0, `${arriving.id} does not grow`)
    for (const m of grows) assert.equal(m.delay, 0, `${m.key} waits ${m.delay} ms for a close that was turned back`)
    await after(ROW_STATE_MS.opening + 50)
    const dismissed = {
      id: pressed.id,
      kind: pressed.kind,
      ask: pressed.ask,
      outcome: 'dismissed',
      how: 'dismissed' as const,
    }
    state.ledger = {
      ...state.ledger,
      items: [item('i1', 'Check the build', 1), third, arriving],
      closed: [...state.ledger.closed, { ...dismissed, at: Date.now(), item: pressed }],
    }
    await read()
    await settle()
    assert.ok(rowOf(pressed.id).querySelector('.row.settled') !== null, 'the dismissed row does not settle in place')
    assert.ok(rowOf(pressed.id).querySelector('.panel') === null, 'the dismissed row still draws its panel')
  }, context)
})
