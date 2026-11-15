import type { Replay } from '../status-replay'
import { minutes } from '../status-replay'
import { delegate, NO_FACTS, overview, piece, subject } from './builders'

const exportDelegate = delegate('c1', 'Lay out the PDF export', 's1', -50)
const engineDelegate = delegate('c2', 'Build the sync retry queue', 's3', -40)

/**
 * A coordinator whose delegate finished while the subject it served stays working, as the coordinator checks and
 * merges the work, and a subject whose work left is another subject's. Then a delegate finishes while the reply talks
 * about other work.
 */
export const childrenFinished: Replay = {
  name: 'children-finished',
  about:
    'A coordinator. The export delegate finished, and the coordinator runs the checks, then merges. Sync conflicts is built, and cannot merge until the sync engine change another delegate builds lands. Then the engine delegate finishes while the reply talks only about the export merge.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 8,
      overview: overview({
        head: { title: 'Notes 2.5', description: 'Landing the 2.5 features from delegates' },
        subjects: [
          subject('s1', 'working', 'Export button', 'delegate laying out the PDF', -5),
          subject('s2', 'working', 'Sync conflicts', 'manual merge built', -30),
          subject('s3', 'working', 'Sync engine', 'retry queue under way', -40),
        ],
        children: [
          { ...exportDelegate, endedAt: minutes(-5), lastActivityAt: minutes(-5), delegateState: 'finished' },
          engineDelegate,
        ],
        lastLookAt: minutes(-60),
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'landing the notes 2.5 features',
      focusMatch: '2\\.5|notes',
      pieces: [
        piece({
          id: 'export',
          names: ['Export button', 'PDF export'],
          match: 'export',
          state: 'working',
          stands: 'PDF layout being built',
        }),
        piece({
          id: 'conflicts',
          names: ['Sync conflicts'],
          match: 'conflict',
          state: 'working',
          stands: 'manual merge built',
        }),
        piece({
          id: 'engine',
          names: ['Sync engine', 'retry queue'],
          match: 'engine|retry',
          state: 'working',
          stands: 'retry queue being built',
        }),
      ],
      children: [{ ref: engineDelegate.ref, does: 'builds the sync retry queue', serves: 'engine' }],
    },
  },
  steps: [
    {
      label:
        'The export delegate finished. The coordinator checks and merges it, and sync conflicts waits on the engine',
      at: 0,
      call: {
        kind: 'reply',
        person: 'The export delegate says it is done. What happens next?',
        activity: ['Read the export delegate report', 'Ran: ./scripts/check.sh', 'Read the sync engine delegate pane'],
        reply:
          'The export delegate finished: the PDF export lays out on every page size, and its review came back clean. I am running the full check on it now, and I merge it once that passes. Sync conflicts is built too, but it cannot merge until the sync engine change lands, and the engine delegate is still building that.',
      },
      facts: {
        pieces: [
          {
            id: 'export',
            stands: 'PDF layout works, merge left after the full check',
            left: '\\bmerg(e|ing)\\b',
          },
          {
            id: 'conflicts',
            state: 'waits-on-other',
            stands: 'manual merge built, waits on the sync engine change',
          },
        ],
      },
      targets: ['step-left-named', 'marks-true'],
    },
    {
      label: 'The engine delegate finishes, and the reply talks only about merging the export',
      at: 10,
      events: [{ child: 'finish', ref: engineDelegate.ref }],
      call: {
        kind: 'reply',
        person: 'Did the full check pass on the export?',
        activity: ['Ran: ./scripts/check.sh', 'Ran: git merge export-pdf'],
        reply: 'The full check passed on the PDF export, and I merged it into the release branch.',
      },
      facts: {
        pieces: [
          { id: 'export', state: 'done', stands: 'PDF export merged' },
          { id: 'engine', stands: 'retry queue done, not checked yet', left: 'check|review|unread|not read' },
        ],
      },
      targets: ['step-left-named', 'marks-true'],
    },
  ],
}
