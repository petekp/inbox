import { expect, test } from 'claude-code/testing'
import { moveTimelineSelection, timelineData, timelinePage, toggleTimelineBranch } from '../hooks/timeline-page'
import type { TaskFactWarning, TaskNode, TaskProgressSegments, TaskTree } from '../types'

const now = 1_000_000
const task = (id: string, change: Partial<TaskNode> = {}): TaskNode => ({
  id,
  parentId: null,
  status: 'queued',
  weight: 1,
  title: id,
  detail: '',
  notes: [],
  createdAt: now - 60_000,
  updatedAt: now,
  history: [],
  ...change,
})
const segments: TaskProgressSegments = { total: 4, done: 1, working: 1, stalled: 1, waiting: 0, queued: 1 }

test('Timeline has an empty state and empty progress bar without tasks', () => {
  const page = timelineData([], { total: 0, done: 0, working: 0, stalled: 0, waiting: 0, queued: 0 }, {}, [], now)
  expect(page.isEmpty).toBe(true)
  expect(page.empty.title).toBe('Timeline')
  expect(page.summary).toBe('no tasks yet')
  expect(page.bars).toEqual([{ id: 'tree', label: 'Task plan', parts: [] }])
})

test('Timeline keeps tree order and derives progress, stall age and warnings', () => {
  const root = task('root', { status: 'working', weight: 2 })
  const child = task('child', { parentId: root.id, status: 'working', weight: 1 })
  const warning: TaskFactWarning = {
    taskId: child.id,
    pr: 'https://github.com/a/b/pull/1',
    message: 'PR merged, task still open',
  }
  const page = timelineData([root, child], segments, { [child.id]: now - 15 * 60_000 }, [warning], now)

  expect(page.rows.map(row => row.task.id)).toEqual(['root', 'child'])
  expect(page.rows[0]?.measure).toBe('0%')
  expect(page.rows[1]).toMatchObject({
    depth: 1,
    status: 'stalled',
    statusLabel: 'stalled 15m',
    measure: 'w1',
    stalledAge: '15m',
    warnings: [warning.message],
  })
  expect(page.bars[0]?.parts.map(part => [part.state, part.count])).toEqual([
    ['done', 4],
    ['working', 4],
    ['stalled', 4],
    ['queued', 4],
  ])
})

test('Timeline summarizes weighted completion and labels waiting work', () => {
  const tree: TaskTree = [
    task('plan', { status: 'working', weight: 14 }),
    task('done-a', { parentId: 'plan', status: 'done', weight: 2 }),
    task('done-b', { parentId: 'plan', status: 'done', weight: 1 }),
    task('working', { parentId: 'plan', status: 'working', weight: 5 }),
    task('waiting', { parentId: 'plan', status: 'waits-on-other', weight: 2 }),
    task('queued', { parentId: 'plan', status: 'queued', weight: 4 }),
  ]
  const page = timelineData(tree, { total: 14, done: 3, working: 5, stalled: 0, waiting: 2, queued: 4 }, {}, [], now)

  expect(page.summary).toBe('21% complete · 3/14 weight')
  expect(page.rows[0]?.measure).toBe('21%')
  expect(page.rows.find(row => row.task.id === 'done-a')?.measure).toBe('w2')
  expect(page.rows.find(row => row.task.id === 'waiting')?.statusLabel).toBe('waiting on others')
})

test('Timeline formats task and history times in the shared plan', () => {
  const updatedAt = now - 15 * 60_000
  const page = timelineData(
    [
      task('history', {
        updatedAt,
        history: [{ at: updatedAt, source: 'claude', kind: 'updated', detail: 'Started implementation' }],
      }),
    ],
    segments,
    {},
    [],
    now,
  )
  const displayedTask = page.rows[0]!.task

  expect(displayedTask.updatedAgo).toBe('15m')
  expect(displayedTask.history).toEqual([
    { source: 'claude', kind: 'updated', detail: 'Started implementation', time: '15m' },
  ])
  expect('updatedAt' in displayedTask).toBe(false)
  expect('createdAt' in displayedTask).toBe(false)
  expect('at' in displayedTask.history[0]!).toBe(false)
})

test('meta sessions show separate top-level stream bars and selection follows visible branches', () => {
  const roots: TaskTree = [
    task('one', { status: 'done', streamId: 's1' }),
    task('two', { status: 'working', streamId: 's2' }),
    task('three', { status: 'waits-on-other', streamId: 's3' }),
  ]
  const page = timelinePage(timelineData(roots, segments, {}, [], now), 'missing', [])

  expect(page.summary).toBe('3 streams')
  expect(page.bars.map(bar => bar.id)).toEqual(['tree', 'one', 'two', 'three'])
  expect(page.selected?.row.task.id).toBe('one')
  expect(moveTimelineSelection(page.rows, 'three', 1)).toBe('one')
  expect(toggleTimelineBranch([], 'one')).toEqual(['one'])
  expect(toggleTimelineBranch(['one'], 'one')).toEqual([])
})

test('folding a selected parent hides its children and keeps the parent selected', () => {
  const tree = [task('root'), task('child', { parentId: 'root' }), task('leaf', { parentId: 'child' })]
  const data = timelineData(tree, segments, {}, [], now)
  const page = timelinePage(data, 'leaf', ['root'])

  expect(page.rows.map(row => row.task.id)).toEqual(['root'])
  expect(page.selected?.row.task.id).toBe('root')
})
