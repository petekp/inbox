import type { HostTask } from '../../types'
import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { NO_FACTS, overview, piece, subject } from './builders'

const searchTurnBefore = [
  'Read src/search/index.ts',
  'Edited src/search/index.ts',
  'Ran: npm test -- search (31 passed)',
  'Ran: node bench/search.js (large library: 2.1 s, now 0.3 s)',
  'TaskUpdate: Rebuild the search index, completed',
  'TaskUpdate: Rank results by recency, in progress',
  'Edited src/search/rank.ts',
]

const searchTurnAfter = [
  ...searchTurnBefore,
  'Read src/search/rank.ts',
  'Ran: grep -rn recency src/',
  'Read src/notes/model.ts',
]

const searchTasks: HostTask[] = [
  { id: 't1', text: 'Read src/search/index.ts', status: 'done' },
  { id: 't2', text: 'Rebuild the search index', status: 'done' },
  { id: 't3', text: 'Rank results by recency in rank.ts', status: 'in-progress' },
  { id: 't4', text: 'Run the search tests', status: 'pending' },
  { id: 't5', text: 'Add typo tolerance', status: 'pending' },
]

/** A long turn with two mid-turn calls, its reply, then a catch-up after two replies were dropped. */
export const longTurn: Replay = {
  name: 'long-turn',
  about:
    'A turn that finishes one piece and starts another, then investigates with nothing new, then two replies the inbox never saw.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 3,
      overview: overview({
        head: { title: 'Note search', description: 'Speeding up note search' },
        subjects: [
          subject('s1', 'working', 'Search index', 'slow on large libraries', -5),
          subject('s2', 'queued', 'Recency ranking', 'not started', -5),
          subject('s3', 'queued', 'Typo tolerance', 'not started', -5),
        ],
        lastLookAt: minutes(-2),
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'speeding up note search',
      focusMatch: 'search',
      pieces: [
        piece({
          id: 'index',
          names: ['Search index'],
          match: 'index',
          state: 'working',
          stands: 'slow on large libraries',
        }),
        piece({ id: 'rank', names: ['Recency ranking'], match: 'rank|recen', state: 'queued', stands: 'not started' }),
        piece({ id: 'typo', names: ['Typo tolerance'], match: 'typo|fuzzy', state: 'queued', stands: 'not started' }),
      ],
    },
  },
  steps: [
    {
      label: 'A mid-turn call at 12 minutes: one piece finished and the next started, with the task list',
      at: 12,
      call: {
        kind: 'mid-turn',
        person: 'Speed up search on large libraries, then rank results by recency.',
        activity: searchTurnBefore,
        turnStartedAt: 0,
        tasks: searchTasks,
      },
      facts: {
        pieces: [
          { id: 'index', state: 'done', stands: 'fast on large libraries' },
          { id: 'rank', state: 'working', stands: 'under way' },
        ],
      },
      targets: ['marks-true', 'text-no-ids', 'changes-move'],
    },
    {
      label: 'A mid-turn call at 25 minutes: more investigation and nothing new',
      at: 25,
      call: {
        kind: 'mid-turn',
        person: 'Speed up search on large libraries, then rank results by recency.',
        activity: searchTurnAfter,
        turnStartedAt: 0,
        tasks: searchTasks,
      },
      checkpoint: true,
      targets: ['no-news-no-move'],
    },
    {
      label: 'The reply ends the turn',
      at: 40,
      call: {
        kind: 'reply',
        person: 'Speed up search on large libraries, then rank results by recency.',
        activity: [...searchTurnAfter, 'Edited src/search/rank.ts'],
        reply:
          'Search on a large library now takes 0.3 s, down from 2.1 s. Ranking by recency is half done: results sort by last edit, and pinned notes still need to stay on top.',
      },
      facts: { pieces: [{ id: 'rank', stands: 'sorts by last edit; pinned notes left' }] },
    },
    {
      label: 'Two replies were dropped, and a catch-up reads the whole conversation',
      at: 120,
      call: {
        kind: 'catch-up',
        conversation: [
          'Person: Speed up search on large libraries, then rank results by recency.',
          'Agent: Search on a large library now takes 0.3 s, down from 2.1 s. Ranking by recency is half done: results sort by last edit, and pinned notes still need to stay on top.',
          'Person: Pinned notes first, then recency.',
          'Agent: Done. Pinned notes stay on top, then the rest sort by last edit. Ranking is finished.',
          'Person: Now add typo tolerance.',
          'Agent: Started typo tolerance: "serch" now finds "search". Longer typos still miss.',
        ].join('\n\n'),
      },
      facts: {
        pieces: [
          { id: 'rank', state: 'done', stands: 'pinned first, then by last edit' },
          { id: 'typo', state: 'working', stands: 'short typos match' },
        ],
      },
      targets: ['marks-true', 'changes-move'],
    },
  ],
}
