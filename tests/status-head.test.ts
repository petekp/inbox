import { expect, test } from 'claude-code/testing'

import { parseStatus } from '../hooks/status'
import { applyStatus } from '../hooks/status-ops'

const apply = (last: ReturnType<typeof applyStatus>, answer: string, now: number) =>
  applyStatus(last, parseStatus(answer)!, now, new Set())

test('Status sets a head from current work and keeps it when legacy task-plan lines arrive', () => {
  const first = apply(null, 'HEAD: Offline sync | Letting the app work without a connection', 100)!
  const later = apply(
    first,
    'NEW: working | Sync engine | queue built\nDONE: s1 | merged\nHEAD: Offline sync | Wiring the retry flow',
    200,
  )!

  expect(first.head).toEqual({ title: 'Offline sync', description: 'Letting the app work without a connection' })
  expect(later.head).toEqual({ title: 'Offline sync', description: 'Wiring the retry flow' })
  expect(later.subjects).toEqual([])
})

test('Status ignores a number-only head and keeps the saved head', () => {
  const current = apply(null, 'HEAD: Search | Faster results for large libraries', 100)!

  expect(apply(current, 'HEAD: PR #3655 | Fixing the pull request', 200)?.head).toEqual(current.head)
  expect(apply(current, 'NO CHANGE', 200)).toEqual(current)
})
