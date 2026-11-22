import type { Replay } from '../status-replay'
import { minutes } from '../status-replay'
import { delegate, goal, NO_FACTS, overview, piece, question, subject } from './builders'

const clickDelegate = delegate('c1', 'Give outside clicks one owner', 's4', -50)
const updateDelegate = delegate('c2', 'Run the app update test', 's1', -30)

const ASKS = [
  question('i1', 'Allow the terminal to control Finder, for the release disk image', -90),
  question('i2', 'Try the 0.2.0 candidate in your app, then say publish or what to fix', -40),
  question('i3', "Look at the site's new demo section, then say ship or what to change", -35),
  question('i4', 'Run the on-screen click check in a VM after the update test?', -1),
]

/**
 * From a real Status call on 11-15: the person typed a release goal, and the next call, which a finished delegate's
 * report started, planned its milestones twice, once in a GOAL line and once in MILESTONE lines. Code applied both,
 * so one stage showed as two milestones in other words, and another milestone said it was waiting on the person's
 * check, which an open ask already says.
 */
export const releasePlanOnce: Replay = {
  name: 'release-plan-once',
  about:
    'A typed release goal with no milestones yet. A finished delegate starts the turn, and the reply says its change is built and waits for the release, while the update test still runs.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 8,
      items: ASKS,
      overview: overview({
        head: { title: 'Sketchpad 0.2.0', description: 'Shipping the 0.2.0 release' },
        subjects: [
          subject('s1', 'waits-on-other', '0.2.0 release', 'Signed, update test running', -20),
          subject('s2', 'queued', 'Crash fix', 'Fix written, not merged', -60),
          subject('s3', 'queued', 'Backlog trim', 'Waiting for its turn', -90),
          subject('s4', 'working', 'Click owner', 'One watcher owns outside clicks', -10),
        ],
        children: [clickDelegate, updateDelegate],
        askSubjects: { i1: ['s1'], i2: ['s1'], i3: ['s1'] },
        goal: { ...goal('Ship Sketchpad 0.2.0', -1, 'typed'), isAwaitingMilestones: true },
        lastLookAt: minutes(-15),
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'shipping Sketchpad 0.2.0',
      focusMatch: '0\\.2\\.0|release|sketchpad',
      goal: { text: 'Ship Sketchpad 0.2.0', match: '0\\.2\\.0', milestones: [] },
      pieces: [
        piece({
          id: 'release',
          names: ['0.2.0 release'],
          match: 'release',
          state: 'waits-on-other',
          alsoRight: ['working'],
          stands: 'signed, update test running',
        }),
        piece({
          id: 'crash',
          names: ['Crash fix'],
          match: 'crash',
          state: 'queued',
          stands: 'fix written, not merged',
        }),
        piece({ id: 'backlog', names: ['Backlog trim'], match: 'backlog', state: 'queued', stands: 'waits its turn' }),
        piece({
          id: 'click',
          names: ['Click owner'],
          match: 'click',
          state: 'working',
          stands: 'one watcher owns clicks',
        }),
      ],
      asks: [
        { match: 'finder', text: 'Allow the terminal to control Finder', holdsUp: ['release'] },
        { match: 'try the 0\\.2\\.0', text: 'Try the 0.2.0 candidate', holdsUp: ['release'] },
        { match: 'demo section', text: "Look at the site's new demo section", holdsUp: ['release'] },
        { match: 'click check', text: 'Run the on-screen click check', holdsUp: ['click'] },
      ],
      children: [
        { ref: clickDelegate.ref, does: 'gives outside clicks one owner', serves: 'click' },
        { ref: updateDelegate.ref, does: 'runs the app update test', serves: 'release' },
      ],
    },
  },
  steps: [
    {
      label: 'A finished delegate starts the turn: the click change is built and waits for 0.2.0',
      at: 0,
      call: {
        kind: 'reply',
        person: null,
        activity: ['Read the click owner delegate report', 'Ran: git diff --stat', 'Read the unit test log'],
        reply: [
          'The click owner delegate finished and asked two questions. I read its report, its diff and its test log.',
          'The click change is built and passes the unit suite. It stays inside its brief. It is committed on its own branch, and it waits for 0.2.0 before it merges.',
          'Its two questions:\n- The state docs no longer match the code in three places. I told the delegate to fix them, which needs no decision from you.\n- A press in the first moments after the editor opens could read as an outside click. That was possible before this change too. The delegate would leave it unless an on-screen check shows it.',
          "New ask in your inbox: run the on-screen click check in a VM once the update test is done? I recommend yes, since unit tests can't reach the order of clicks.",
          'The update test is still running.',
        ].join('\n\n'),
      },
      facts: {
        pieces: [
          {
            id: 'click',
            state: 'waits-on-other',
            alsoRight: ['working'],
            stands: 'built, merges after 0.2.0',
            serves: 'none',
          },
        ],
        goal: {
          text: 'Ship Sketchpad 0.2.0',
          match: '0\\.2\\.0',
          milestones: [
            {
              id: 'published',
              name: '0.2.0 published',
              match: 'publish|shipped|released|\\blive\\b|\\bout\\b',
              state: 'queued',
              alsoRight: ['working'],
            },
          ],
        },
      },
      targets: ['no-duplicates', 'piece-once', 'no-wait-on-person'],
    },
  ],
}
