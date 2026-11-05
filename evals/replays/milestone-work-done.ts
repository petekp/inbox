import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { goal, milestone, NO_FACTS, overview, piece, subject } from './builders'

/** A milestone whose work all finished closes with no exchange naming it, and opens again when work turns up. */
export const milestoneWorkDone: Replay = {
  name: 'milestone-work-done',
  about:
    'A goal with three milestones. Both subjects of the first finished, one subject of the second is still working, and a subject the third needs sits under Other work. One reply about the second, then one that finds more work on the first.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 9,
      overview: overview({
        head: { title: '2.6 beta', description: 'Getting notes 2.6 onto TestFlight' },
        subjects: [
          subject('s1', 'done', 'Sync conflicts', 'merge on reconnect', -40),
          subject('s2', 'done', 'Offline banner', 'shows on phones', -35),
          subject('s3', 'done', 'Search index', 'rebuilt', -30),
          subject('s4', 'working', 'Search ranking', 'pinned first', -20),
          subject('s5', 'queued', 'Upload script', 'not started', -15),
        ],
        lastLookAt: minutes(-10),
        goal: goal('Notes 2.6 on TestFlight', -60),
        milestones: [
          milestone('m1', 'working', 'Sync fixed', '', -60),
          milestone('m2', 'working', 'Search fast', '', -60),
          milestone('m3', 'queued', 'Beta uploaded', '', -60),
        ],
        nextMilestoneId: 4,
        serves: { s1: 'm1', s2: 'm1', s3: 'm2', s4: 'm2', s5: 'none' },
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'getting notes 2.6 onto TestFlight',
      focusMatch: '2\\.6|testflight|beta',
      goal: {
        text: 'Notes 2.6 on TestFlight',
        match: '2\\.6',
        milestones: [
          { id: 'ms-sync', name: 'Sync fixed', match: 'sync', state: 'done' },
          { id: 'ms-search', name: 'Search fast', match: 'search', state: 'working' },
          { id: 'ms-upload', name: 'Beta uploaded', match: 'upload|beta', state: 'queued', alsoRight: ['working'] },
        ],
      },
      pieces: [
        piece({
          id: 'sync',
          names: ['Sync conflicts'],
          match: 'conflict',
          state: 'done',
          stands: 'merge on reconnect',
          serves: 'ms-sync',
        }),
        piece({
          id: 'banner',
          names: ['Offline banner'],
          match: 'banner',
          state: 'done',
          stands: 'shows on phones',
          serves: 'ms-sync',
        }),
        piece({
          id: 'index',
          names: ['Search index'],
          match: 'index',
          state: 'done',
          stands: 'rebuilt',
          serves: 'ms-search',
        }),
        piece({
          id: 'ranking',
          names: ['Search ranking'],
          match: 'rank',
          state: 'working',
          stands: 'pinned first',
          serves: 'ms-search',
        }),
        piece({
          id: 'upload',
          names: ['Upload script'],
          match: 'upload',
          state: 'queued',
          stands: 'not started',
          serves: 'ms-upload',
        }),
      ],
    },
  },
  steps: [
    {
      label: 'A reply about search ranking, naming no milestone',
      at: 5,
      call: {
        kind: 'reply',
        person: 'Keep going on ranking.',
        activity: ['Edited src/search/rank.ts', 'Ran: npm test -- rank (12 passed)'],
        reply: 'Ranking now puts recent edits after pinned notes. Exact title matches still sort below recent ones.',
      },
      facts: {
        pieces: [{ id: 'ranking', stands: 'recent after pinned, title matches left' }],
      },
      targets: ['milestones-true', 'serves-linked'],
    },
    {
      label: 'The person finds that sync still breaks on iPad',
      at: 15,
      call: {
        kind: 'reply',
        person: 'Sync still loses edits on iPad when the app goes to the background. That has to work for the beta.',
        activity: ['Read src/sync/lifecycle.ts'],
        reply:
          'On iPad the app suspends before the queue flushes, so edits made just before backgrounding are lost. I am adding a flush on the background event.',
      },
      facts: {
        milestones: [{ id: 'ms-sync', state: 'working' }],
        pieces: [
          piece({
            id: 'ipad',
            names: ['iPad background sync'],
            match: 'ipad|background',
            state: 'working',
            stands: 'flush on background',
            serves: 'ms-sync',
          }),
        ],
      },
      targets: ['milestones-true', 'serves-linked'],
    },
  ],
}
