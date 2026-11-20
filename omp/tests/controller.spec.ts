import { expect, test } from 'bun:test'

import { HERDR_CHECK_MS } from '../../hooks/herdr'
import { PR_POLL_MS, prFetchTracker } from '../../hooks/host-prs'
import { emptySession } from '../../hooks/session-files'
import { COMPARE_LIMIT_MS, RUNNING_FRAME_MS, SETTLED_MS } from '../../hooks/timing'
import { demoOf, flush, open, sharingUi } from './controller-harness'

test('the panel shows a loading line until the first screen arrives', async () => {
  const { panel } = open()
  expect(panel.render(80).join('\n')).toContain('Reading the inbox…')
  await panel.start()
  expect(panel.render(80).join('\n')).toContain('Asks')
})

async function replyThenReopen(panel: ReturnType<typeof open>['panel'], reply: string): Promise<string> {
  const typed = [...reply].map(ch => [ch, ch])
  for (const [key, text] of [['t'], ...typed, ['enter']] as [string, string?][]) {
    panel.handleInput(key, text)
    await flush()
  }
  panel.handleInput('t')
  await flush()
  const lines = panel.render(80)

  return lines[lines.findIndex(l => l.includes('Your answer:')) + 1]!.replace(/^ │ /, '').trim()
}

test('a reply typed in the panel reaches the source as a type press, and Reply then opens an empty field', async () => {
  const { panel, pressed } = open()
  await panel.start()
  expect(await replyThenReopen(panel, 'hi')).toBe('')
  expect(pressed[0]).toMatchObject({ action: 'type', text: 'hi' })
})

test('a type press the source calls stale keeps the draft in the field', async () => {
  const { panel } = open({ press: async () => ({ error: null, note: 'stale', isUnconfirmed: false }) })
  await panel.start()
  expect(await replyThenReopen(panel, 'oh')).toBe('oh')
})

test('a type press whose send fails keeps the draft in the field', async () => {
  const { panel } = open({ press: async () => ({ error: 'Not sent: omp is busy', note: null, isUnconfirmed: false }) })
  await panel.start()
  expect(await replyThenReopen(panel, 'oh')).toBe('oh')
})

test('a type press whose send cannot be confirmed keeps the draft in the field', async () => {
  const { panel } = open({ press: async () => ({ error: null, note: null, isUnconfirmed: true }) })
  await panel.start()
  expect(await replyThenReopen(panel, 'oh')).toBe('oh')
})

test('a reply draft is in the field of a panel opened after the one that began it', async () => {
  const { kept, overrides } = sharingUi()
  const first = open(overrides)
  await first.panel.start()
  for (const [key, text] of [['t'], ['h', 'h'], ['i', 'i'], ['escape']] as [string, string?][]) {
    first.panel.handleInput(key, text)
    await flush()
  }
  first.panel.dispose()
  expect(Object.values(kept.drafts).map(d => d.text)).toEqual(['hi'])

  const second = open(overrides)
  await second.panel.start()
  second.panel.handleInput('t')
  await flush()
  const lines = second.panel.render(80)
  expect(lines[lines.findIndex(l => l.includes('Your answer:')) + 1]!.replace(/^ │ /, '').trim()).toBe('hi')
})

test('a reply that was sent leaves no draft for the next panel', async () => {
  const { kept, overrides } = sharingUi()
  const { panel } = open(overrides)
  await panel.start()
  await replyThenReopen(panel, 'hi')
  expect(kept.saves).toContainEqual(['hi'])
  expect(Object.values(kept.drafts).map(d => d.text)).toEqual([''])
})

test('a failed send shows its reason on its row, below the row’s title, and not under the tabs', async () => {
  const { panel } = open({ press: async () => ({ error: 'Not sent: omp is busy', note: null, isUnconfirmed: false }) })
  await panel.start()
  panel.handleInput('b')
  await flush()
  const lines = panel.render(80)
  const title = lines.findIndex(l => l.includes('Dismiss a glance with a pinch'))
  const error = lines.findIndex(l => l.includes('Not sent: omp is busy'))
  expect(error).toBeGreaterThan(title)
  expect(lines.slice(title + 1, error).some(l => /[├└]─/.test(l))).toBe(false)
  expect(lines.filter(l => l.includes('Not sent: omp is busy'))).toHaveLength(1)
})

test('after Address on a PR thread, the selection moves to the next PR row that waits', async () => {
  const { panel, pressed } = open()
  await panel.start()
  for (const key of ['4', 'a', 'enter', 'a']) {
    panel.handleInput(key)
    await flush()
  }
  expect(pressed).toHaveLength(2)
  expect(pressed[0]).toMatchObject({ action: 'thread-address' })
  expect(pressed[1]).toMatchObject({ action: 'thread-address', thread: 'DT4' })
})

test('Esc closes the panel', async () => {
  const { panel, calls } = open()
  await panel.start()
  panel.handleInput('escape')
  expect(calls.closes).toBe(1)
})

