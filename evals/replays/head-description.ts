import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { goal, milestone, NO_FACTS, overview, piece, subject } from './builders'

/**
 * A head whose title still names the focus, while its description names a piece an earlier exchange finished. The
 * call that recorded the finish left the head as it was.
 */
export const headDescription: Replay = {
  name: 'head-description',
  about:
    'A goal with three milestones. An earlier exchange finished the phone testing and started offline edits, and left the head describing the phone testing. One reply about offline edits.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 14,
      overview: overview({
        head: { title: 'Shared lists', description: 'Checking the phone app with real shared edits' },
        subjects: [
          subject('s1', 'done', 'Phone testing', 'edits sync between two phones', -30),
          subject('s2', 'working', 'Offline edits', 'edits saved while offline', -30),
          subject('s3', 'queued', 'Invite settings', 'not started', -90),
        ],
        lastLookAt: minutes(-20),
        goal: goal('Shared lists on web and phone', -120),
        milestones: [
          milestone('m1', 'done', 'Phones checked', '', -30),
          milestone('m2', 'working', 'Works offline', '', -30),
          milestone('m3', 'queued', 'Sharing controls', '', -120),
        ],
        nextMilestoneId: 4,
        serves: { s1: 'm1', s2: 'm2', s3: 'm3' },
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'making shared lists work offline',
      focusMatch: 'offline',
      pastMatch: 'checking|real',
      titleMatch: 'shared lists',
      goal: {
        text: 'Shared lists on web and phone',
        match: 'shared lists',
        milestones: [
          { id: 'ms-phones', name: 'Phones checked', match: 'phone', state: 'done' },
          { id: 'ms-offline', name: 'Works offline', match: 'offline', state: 'working' },
          { id: 'ms-sharing', name: 'Sharing controls', match: 'sharing|invite', state: 'queued' },
        ],
      },
      pieces: [
        piece({
          id: 'phone',
          names: ['Phone testing'],
          match: 'phone',
          state: 'done',
          stands: 'edits sync between two phones',
          serves: 'ms-phones',
        }),
        piece({
          id: 'offline',
          names: ['Offline edits'],
          match: 'offline',
          state: 'working',
          stands: 'edits saved while offline',
          serves: 'ms-offline',
        }),
        piece({
          id: 'invite',
          names: ['Invite settings'],
          match: 'invite',
          state: 'queued',
          stands: 'not started',
          serves: 'ms-sharing',
        }),
      ],
    },
  },
  steps: [
    {
      label: 'A reply about offline edits, while the head still describes the finished phone testing',
      at: 5,
      call: {
        kind: 'reply',
        person: 'Keep going on offline edits.',
        activity: ['Edited src/sync/queue.ts', 'Ran the offline tests'],
        reply:
          'Edits made offline now sync when the device reconnects. When two people change the same item while offline, both changes are kept as separate items. Merging those is next.',
      },
      facts: {
        pieces: [{ id: 'offline', stands: 'syncs on reconnect, merging clashing edits left' }],
      },
      targets: ['head-follows', 'head-title-kept'],
    },
  ],
}
