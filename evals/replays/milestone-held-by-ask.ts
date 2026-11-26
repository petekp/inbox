import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { delegate, goal, milestone, NO_FACTS, overview, piece, question, subject } from './builders'

const pieces = [
  piece({
    id: 'conflicts',
    names: ['Sync conflicts'],
    match: 'conflict',
    state: 'done',
    stands: 'merge on reconnect',
    serves: 'ms-sync',
  }),
  piece({
    id: 'ipad',
    names: ['iPad background sync'],
    match: 'ipad|background',
    state: 'working',
    stands: 'flush on background built',
    serves: 'ms-sync',
  }),
  piece({
    id: 'queue',
    names: ['Offline queue cap'],
    match: 'queue|cap',
    state: 'working',
    stands: 'cap picked, wiring it',
    serves: 'ms-sync',
  }),
  piece({
    id: 'upload',
    names: ['Upload script'],
    match: 'upload',
    state: 'queued',
    stands: 'not started',
    serves: 'ms-upload',
  }),
]

/** A milestone saved done while an open task and an open question hold up the work under it. */
export const milestoneHeldByAsk: Replay = {
  name: 'milestone-held-by-ask',
  about:
    'A goal whose milestone "Sync fixed" was saved done, while an open task holds up one subject under it and an open question holds up another, which a delegate works on. A third subject is done. Step 1: a reply about the delegate. Step 2: the reply says sync is fixed, with the check and the question still open.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 12,
      items: [
        { ...question('i1', 'Check that edits survive backgrounding on your iPad', -25), kind: 'task' },
        question('i2', 'Past 500 queued edits, drop the oldest or stop queuing?', -20),
      ],
      overview: overview({
        head: { title: '2.6 beta', description: 'Getting notes 2.6 onto TestFlight' },
        subjects: [
          subject('s1', 'done', 'Sync conflicts', 'merge on reconnect', -40),
          subject('s2', 'working', 'iPad background sync', 'flush on background built', -25),
          subject('s3', 'working', 'Offline queue cap', 'cap picked, wiring it', -20),
          subject('s4', 'queued', 'Upload script', 'not started', -30),
        ],
        children: [delegate('c1', 'queue-cap', 's3', -18)],
        askSubjects: { i1: ['s2'], i2: ['s3'] },
        lastLookAt: minutes(-10),
        goal: goal('Notes 2.6 on TestFlight', -60),
        milestones: [
          milestone('m1', 'done', 'Sync fixed', 'all sync work in', -15),
          milestone('m2', 'queued', 'Beta uploaded', '', -60),
        ],
        nextMilestoneId: 3,
        serves: { s1: 'm1', s2: 'm1', s3: 'm1', s4: 'm2' },
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'getting notes 2.6 onto TestFlight',
      focusMatch: '2\\.6|testflight|beta|sync',
      goal: {
        text: 'Notes 2.6 on TestFlight',
        match: '2\\.6',
        milestones: [
          { id: 'ms-sync', name: 'Sync fixed', match: 'sync', state: 'working' },
          { id: 'ms-upload', name: 'Beta uploaded', match: 'upload|beta', state: 'queued' },
        ],
      },
      pieces,
      asks: [
        { match: 'ipad', text: 'Check that edits survive backgrounding on your iPad', holdsUp: ['ipad'] },
        { match: '500', text: 'Past 500 queued edits, drop the oldest or stop queuing?', holdsUp: ['queue'] },
      ],
      children: [{ ref: 'herdr:queue-cap', does: 'wires the offline queue cap', serves: 'queue' }],
    },
  },
  steps: [
    {
      label: 'The delegate wires the queue cap, and both asks stay open',
      at: 5,
      call: {
        kind: 'reply',
        person: 'How is the queue cap going?',
        activity: ['herdr: queue-cap reported progress'],
        reply:
          'The delegate wired the 500-edit cap. Until you answer the queue question, it drops the oldest edits. The iPad fix still needs your check.',
      },
      facts: {
        pieces: [{ id: 'queue', stands: 'cap wired, oldest dropped for now' }],
      },
      targets: ['milestones-true', 'marks-true'],
    },
    {
      label: 'The reply says sync is fixed, while the check and the question are still open',
      at: 12,
      call: {
        kind: 'reply',
        person: 'Is sync done?',
        activity: ['Ran: npm test -- sync (48 passed)'],
        reply:
          'Sync is fixed: conflicts merge on reconnect, the iPad flush is built and the queue cap is wired, and the sync tests pass. Your iPad check and the queue question are still open.',
      },
      facts: {
        pieces: [{ id: 'ipad', stands: 'flush built, tests pass, check left' }],
      },
      targets: ['milestones-true', 'marks-true'],
    },
  ],
}