test('the panel polls nothing: it reads the session when the view changes on the clock, and draws a running mark’s frames without a read', async () => {
  const { panel, timers, calls, wakes, runFor } = open()
  await panel.start()
  panel.handleInput('1')
  await flush()
  const intervals = timers.filter(t => !t.isOnce && !t.stopped).map(t => t.ms)
  expect(intervals.sort()).toEqual([PR_POLL_MS, HERDR_CHECK_MS].sort())
  expect(wakes()).toHaveLength(1)
  const [rendersBefore, readsBefore] = [calls.renders, calls.reads]
  await runFor(SETTLED_MS + 1000)
  const frames = calls.renders - rendersBefore
  const reads = calls.reads - readsBefore
  expect(frames).toBeGreaterThanOrEqual(Math.floor(SETTLED_MS / RUNNING_FRAME_MS))
  expect(reads).toBeGreaterThan(0)
  expect(reads).toBeLessThan(frames / 4)
  panel.dispose()
  expect(timers.every(t => t.stopped)).toBe(true)
})

test('the open panel keeps its line count through tab switches, presses and a closed row leaving, and never shrinks after it grows', async () => {
  const { panel, runFor } = open()
  await panel.start()
  const height = panel.render(100).length
  for (const key of ['tab', 'tab', 'tab', '2', 'enter', '1', 'enter']) {
    panel.handleInput(key)
    await flush()
    expect(panel.render(100), `after ${key}`).toHaveLength(height)
  }
  panel.handleInput('t')
  await flush()
  const withField = panel.render(100).length
  expect(withField).toBeGreaterThanOrEqual(height)
  panel.handleInput('escape')
  await flush()
  expect(panel.render(100)).toHaveLength(withField)
  await runFor(SETTLED_MS + 1000)
  expect(panel.render(100)).toHaveLength(withField)
})

test('a Compare press with no report redraws the panel at its limit, reading No comparison came back', async () => {
  const { panel, pressed, runFor } = open()
  await panel.start()
  panel.handleInput('p')
  await flush()
  expect(pressed[0]).toMatchObject({ action: 'compare' })
  await runFor(SETTLED_MS + 1)
  expect(panel.render(80).join('\n')).toContain('Comparing…')
  await runFor(COMPARE_LIMIT_MS)
  expect(panel.render(120).join('\n')).toContain('No comparison came back')
})

test('for a session that tracks no PR, while the PRs tab is hidden, the panel fetches 10 to 10.5 minutes apart though each fetch takes 3 seconds, until it is disposed', async () => {
  let elapsed = 0
  const now = () => 1_700_000_000_000 + elapsed
  const prFetches = prFetchTracker(now)
  const startedAt: number[] = []
  const running: { endsAt: number; end: () => void }[] = []
  const { panel, timers, advance } = open({
    fetchPrsWhenDue: isTabShown =>
      void prFetches.fetchWhenDue('session', emptySession(), isTabShown, () => {
        startedAt.push(now())
        return new Promise<void>(end => running.push({ endsAt: now() + 3000, end }))
      }),
  })
  await panel.start()
  for (let second = 1; second <= 40 * 60; second++) {
    elapsed += 1000
    advance(1000)
    for (const fetch of running.filter(f => f.endsAt <= now())) {
      running.splice(running.indexOf(fetch), 1)
      fetch.end()
    }
    await flush()
    for (const timer of timers.filter(t => !t.stopped && !t.isOnce && elapsed % t.ms === 0)) timer.fn()
  }
  const gaps = startedAt.slice(1).map((at, n) => at - startedAt[n]!)
  expect(gaps.length).toBeGreaterThanOrEqual(3)
  for (const gap of gaps) {
    expect(gap).toBeGreaterThanOrEqual(10 * 60_000)
    expect(gap).toBeLessThanOrEqual(10.5 * 60_000)
  }
  panel.dispose()
  expect(timers.every(t => t.stopped)).toBe(true)
})

test('a change in the saved state redraws the panel', async () => {
  let notify = () => {}
  const { panel, calls } = open({
    onChange: listener => {
      notify = listener

      return () => {}
    },
  })
  await panel.start()
  const before = calls.renders
  notify()
  await flush()
  expect(calls.renders).toBeGreaterThan(before)
})

test('a refused Resume shows why on the stop row', async () => {
  const demo = demoOf(() => 0)
  const stop = { kind: 'api-error' as const, detail: 'overloaded', resets: null, at: 1_700_000_000_000 }
  const { panel } = open({
    screen: async (holds, notes) => ({ ...(await demo.screen(holds, notes)), stop }),
    resume: async () => 'no session to send to',
  })
  await panel.start()
  panel.handleInput('enter')
  await flush()
  await flush()
  expect(panel.render(200).join('\n')).toContain('Not sent: no session to send to')
})
