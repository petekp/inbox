import { expect, test } from 'bun:test'

import type { Stop } from '../../types'
import { SETTLED_MS } from '../../hooks/view'
import { sessionView } from '../../hooks/session'
import { INITIAL_UI, bandLines, render } from '../src/panel'
import type { PanelScreen } from '../src/panel'
import { handleKey } from '../src/panel-keys'
import { emptyState } from '../src/state'
import { drawn, firstQuestion, NOW, onRow, screenOf, strip, style, text } from './panel-harness'

test('the footer names the inbox model, or says there is none', () => {
  expect(text(screenOf(), INITIAL_UI)).toContain('inbox model Claude Sonnet 4.5')
  expect(text(screenOf({ modelName: null }), INITIAL_UI)).toContain('no inbox model: set @inbox')
})

test('the footer puts the inbox model on its own line when it does not fit beside the hints', () => {
  const lastLines = (screen: PanelScreen, width: number) => drawn(screen, INITIAL_UI, width).map(strip).slice(-2)
  const [hints, named] = lastLines(screenOf(), 60)
  expect(hints).toContain('tab switch')
  expect(named).toContain('inbox model Claude Sonnet 4.5')
  const [, none] = lastLines(screenOf({ modelName: null }), 48)
  expect(none).toContain('no inbox model: set @inbox')
})

test('the footer shows the version after the inbox model, beside the hints or on the model’s own line', () => {
  const lastLines = (width: number) => drawn(screenOf(), INITIAL_UI, width).map(strip).slice(-2)
  const [, wide] = lastLines(140)
  expect(wide).toContain('tab switch')
  expect(wide?.trimEnd()).toEndWith('inbox model Claude Sonnet 4.5  v1.2.3')
  const [hints, named] = lastLines(60)
  expect(hints).not.toContain('v1.2.3')
  expect(named?.trimEnd()).toEndWith('inbox model Claude Sonnet 4.5  v1.2.3')
  const [, marked] = drawn(screenOf({ isNextBuild: true }), INITIAL_UI, 140)
    .map(strip)
    .slice(-2)
  expect(marked?.trimEnd()).toEndWith('inbox model Claude Sonnet 4.5  v1.2.3 · next')
})

test('the demo says its presses send nothing', () => {
  expect(text(screenOf({ isDemo: true }), INITIAL_UI)).toContain('Buttons here send nothing.')
})

test('the band shows both counts with their labels at full brightness, and how to open the inbox', () => {
  const screen = screenOf()
  const line = bandLines(screen, 80, NOW, style)[0]!
  const dimmed = [...line.matchAll(/\x1b\[2m(.*?)\x1b\[22m/g)].map(m => m[1])
  expect(strip(line)).toContain(`Asks ${screen.view.needsYou.count}`)
  expect(strip(line)).toContain(`Finds ${screen.view.findings.count}`)
  expect(dimmed.some(t => t?.includes('Asks') || t?.includes('Finds'))).toBe(false)
  expect(strip(line)).toContain('/inbox to open')
  const empty = { ...screenOf(), view: sessionView(emptyState('s'), NOW, SETTLED_MS, true) }
  expect([...bandLines(empty, 80, NOW, style)[0]!.matchAll(/\x1b\[2m(.*?)\x1b\[22m/g)].map(m => m[1])).toContain(
    'Nothing needed',
  )
})

test('no drawn line is wider than the panel, and a short panel keeps the selected row in view', () => {
  const screen = screenOf()
  for (const width of [30, 60, 120])
    for (const line of drawn(screen, INITIAL_UI, width)) expect([...strip(line)].length).toBeLessThanOrEqual(width)
  const rows = [...screen.view.needsYou.questions, ...screen.view.needsYou.tasks].filter(r => r.state.is !== 'settled')
  const last = rows.at(-1)!
  const short = render(screen, onRow(last), 80, NOW, style, 12).map(strip)
  expect(short.length).toBeLessThanOrEqual(12)
  expect(short.some(l => l.includes('❯') && l.includes(last.title.slice(0, 20)))).toBe(true)
})

const stopAt = NOW - 120_000

test('a stop shows above the Asks rows with its fix, and the band says it under the counts', () => {
  const stop: Stop = { kind: 'sign-in', detail: '401', resets: null, at: stopAt }
  const screen = screenOf({ stop })
  const lines = text(screen, INITIAL_UI).split('\n')
  const at = lines.findIndex(l => l.includes('Stopped'))
  expect(lines[at]).toContain('Sign-in expired.')
  expect(lines[at + 1]).toContain('Run /login, then send a message to resume.')
  expect(at).toBeLessThan(lines.findIndex(l => l.includes('Questions')))
  expect(handleKey(screen, INITIAL_UI, 'enter', NOW).ui.selectedId).toBe(firstQuestion(screen).id)
  const band = bandLines(screen, 120, NOW, style).map(strip)
  expect(band[1]).toContain('Stopped 2m ago: sign-in expired. Run /login, then send a message to resume.')
})

test('an API error stop opens on Resume, which reads Resuming… and presses once', () => {
  const stop: Stop = { kind: 'api-error', detail: 'overloaded', resets: null, at: stopAt }
  const screen = screenOf({ stop })
  const pressed = handleKey(screen, INITIAL_UI, 'enter', NOW)
  expect(pressed.press).toEqual({ action: 'resume' })
  expect(text(screen, pressed.ui)).toContain('Resuming…')
  expect(handleKey(screen, pressed.ui, 'enter', NOW).press).toBeUndefined()
})
