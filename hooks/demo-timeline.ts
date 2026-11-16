import type { TaskTree } from '../types'

const MIN = 60_000
const REPO = 'https://github.com/acme/visor'

/** A neutral task tree for the Timeline demo, with English and Japanese titles. */
export function demoTaskTree(now: number): TaskTree {
  const createdAt = now - 60 * MIN
  return [
    {
      id: 'timeline-plan',
      parentId: null,
      status: 'working',
      weight: 14,
      title: 'Ship the image review flow',
      detail: 'Coordinate the saved view and its screenshots.',
      notes: ['Keep the main path easy to review.'],
      createdAt,
      updatedAt: now - 2 * MIN,
      history: [{ at: now - 2 * MIN, source: 'demo', kind: 'updated', detail: 'Started the review pass' }],
      links: { pr: `${REPO}/pull/40` },
    },
    {
      id: 'timeline-header',
      parentId: 'timeline-plan',
      status: 'done',
      weight: 3,
      title: 'Draw the task plan header',
      detail: 'Show weighted progress before the rows.',
      notes: [],
      createdAt,
      updatedAt: now - 20 * MIN,
      history: [{ at: now - 20 * MIN, source: 'demo', kind: 'completed' }],
    },
    {
      id: 'timeline-selection',
      parentId: 'timeline-plan',
      status: 'working',
      weight: 5,
      title: '選択位置を保存する',
      detail: '選択した項目を次回も復元する。',
      notes: ['折りたたみ状態も保存する。'],
      createdAt,
      updatedAt: now - 5 * MIN,
      history: [{ at: now - 5 * MIN, source: 'demo', kind: 'updated', detail: '保存処理を追加' }],
    },
    {
      id: 'timeline-capture',
      parentId: 'timeline-plan',
      status: 'queued',
      weight: 2,
      title: 'Capture the demo screens',
      detail: 'Show the tree and selected task details.',
      notes: [],
      createdAt,
      updatedAt: now - 12 * MIN,
      history: [{ at: now - 12 * MIN, source: 'demo', kind: 'created' }],
    },
    {
      id: 'timeline-review',
      parentId: 'timeline-plan',
      status: 'waits-on-other',
      weight: 4,
      title: 'レビュー内容を確認する',
      detail: '確認が終わったら次の作業に進む。',
      notes: [],
      createdAt,
      updatedAt: now - 15 * MIN,
      history: [{ at: now - 15 * MIN, source: 'demo', kind: 'created' }],
    },
  ]
}
