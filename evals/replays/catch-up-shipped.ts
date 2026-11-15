import type { Replay } from '../status-replay'
import { minutes } from '../status-replay'
import { goal, milestone, NO_FACTS, overview, subject } from './builders'

/** A catch-up over work that was merged and shipped, which must close as done, not dropped. */
export const catchUpShipped: Replay = {
  name: 'catch-up-shipped',
  about:
    'A goal with two milestones and three subjects. A catch-up reads a conversation in which two of them were merged and shipped, and they close as done.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 6,
      overview: overview({
        head: { title: '2.5 release', description: 'Getting notes 2.5 out' },
        subjects: [
          subject('s1', 'working', 'Sync conflicts', 'merge on reconnect in review', -40),
          subject('s2', 'working', 'Offline banner', 'shows on phones, in review', -35),
          subject('s3', 'queued', 'Release notes', 'not started', -30),
        ],
        lastLookAt: minutes(-20),
        goal: goal('Notes 2.5 in the store', -60),
        milestones: [
          milestone('m1', 'working', 'Offline fixes merged', '', -60),
          milestone('m2', 'queued', '2.5 published', '', -60),
        ],
        nextMilestoneId: 3,
        serves: { s1: 'm1', s2: 'm1', s3: 'm2' },
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'the notes 2.5 release',
      focusMatch: '2\\.5',
      goal: {
        text: 'Notes 2.5 in the store',
        match: '2\\.5',
        milestones: [
          { id: 'ms-offline', name: 'Offline fixes merged', match: 'offline', state: 'working' },
          { id: 'ms-published', name: '2.5 published', match: 'publish', state: 'queued', alsoRight: ['working'] },
        ],
      },
      pieces: [
        {
          id: 'sync',
          names: ['Sync conflicts'],
          match: 'sync',
          state: 'working',
          stands: 'merge on reconnect in review',
          serves: 'ms-offline',
        },
        {
          id: 'banner',
          names: ['Offline banner'],
          match: 'banner',
          state: 'working',
          stands: 'shows on phones, in review',
          serves: 'ms-offline',
        },
        {
          id: 'notes',
          names: ['Release notes'],
          match: 'release note',
          state: 'queued',
          stands: 'not started',
          serves: 'ms-published',
        },
      ],
    },
  },
  steps: [
    {
      label: 'A catch-up reads a conversation that merged and shipped the sync fix and the banner',
      at: 30,
      call: {
        kind: 'catch-up',
        conversation: [
          'Person: Merge the sync fix and the offline banner once review passes, and ship both in the 2.5 beta.',
          'Agent: Both reviews passed. The sync conflict fix and the offline banner are merged and shipped in the 2.5 beta build.',
          'Person: Good. Start on the release notes.',
          'Agent: The release notes cover sync and the banner. The store text is left.',
        ].join('\n\n'),
      },
      facts: {
        milestones: [{ id: 'ms-offline', state: 'done' }],
        pieces: [
          { id: 'sync', state: 'done', stands: 'merged and shipped in the 2.5 beta' },
          { id: 'banner', state: 'done', stands: 'merged and shipped in the 2.5 beta' },
          { id: 'notes', state: 'working', stands: 'sync and banner covered; store text left' },
        ],
      },
      targets: ['marks-true', 'milestones-true'],
    },
  ],
}
