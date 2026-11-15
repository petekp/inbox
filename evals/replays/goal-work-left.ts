import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { goal, milestone, NO_FACTS, overview, piece, subject } from './builders'

/** The work leaves an inferred goal for a new one, then parks the new goal's work for a side fix and comes back. */
export const goalWorkLeft: Replay = {
  name: 'goal-work-left',
  about:
    'The Status call set "Import ready to demo". The person shelves the demo for search under 100 ms in 3.1, which replaces the goal. Then a quick side fix parks the search work, and the person returns to it, and the search goal stays throughout.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 6,
      overview: overview({
        head: { title: 'Notes import', description: 'Getting the import ready to demo' },
        subjects: [
          subject('s1', 'done', 'Evernote import', 'notes, tags, attachments', -40),
          subject('s2', 'queued', 'Demo script', 'not started', -30),
        ],
        lastLookAt: minutes(-10),
        goal: goal('Import ready to demo', -60),
        milestones: [
          milestone('m1', 'done', 'Import works', '', -40),
          milestone('m2', 'queued', 'Demo run-through', '', -60),
        ],
        nextMilestoneId: 3,
        serves: { s1: 'm1', s2: 'm2' },
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'getting the import ready to demo',
      focusMatch: 'import|demo',
      goal: {
        text: 'Import ready to demo',
        match: 'import',
        milestones: [
          { id: 'ms-import', name: 'Import works', match: 'import', state: 'done' },
          { id: 'ms-demo', name: 'Demo run-through', match: 'demo', state: 'queued' },
        ],
      },
      pieces: [
        piece({
          id: 'import',
          names: ['Evernote import'],
          match: 'evernote',
          state: 'done',
          stands: 'notes, tags, attachments',
          serves: 'ms-import',
        }),
        piece({
          id: 'demo',
          names: ['Demo script'],
          match: 'demo',
          state: 'queued',
          stands: 'not started',
          serves: 'ms-demo',
        }),
      ],
    },
  },
  steps: [
    {
      label: 'The person shelves the demo and asks for search under 100 ms in 3.1',
      at: 10,
      call: {
        kind: 'reply',
        person:
          'The demo is off, we are not showing the import after all. Get search under 100 ms on big libraries for 3.1.',
        activity: ['Read src/search/index.ts', 'Edited src/search/index.ts'],
        reply:
          'Dropped the demo script. For 3.1 search: rebuilding the index, then ranking. The index rebuild is under way, and search on a large library takes 0.8 s now.',
      },
      facts: {
        focus: 'getting search under 100 ms for 3.1',
        focusMatch: 'search|100 ms|3\\.1',
        pastMatch: 'demo',
        goalClear: { text: 'Search under 100 ms in 3.1', match: '100 ms|3\\.1|search' },
        goal: { text: 'Search under 100 ms in 3.1', match: '100 ms|3\\.1|search', milestones: [] },
        pieces: [
          { id: 'demo', state: 'dropped', stands: 'demo is off', serves: undefined },
          { id: 'import', serves: undefined },
          piece({
            id: 'index',
            names: ['Search index'],
            match: 'index',
            state: 'working',
            stands: '0.8 s on large libraries',
            serves: 'ms-search',
          }),
          piece({
            id: 'ranking',
            names: ['Search ranking'],
            match: 'rank',
            state: 'queued',
            stands: 'not started',
            serves: 'ms-search',
          }),
        ],
      },
      checkpoint: true,
      targets: ['goal-when-clear', 'milestones-shape', 'serves-linked'],
    },
    {
      label: 'The person asks for a quick side fix first',
      at: 30,
      call: {
        kind: 'reply',
        person: 'Quick one before search: the login button is cut off on small phones.',
        activity: ['Edited src/auth/login.css'],
        reply: 'The login button now wraps its label on small phones. Back to the search index next.',
      },
      facts: {
        pieces: [
          piece({
            id: 'login',
            names: ['Login button'],
            match: 'login',
            state: 'done',
            stands: 'wraps on small phones',
            serves: 'none',
          }),
          { id: 'index', state: 'queued', stands: '0.8 s on large libraries', alsoRight: ['working'] },
        ],
      },
      targets: ['goal-only-when-clear', 'serves-linked'],
    },
    {
      label: 'The person returns to search',
      at: 45,
      call: {
        kind: 'reply',
        person: 'Back to search.',
        activity: ['Edited src/search/index.ts', 'Ran: npm run bench -- search'],
        reply: 'The rebuilt index brings search on a large library to 0.2 s. Ranking is next.',
      },
      facts: {
        pieces: [{ id: 'index', state: 'working', stands: '0.2 s on large libraries' }],
      },
      targets: ['goal-only-when-clear', 'serves-linked'],
    },
  ],
}
