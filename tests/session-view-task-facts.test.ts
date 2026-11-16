import { expect, test } from 'claude-code/testing'

import { applyFeed } from '../hooks/feed'
import type { Feed } from '../hooks/feed'
import { EMPTY } from '../hooks/ledger'
import { sessionView } from '../hooks/session-view'
import { emptySession } from '../hooks/session-files'
import { taskOwnerKey } from '../hooks/task-facts'
import type { TaskNode } from '../types'

const NOW = 1_000_000
const owner = { machine: 'local', agent: 'worker-1' }
const task: TaskNode = {
  id: 'task-1',
  parentId: null,
  status: 'working',
  weight: 2,
  title: 'Build the feature',
  detail: '',
  notes: [],
  createdAt: NOW,
  updatedAt: NOW,
  history: [],
  links: { owner },
}

test('a working task and its owned feed Progress row derive the same stalled marker', () => {
  const feed: Feed = {
    version: 1,
    source: 'meta-open-items',
    writtenAt: NOW,
    entries: [
      {
        key: 'work/task-1',
        kind: 'work',
        state: 'working',
        title: 'Build the feature',
        detail: 'Implementation continues.',
        at: NOW,
        owner,
      },
    ],
  }
  const ledger = applyFeed(EMPTY, feed, NOW, '/feed/open-items.json')
  const since = NOW - 20 * 60_000
  const session = {
    ...emptySession(),
    ledger,
    taskTree: [task],
    taskOwnerFacts: { [taskOwnerKey(owner)]: { state: 'idle' as const, since } },
  }
  const view = sessionView(session, NOW, 30_000)

  expect(view.taskStalledSince).toEqual({ 'task-1': since })
  expect(view.feedStalledSince).toEqual({ f1: since })
  expect(view.taskProgressSegments).toMatchObject({ total: 2, stalled: 2, working: 0 })
  expect(view.statusPage.progressSegments).toMatchObject({ total: 2, stalled: 2, working: 0 })
})

test('a remote Progress row without explicit owner state and time stays unmarked', () => {
  const feed: Feed = {
    version: 1,
    source: 'herdr-meta-patrol',
    writtenAt: NOW,
    entries: [{ key: 'remote/work', state: 'blocked', title: 'Remote work', detail: 'Waiting.', at: NOW - 60_000 }],
  }
  const ledger = applyFeed(EMPTY, feed, NOW, '/feed/remote.json')

  expect(sessionView({ ...emptySession(), ledger }, NOW, 30_000).feedStalledSince).toEqual({})
})

test('a remote patrol row with an agent key and state time marks its Progress row', () => {
  const feed: Feed = {
    version: 1,
    source: 'herdr-meta-patrol',
    writtenAt: NOW,
    entries: [
      {
        key: 'herdr/builder/worker-2',
        state: 'blocked',
        title: 'Remote work',
        detail: 'Waiting.',
        at: NOW - 20 * 60_000,
      },
    ],
  }
  const ledger = applyFeed(EMPTY, feed, NOW, '/feed/remote.json')
  const view = sessionView(
    {
      ...emptySession(),
      ledger,
      taskTree: [{ ...task, links: { owner: { machine: 'builder', agent: 'worker-2' } } }],
    },
    NOW,
    30_000,
  )

  expect(view.taskStalledSince).toEqual({ 'task-1': NOW - 20 * 60_000 })
  expect(view.feedStalledSince).toEqual({ f1: NOW - 20 * 60_000 })
})

test('a patrol owner that is no longer reported does not keep markers or warnings', () => {
  const path = '/feed/remote.json'
  const patrol: Feed = {
    version: 1,
    source: 'herdr-meta-patrol',
    writtenAt: NOW,
    entries: [
      {
        key: 'herdr/builder/worker-2',
        state: 'blocked',
        title: 'Remote work',
        detail: 'Waiting.',
        at: NOW,
      },
    ],
  }
  const emptyPatrol: Feed = { version: 1, source: 'herdr-meta-patrol', writtenAt: NOW + 1, entries: [] }
  const ledger = applyFeed(applyFeed(EMPTY, patrol, NOW, path), emptyPatrol, NOW + 1, path)
  const view = sessionView(
    {
      ...emptySession(),
      ledger,
      taskTree: [{ ...task, links: { owner: { machine: 'builder', agent: 'worker-2' } } }],
    },
    NOW + 1,
    30_000,
  )

  expect(ledger.closedFindings[0]?.ownerFact).toEqual({ state: 'blocked', since: NOW })
  expect(view.taskStalledSince).toEqual({})
  expect(view.feedStalledSince).toEqual({})
  expect(view.taskFactWarnings).toEqual([])
})
