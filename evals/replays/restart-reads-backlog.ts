import type { Item } from '../../types'
import type { Replay } from '../status-replay'
import { minutes } from '../status-replay'
import { NO_FACTS, overview, piece, question, subject } from './builders'

const RELEASE_GOAL = { text: 'Next release ready', match: 'release', milestones: [] }

function asked(id: string, ask: string, context: string): Item {
  return { ...question(id, ask, -2), context }
}

const releaseWork = [
  piece({
    id: 'evals',
    names: ['Eval fixes', 'weak eval cases'],
    match: 'eval',
    state: 'waits-on-other',
    stands: 'PR drafted, evals not run',
    alsoRight: ['working', 'queued'],
    serves: 'ms-release',
  }),
  piece({
    id: 'replays',
    names: ['Replay fixes', 'Status replays'],
    match: 'replay',
    state: 'waits-on-other',
    stands: 'PR drafted, full run pending',
    alsoRight: ['working', 'queued'],
    serves: 'ms-release',
  }),
  piece({
    id: 'checklist',
    names: ['Release checklist'],
    match: 'checklist',
    state: 'waits-on-other',
    stands: 'PR drafted, needs a full check',
    alsoRight: ['working', 'queued'],
    serves: 'ms-release',
  }),
]

const runsAsk = {
  match: 'eval|check|merge|run',
  text: 'Run the evals and full checks on the three PRs, then merge the ones that pass?',
  holdsUp: ['evals', 'replays', 'checklist'],
}

/** A coordinator restarts with only its slash command and reads its direction from a backlog the call cannot see. */
export const restartReadsBacklog: Replay = {
  name: 'restart-reads-backlog',
  about:
    "No Status yet. The person sends only the coordinator command, and the agent reads its backlog with commands. The reply lists three draft PRs, and the one open ask says why: they block the next release. Nothing says the release is the person's direction, so the release shows as a goal or as the suggested goal, not only in the head.",
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 1,
      overview: overview({ head: null, subjects: [], lastLookAt: null }),
      items: [
        asked('i1', runsAsk.text, 'Three draft PRs block the next release. Each waits on runs that need your yes.'),
      ],
    },
    facts: { ...NO_FACTS, asks: [runsAsk] },
  },
  steps: [
    {
      label: 'The coordinator restarts, reads its backlog and reports three draft PRs',
      at: 0,
      call: {
        kind: 'reply',
        person: '/coordinator notes',
        activity: [
          'Ran: sed -n 1,80p .scratch/backlog.md',
          'Ran: gh pr list --draft',
          'Ran: git log --oneline -5 origin/next',
        ],
        reply:
          'Three draft PRs are open, and each waits on a run. PR 12 fixes the weak eval cases, and its evals have not run. PR 14 fixes the Status replays, and its full run is pending. PR 15 holds the release checklist changes and needs a full check. Each run needs your yes, so I asked in the inbox.',
      },
      facts: {
        focus: 'readying the next release',
        focusMatch: 'release|PR|draft|coordinat|fleet',
        goalClear: { text: RELEASE_GOAL.text, match: RELEASE_GOAL.match, alsoSuggested: true },
        goal: RELEASE_GOAL,
        pieces: releaseWork,
      },
      targets: ['goal-when-clear', 'asks-linked'],
    },
  ],
}

