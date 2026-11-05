import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { goal, milestone, NO_FACTS, overview, piece, subject } from './builders'

const DAY = 24 * 60

/** The goal once the work has left it: the page shows it met, or shows no goal. */
const LEFT_GOAL = { text: 'Notes 2.5 in the store', match: '2\\.5', milestones: [], isLeft: true as const }

/**
 * A release goal the session leaves behind. Its broad "Cleanup done" milestone tempts a link for each unrelated piece
 * the person starts, its last work closes under them, and the release turns out to have shipped.
 */
export const staleGoal: Replay = {
  name: 'stale-goal',
  about:
    'The inferred goal "Notes 2.5 in the store" has "Sync fixed" done, "Cleanup done" working with a crash fix in review, and "2.5 published" with no work linked. The person redoes the onboarding tour and queues a share sheet hang, neither part of 2.5, while the crash fix merges. Each new piece serves Other work. Once the goal has had no work for a while, it is retired or met. When the person then says 2.5 is live, any goal still shown ends met.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 20,
      overview: overview({
        head: { title: '2.5 release', description: 'Getting notes 2.5 into the store' },
        subjects: [
          subject('s1', 'done', 'Sync conflicts', 'merged', -3 * DAY),
          subject('s2', 'working', 'Launch crash', 'fix in review', -20 * 60),
          subject('s3', 'queued', 'Export folder', 'set aside', -2 * DAY),
        ],
        lastLookAt: minutes(-30),
        goal: goal('Notes 2.5 in the store', -3 * DAY),
        milestones: [
          milestone('m1', 'done', 'Sync fixed', '', -3 * DAY),
          milestone('m2', 'working', 'Cleanup done', 'crash fix in review', -20 * 60),
          milestone('m3', 'queued', '2.5 published', '', -3 * DAY),
        ],
        nextMilestoneId: 4,
        serves: { s1: 'm1', s2: 'm2', s3: 'none' },
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'getting notes 2.5 into the store',
      focusMatch: '2\\.5|store',
      goal: {
        text: 'Notes 2.5 in the store',
        match: '2\\.5',
        milestones: [
          { id: 'ms-sync', name: 'Sync fixed', match: 'sync', state: 'done' },
          { id: 'ms-cleanup', name: 'Cleanup done', match: 'cleanup', state: 'working' },
          { id: 'ms-pub', name: '2.5 published', match: 'publish|2\\.5', state: 'queued' },
        ],
      },
      pieces: [
        piece({
          id: 'sync',
          names: ['Sync conflicts'],
          match: 'conflict',
          state: 'done',
          stands: 'merged',
          serves: 'ms-sync',
        }),
        piece({
          id: 'crash',
          names: ['Launch crash'],
          match: 'launch',
          state: 'working',
          stands: 'fix in review',
          serves: 'ms-cleanup',
        }),
        piece({
          id: 'export',
          names: ['Export folder'],
          match: 'export',
          state: 'set-aside',
          stands: 'set aside',
          serves: 'none',
        }),
      ],
    },
  },
  steps: [
    {
      label: 'The person asks for a new onboarding tour, which 2.5 does not need',
      at: 10,
      call: {
        kind: 'reply',
        person:
          'The 2.6 beta testers keep getting lost on first launch. Redo the onboarding tour: three screens and a skip button.',
        activity: ['Read src/onboarding/tour.tsx', 'Edited src/onboarding/tour.tsx'],
        reply:
          'Started on the onboarding tour. The welcome screen is in. Next come the notes screen and the sync screen, then the skip button.',
      },
      facts: {
        focus: 'redoing the onboarding tour',
        focusMatch: 'onboarding|tour',
        pieces: [
          piece({
            id: 'tour',
            names: ['Onboarding tour'],
            match: 'onboarding|tour',
            state: 'working',
            stands: 'welcome screen in, two screens and skip left',
            serves: 'none',
          }),
        ],
      },
      targets: ['serves-linked'],
    },
    {
      label: 'The crash fix merges, and the tour gains two screens',
      at: 25,
      call: {
        kind: 'reply',
        person: 'Did the crash fix land?',
        activity: ['Ran: gh pr view 412 --json state,mergedAt', 'Edited src/onboarding/tour.tsx'],
        reply:
          'Yes, the launch crash fix merged. The tour now has its notes and sync screens too; the skip button is next.',
      },
      facts: {
        milestones: [{ id: 'ms-cleanup', state: 'done' }],
        pieces: [
          { id: 'crash', state: 'done', stands: 'merged' },
          { id: 'tour', stands: 'three screens in, skip button left' },
        ],
      },
      targets: ['milestones-true'],
    },
    {
      label: 'The person queues an iPad share sheet hang, which 2.5 does not need',
      at: 40,
      call: {
        kind: 'reply',
        person: 'Also: the share sheet hangs on iPad. Look at it after the tour.',
        activity: ['Edited src/onboarding/tour.tsx', 'Ran: npm test -- onboarding'],
        reply:
          'Noted the iPad share sheet hang; it comes after the tour. The skip button works, and the tour runs end to end. One check left: how it fits on a small phone.',
      },
      facts: {
        pieces: [
          piece({
            id: 'share',
            names: ['Share sheet hang'],
            match: 'share',
            state: 'queued',
            stands: 'not started',
            serves: 'none',
          }),
          { id: 'tour', stands: 'runs end to end, small phone check left' },
        ],
      },
      targets: ['serves-linked'],
    },
    {
      label: 'The tour is done. The goal has had no work for an hour, and the session is on other things.',
      at: 80,
      call: {
        kind: 'reply',
        person: 'How does the tour look on a small phone?',
        activity: ['Ran: npm run sim -- iphone-se', 'Edited src/onboarding/tour.css'],
        reply: 'The tour fits a small phone: all three screens and the skip button. The tour is done.',
      },
      facts: {
        goal: LEFT_GOAL,
        pieces: [{ id: 'tour', state: 'done', stands: 'fits a small phone' }],
      },
      targets: ['goal-left', 'goal-only-when-clear'],
    },
    {
      label: 'The person says 2.5 is live, and the share sheet work starts',
      at: 95,
      call: {
        kind: 'reply',
        person: 'By the way, 2.5 went live in the store from the release branch, so the crash fix is out.',
        activity: ['Read src/share/sheet.ts', 'Ran: npm run sim -- ipad'],
        reply:
          'Good, 2.5 is live with the crash fix. On the share sheet hang: the sheet waits on a thumbnail that never arrives on iPad.',
      },
      facts: {
        focus: 'fixing the share sheet hang on iPad',
        focusMatch: 'share',
        pastMatch: 'tour|onboarding',
        pieces: [{ id: 'share', state: 'working', stands: 'waits on a thumbnail on iPad' }],
      },
      targets: ['goal-left', 'goal-only-when-clear'],
    },
  ],
}
