import { expect, mock, test } from 'claude-code/testing'
import { world } from './hooks-world'

test('the Timeline selection and folds upgrade to defaults in an older save', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let selection: unknown
  let folded: unknown
  on('state.set', { plugin: 'inbox', key: 'timelineSelection' } as const, (_$, event, next) => {
    selection = event.value
    return next(event)
  })
  on('state.set', { plugin: 'inbox', key: 'timelineFolded' } as const, (_$, event, next) => {
    folded = event.value
    return next(event)
  })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })

  expect(selection).toBe(null)
  expect(folded).toEqual([])
})