/** Later in the same session, a chat exchange states the person's direction while the release work is open. */
export const chatStatesDirection: Replay = {
  name: 'chat-states-direction',
  about:
    'No goal, and three release PRs wait on an ask with no stated reason. The person asks why the Status has no goal. The reply says their direction is to get the next release ready, and all three PRs serve it. A goal is set.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 3,
      overview: overview({
        head: { title: 'Open PRs', description: 'Coordinating the open PRs and delegate work' },
        subjects: [
          subject('s1', 'waits-on-other', 'Eval fixes', 'PR drafted, evals not run', -480),
          subject('s2', 'waits-on-other', 'Status replays', 'PR drafted, full run pending', -480),
          subject('s3', 'waits-on-other', 'Release checklist', 'PR drafted, needs a full check', -480),
        ],
        askSubjects: { i1: ['s1', 's2', 's3'] },
        lastLookAt: minutes(-60),
      }),
      items: [question('i1', runsAsk.text, -480)],
    },
    facts: {
      ...NO_FACTS,
      focus: 'readying the next release',
      focusMatch: 'release|PR|draft|coordinat|fleet',
      pieces: releaseWork.map(({ serves: _, ...p }) => p),
      asks: [runsAsk],
    },
  },
  steps: [
    {
      label: 'The person asks why there is no goal, and the reply states their direction',
      at: 0,
      call: {
        kind: 'reply',
        person: "I don't see a goal on this session's Status.",
        activity: ['Read the Status call records'],
        reply:
          'The Status has no goal yet. This session started with only the coordinator command. Your direction to get the next release ready lives in the backlog file, and the Status call never saw it. All three open PRs serve that release: the eval fixes, the replay fixes and the release checklist. You can also type a goal with New on the Goal heading.',
      },
      facts: {
        goalClear: { text: RELEASE_GOAL.text, match: RELEASE_GOAL.match },
        goal: RELEASE_GOAL,
        pieces: releaseWork.map(p => ({ id: p.id, serves: 'ms-release' })),
      },
      targets: ['goal-when-clear'],
    },
  ],
}

/** A coordinator's asks each give a reason, and the reasons name no shared outcome. */
export const unrelatedAskReasons: Replay = {
  name: 'unrelated-ask-reasons',
  about:
    'No goal. A coordinator reports three unrelated items, each with an open ask and its reason. One reason names a library release, and one names a goal picker in the app. No goal is set.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 2,
      overview: overview({
        head: { title: 'Upkeep', description: 'Keeping up with delegate work on the notes app' },
        subjects: [
          subject('s1', 'working', 'Image library bump', 'bump to 4.3 started', -30),
          subject('s2', 'working', 'Flaky login test', 'passed three runs', -30),
          subject('s3', 'working', 'Goal picker', 'shows on first launch only', -30),
        ],
        lastLookAt: minutes(-20),
      }),
      items: [
        asked(
          'i1',
          'Pin the image library at 4.2 until its crash fix ships?',
          'Two tests crash on 4.3. The fix is in the library’s next release.',
        ),
        asked('i2', 'Close the flaky login test issue?', 'It passed three runs in a row this morning.'),
        asked(
          'i3',
          'Show the goal picker to existing users too?',
          'The picker shows only on first launch, so existing users never set a reading goal.',
        ),
      ],
    },
    facts: {
      ...NO_FACTS,
      focus: 'keeping up with delegate work',
      focusMatch: 'upkeep|delegate|librar|flaky|picker|coordinat',
      pieces: [
        piece({
          id: 'imagelib',
          names: ['Image library bump'],
          match: 'image|librar|bump',
          state: 'working',
          stands: 'bump to 4.3 started',
          alsoRight: ['waits-on-other'],
        }),
        piece({
          id: 'flaky',
          names: ['Flaky login test'],
          match: 'flaky|login',
          state: 'working',
          stands: 'passed three runs',
          alsoRight: ['done'],
        }),
        piece({
          id: 'picker',
          names: ['Goal picker'],
          match: 'picker',
          state: 'working',
          stands: 'shows on first launch only',
        }),
      ],
      asks: [
        { match: 'pin|image|librar', text: 'Pin the image library at 4.2?', holdsUp: ['imagelib'] },
        { match: 'flaky|login|close', text: 'Close the flaky login test issue?', holdsUp: ['flaky'] },
        { match: 'picker|existing', text: 'Show the goal picker to existing users too?', holdsUp: ['picker'] },
      ],
    },
  },
  steps: [
    {
      label: 'The coordinator reports three unrelated items, each waiting on an ask',
      at: 0,
      call: {
        kind: 'reply',
        person: 'What needs me?',
        activity: ['Ran: herdr pane list'],
        reply:
          'Three things wait on your answer. deps found two tests that crash on image library 4.3, and the fix ships in its next release, so I asked whether to pin 4.2. The flaky login test passed three runs in a row, so its issue can close. The goal picker shows only on first launch: should existing users see it too?',
      },
      facts: { pieces: [{ id: 'imagelib', stands: 'two tests crash on 4.3' }] },
      targets: ['goal-only-when-clear'],
    },
  ],
}
