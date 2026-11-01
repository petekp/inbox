import type { HostTask } from '../../types'
import { minutes } from '../status-replay'
import type { Replay, Step } from '../status-replay'
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

/** Where the ranking piece stands at 12 minutes, read from the turn's activity: what ranks now, and what is left. */
const RANK_AT_12 = 'results rank by match; recency sort not in yet'

const SEARCH_PERSON = 'Speed up search on large libraries, then rank results by recency.'

/** The page and facts at the start of the search turn: no goal, since speeding up search names no finish line. */
export const searchStart: Replay['start'] = {
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
}

/** The mid-turn call at 12 minutes: one piece finished and the next started, with the task list. */
export const searchAt12: Step = {
  label: 'A mid-turn call at 12 minutes: one piece finished and the next started, with the task list',
  at: 12,
  call: { kind: 'mid-turn', person: SEARCH_PERSON, activity: searchTurnBefore, turnStartedAt: 0, tasks: searchTasks },
  facts: {
    pieces: [
      { id: 'index', state: 'done', stands: 'fast on large libraries' },
      { id: 'rank', state: 'working', stands: RANK_AT_12 },
    ],
  },
}

/**
 * A long turn with two mid-turn calls, then a catch-up after its reply and two more were dropped. The person names a
 * direction with no finish line in the turn, and a finish line in a dropped message.
 */
export const longTurn: Replay = {
  name: 'long-turn',
  about:
    'A turn that finishes one piece and starts another, then investigates with nothing new, then three replies the inbox never saw, one of which states a goal.',
  hasLedgerCalls: false,
  start: searchStart,
  steps: [
    { ...searchAt12, checkpoint: true, targets: ['marks-true', 'text-no-ids', 'changes-move'] },
    {
      label: 'A mid-turn call at 25 minutes: more investigation and nothing new',
      at: 25,
      call: {
        kind: 'mid-turn',
        person: SEARCH_PERSON,
        activity: searchTurnAfter,
        turnStartedAt: 0,
        tasks: searchTasks,
      },
      targets: ['no-news-no-move'],
    },
    {
      label: 'The reply and two more were dropped, and a catch-up reads the whole conversation',
      at: 120,
      call: {
        kind: 'catch-up',
        conversation: [
          `Person: ${SEARCH_PERSON}`,
          'Agent: Search on a large library now takes 0.3 s, down from 2.1 s. Ranking by recency is half done: results sort by last edit, and pinned notes still need to stay on top.',
          'Person: Pinned notes first, then recency. And the target: get search under 100 ms on big libraries and ship it in 3.1.',
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
        goalStated: { text: 'Search under 100 ms on big libraries, shipped in 3.1', match: '100 ms|3\\.1' },
      },
      checkpoint: true,
      targets: ['proposal-when-stated', 'marks-true', 'changes-move'],
    },
  ],
}
