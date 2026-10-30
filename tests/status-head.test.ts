import { expect, test } from 'claude-code/testing'

import { applyOps } from '../hooks/status'
import { opsOf, NO_ASKS, after } from './status-helpers'

test('a HEAD that keeps the title, or that comes with work finished from under way and none left, keeps the head', () => {
  const one = after(
    null,
    'HEAD: Offline sync | Adding offline sync to the notes app\nNEW: working | Sync engine | queue built',
    100,
  )
  const retitled = applyOps(one, opsOf('HEAD: offline sync | Wiring the settings toggle'), 200, NO_ASKS)
  const moved = applyOps(one, opsOf('HEAD: 2.5 release | Shipping 2.5 to the stores'), 200, NO_ASKS)
  const finished = applyOps(
    one,
    opsOf(
      'DONE: s1 | syncs on reconnect\nNEW: queued | Export button | not started\nHEAD: Export button | Adding export',
    ),
    200,
    NO_ASKS,
  )
  const handedOn = applyOps(
    one,
    opsOf(
      'DONE: s1 | syncs on reconnect\nNEW: waits-on-other | 2.5 release | in store review\nHEAD: 2.5 release | Shipping 2.5',
    ),
    200,
    NO_ASKS,
  )
  const filedAlongside = applyOps(
    applyOps(one, opsOf('NEW: queued | Export button | not started'), 150, NO_ASKS),
    opsOf('DONE: s1 | syncs on reconnect\nDONE: s2 | filed for later\nHEAD: Export button | Adding export'),
    200,
    NO_ASKS,
  )
  const shipped = applyOps(one, opsOf('DONE: s1 | syncs on reconnect'), 150, NO_ASKS)
  const startedAndFinished = applyOps(
    shipped,
    opsOf('NEW: working | README fix | typo found\nDONE: README fix | fixed\nHEAD: README fix | Fixing the README'),
    200,
    NO_ASKS,
  )
  const unknownDone = applyOps(shipped, opsOf('DONE: s9 | fixed\nHEAD: README fix | Fixing the README'), 200, NO_ASKS)
  const queuedClosed = applyOps(
    applyOps(shipped, opsOf('NEW: queued | Export button | not started'), 160, NO_ASKS),
    opsOf('DROP: s2 | not needed\nHEAD: 2.5 release | Shipping 2.5'),
    200,
    NO_ASKS,
  )
  const saved = { ...one, head: { title: 'Ship offline sync', description: '' } }
  const described = applyOps(
    saved,
    opsOf('HEAD: Ship offline sync | Adding offline sync to the notes app'),
    200,
    NO_ASKS,
  )

  expect(retitled.head).toEqual(one.head)
  expect(moved.head).toEqual({ title: '2.5 release', description: 'Shipping 2.5 to the stores' })
  expect(finished.head).toEqual(one.head)
  expect(handedOn.head).toEqual({ title: '2.5 release', description: 'Shipping 2.5' })
  expect(filedAlongside.head).toEqual(one.head)
  expect(startedAndFinished.head).toEqual({ title: 'README fix', description: 'Fixing the README' })
  expect(unknownDone.head).toEqual({ title: 'README fix', description: 'Fixing the README' })
  expect(queuedClosed.head).toEqual({ title: '2.5 release', description: 'Shipping 2.5' })
  expect(described.head).toEqual({ title: 'Ship offline sync', description: 'Adding offline sync to the notes app' })
})

test('a head whose description names work that just finished, while other work goes on, takes a new one or loses it', () => {
  const one = after(
    null,
    [
      'HEAD: 2.5 release | Fixing vanishing notes, then shipping 2.5',
      'NEW: working | Vanishing notes | fix in review',
      'NEW: queued | 2.5 release | not started',
    ].join('\n'),
    100,
  )
  const fixMerged = 'DONE: s1 | merged\nSET: s2 | working | building 2.5'
  const redescribed = applyOps(one, opsOf(`${fixMerged}\nHEAD: 2.5 release | Shipping 2.5 to the stores`), 200, NO_ASKS)
  const unwritten = applyOps(one, opsOf(fixMerged), 200, NO_ASKS)
  const nothingLeft = applyOps(one, opsOf('DONE: s1 | merged'), 200, NO_ASKS)
  const otherFinished = applyOps(
    applyOps(one, opsOf('NEW: working | README fix | typo found'), 150, NO_ASKS),
    opsOf('DONE: s3 | fixed\nHEAD: 2.5 release | Shipping 2.5 to the stores'),
    200,
    NO_ASKS,
  )

  expect(redescribed.head).toEqual({ title: '2.5 release', description: 'Shipping 2.5 to the stores' })
  expect(unwritten.head).toEqual({ title: '2.5 release', description: '' })
  expect(nothingLeft.head).toEqual(one.head)
  expect(otherFinished.head).toEqual(one.head)
})

test('a SET that keeps the status keeps the old text and age only when its content words are the same', () => {
  const one = after(null, 'NEW: working | Offline mode | sync queue built and tested', 100)
  const reworded = applyOps(one, opsOf('SET: s1 | working | the sync queue is built and tested'), 200, NO_ASKS)
  const broken = applyOps(one, opsOf('SET: s1 | working | sync queue built and broken'), 200, NO_ASKS)

  expect(reworded.subjects[0]).toMatchObject({ text: 'sync queue built and tested', changedAt: 100 })
  expect(broken.subjects[0]).toMatchObject({ text: 'sync queue built and broken', changedAt: 200 })
})
