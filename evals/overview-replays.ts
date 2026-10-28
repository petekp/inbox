import type { Child, Item, Overview, Subject, SubjectStatus } from '../types'
import type { Facts, Piece } from './overview-facts'
import { minutes } from './overview-replay'
import type { Replay } from './overview-replay'

function subject(id: string, status: SubjectStatus, name: string, text: string, changedAt: number): Subject {
  const isClosed = status === 'done' || status === 'dropped'
  const at = minutes(changedAt)

  return { id, name, status, text, was: null, createdAt: at, changedAt: at, closedAt: isClosed ? at : null, into: null }
}

function delegate(id: string, name: string, subjectId: string, startedAt: number): Child {
  return {
    id,
    ref: `herdr:${name}`,
    kind: 'delegate',
    name,
    subjectId,
    startedAt: minutes(startedAt),
    endedAt: null,
    lastActivityAt: minutes(-5),
  }
}

function question(id: string, ask: string, at: number): Item {
  return {
    id,
    kind: 'question',
    label: null,
    ask,
    options: [],
    rec: null,
    helps: [],
    turn: 1,
    at: minutes(at),
    from: 'record',
  }
}

function overview(o: Pick<Overview, 'role' | 'goal' | 'subjects'> & Partial<Overview>): Overview {
  return {
    children: [],
    askSubjects: {},
    nextId: o.subjects.length + 1,
    nextChildId: (o.children?.length ?? 0) + 1,
    lastLookAt: null,
    look: null,
    ...o,
  }
}

const piece = (p: Piece) => p

const NO_FACTS: Facts = { focus: '', focusMatch: '.', pieces: [], asks: [], notWork: [], children: [], changed: [] }

/** A coordinator's day: Overview calls only, from a busy page. The fixture opens and closes the asks. */
const coordinatorDay: Replay = {
  name: 'coordinator-day',
  about:
    'A coordinator ships 2.4, files two features for later, runs a bug fix through a delegate and ships 2.5, from a busy page the person last saw two hours earlier.',
  hasLedgerCalls: false,
  start: {
    place: { folder: '/work/notes', branch: 'main' },
    ledger: {
      turn: 6,
      items: [question('i1', 'Approve the 2.4 release notes?', -30)],
      overview: overview({
        role: 'coordinator',
        goal: 'Ship notes 2.4',
        subjects: [
          subject('s1', 'working', 'Sync merge', 'merge on reconnect in review', -40),
          subject('s2', 'working', '2.4 release', 'notes drafted, build signed', -30),
          subject('s3', 'queued', 'Export button', 'works on web', -300),
          subject('s4', 'waits-on-other', 'Vendor font', 'waits on the license', -240),
          subject('s5', 'queued', 'Search speed', 'slow on large libraries', -200),
          subject('s6', 'queued', 'Dark mode', 'design picked', -180),
          subject('s7', 'queued', 'Widgets', 'not started', -170),
          subject('s8', 'done', 'Crash on launch', 'fixed on Android', -150),
          subject('s9', 'done', 'Login timeout', 'fixed', -100),
          subject('s10', 'done', 'Backup restore', 'restores attachments', -60),
        ],
        children: [delegate('c1', 'sm4', 's1', -90), delegate('c2', 'release-notes', 's2', -50)],
        askSubjects: { i1: 's2' },
        lastLookAt: minutes(-120),
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'shipping notes 2.4',
      focusMatch: '2\\.4',
      pieces: [
        piece({ id: 'merge', names: ['Sync merge'], match: 'merge', state: 'working', stands: 'in review' }),
        piece({ id: 'r24', names: ['2.4 release'], match: '2\\.4', state: 'working', stands: 'notes drafted' }),
        piece({ id: 'export', names: ['Export button'], match: 'button', state: 'set-aside', stands: 'works on web' }),
        piece({
          id: 'font',
          names: ['Vendor font'],
          match: 'font',
          state: 'waits-on-other',
          stands: 'waits on the license',
        }),
        piece({
          id: 'search',
          names: ['Search speed'],
          match: 'search',
          state: 'queued',
          stands: 'slow on large libraries',
        }),
        piece({ id: 'dark', names: ['Dark mode'], match: 'dark', state: 'queued', stands: 'design picked' }),
        piece({ id: 'widgets', names: ['Widgets'], match: 'widget', state: 'queued', stands: 'not started' }),
        piece({ id: 'crash', names: ['Crash on launch'], match: 'crash', state: 'done', stands: 'fixed on Android' }),
        piece({ id: 'login', names: ['Login timeout'], match: 'login', state: 'done', stands: 'fixed' }),
        piece({
          id: 'backup',
          names: ['Backup restore'],
          match: 'backup',
          state: 'done',
          stands: 'restores attachments',
        }),
      ],
      asks: [{ match: 'release notes', text: 'Approve the 2.4 release notes?', holdsUp: ['r24'] }],
      children: [
        { ref: 'herdr:sm4', does: 'Merge edits made on two devices', serves: 'merge' },
        { ref: 'herdr:release-notes', does: 'Write the 2.4 release notes', serves: 'r24' },
      ],
    },
  },
  steps: [
    {
      label: 'A delegate reports the sync merge done, and the coordinator merges it',
      at: 10,
      events: [{ child: 'end', ref: 'herdr:sm4' }],
      call: {
        kind: 'reply',
        person: 'sm4 says the merge on reconnect is done and reviewed.',
        activity: ['Ran: git merge sm4-merge-on-reconnect', 'Ran: npm test (212 passed)', 'Ran: herdr pane close sm4'],
        reply: 'Merged the reconnect merge from sm4, and the tests pass. The sync merge is done.',
      },
      facts: {
        pieces: [{ id: 'merge', state: 'done', stands: 'merges edits on reconnect' }],
        children: [{ ref: 'herdr:release-notes', does: 'Write the 2.4 release notes', serves: 'r24' }],
      },
      targets: ['marks-true', 'text-is-state', 'open-not-over'],
    },
    {
      label: 'The person approves the notes, and the coordinator publishes 2.4. The reply is full of times.',
      at: 40,
      events: [{ askCloses: 'i1' }, { child: 'end', ref: 'herdr:release-notes' }],
      call: {
        kind: 'reply',
        person: 'The notes look good. Ship it.',
        activity: ['Ran: fastlane release ios', 'Ran: fastlane release android', 'Ran: gh release create v2.4.0'],
        reply:
          'Published 2.4 to both stores at 9:40 this morning. Store review took 20 minutes, and it went live at 9:38 on Android. I will look at crash reports again in an hour.',
      },
      facts: {
        pieces: [{ id: 'r24', state: 'done', stands: 'live in both stores' }],
        asks: [],
        children: [],
      },
      targets: ['no-time-words', 'marks-true', 'open-not-over'],
    },
    {
      label:
        'The person files dark mode and widgets for later, and asks for a bug fix and 2.5. A delegate starts on the bug.',
      at: 55,
      events: [{ child: 'start', ref: 'herdr:vn2', kind: 'delegate', name: 'vn2' }],
      call: {
        kind: 'reply',
        person:
          'File dark mode and widgets for later, they can wait. Next, notes vanish after archiving on some phones. Fix that, then we ship 2.5.',
        activity: [
          'Ran: gh issue create --title "Dark mode" (#212)',
          'Ran: gh issue create --title "Widgets" (#213)',
          'Ran: herdr pane split --name vn2 "Fix notes that vanish after archiving"',
        ],
        reply:
          'Filed dark mode as #212 and widgets as #213. vn2 is on the vanishing notes bug. 2.5 comes after the fix.',
      },
      facts: {
        focus: 'fixing notes that vanish after archiving, then shipping 2.5',
        focusMatch: '2\\.5|vanish|archiv',
        pieces: [
          { id: 'dark', state: 'filed', stands: 'filed for later' },
          { id: 'widgets', state: 'filed', stands: 'filed for later' },
          piece({
            id: 'vanish',
            names: ['Vanishing notes'],
            match: 'vanish|archiv',
            state: 'working',
            stands: 'cause unknown',
          }),
          piece({ id: 'r25', names: ['2.5 release'], match: '2\\.5', state: 'queued', stands: 'after the bug fix' }),
        ],
        children: [{ ref: 'herdr:vn2', does: 'Fix notes that vanish after archiving', serves: 'vanish' }],
      },
      checkpoint: true,
      targets: ['head-follows', 'open-pieces-kept', 'marks-true', 'children-linked', 'child-labels', 'head'],
    },
    {
      label: 'The delegate calls it the archive bug, and the person asks for a long extra on the same fix',
      at: 80,
      events: [{ child: 'act', ref: 'herdr:vn2' }],
      call: {
        kind: 'reply',
        person:
          'While vn2 is in there, also make sure that restoring a note from the archive on a phone that was offline brings back its attachments.',
        activity: ['vn2: found the archive bug: archiving while offline drops the note sync record'],
        reply:
          'vn2 traced the archive bug: archiving while offline drops the note sync record. I asked vn2 to also check that a note restored from the archive on a phone that was offline gets its attachments back.',
      },
      facts: {
        pieces: [
          {
            id: 'vanish',
            names: ['Vanishing notes', 'archive bug'],
            stands: 'cause found: archiving offline drops the sync record',
          },
        ],
      },
      targets: ['piece-once', 'no-duplicates', 'short-names', 'was-not-cut', 'each-once'],
    },
    {
      label: 'The coordinator asks whether 2.5 waits for the fix',
      at: 95,
      events: [
        {
          askOpens: {
            id: 'i2',
            ask: 'Should 2.5 wait for the archive fix, or ship without it?',
            options: ['Wait for the fix', 'Ship without it'],
          },
        },
      ],
      call: {
        kind: 'reply',
        person: 'What is the plan for 2.5?',
        activity: [],
        reply: 'Should 2.5 wait for the archive fix, or ship without it?',
      },
      facts: {
        asks: [
          { match: '2\\.5 wait', text: 'Should 2.5 wait for the archive fix, or ship without it?', holdsUp: ['r25'] },
        ],
      },
      targets: ['asks-linked', 'held-text', 'not-work', 'no-restating'],
    },
    {
      label: 'The person answers, and the ask closes',
      at: 110,
      events: [{ askCloses: 'i2' }],
      call: { kind: 'reply', person: 'Wait for the fix.', activity: [], reply: '2.5 will wait for the archive fix.' },
      facts: { pieces: [{ id: 'r25', stands: 'waits for the archive fix' }], asks: [] },
      targets: ['changes-move'],
    },
    { label: 'The person reads the page', at: 115, events: [{ look: 30 }] },
    {
      label: 'A reply that only explains how releases work',
      at: 130,
      call: {
        kind: 'reply',
        person: 'Remind me how a release goes out?',
        activity: [],
        reply:
          'A release goes out in three stages: a signed build, store review, then a staged rollout to one in ten users before everyone gets it.',
      },
      targets: ['no-news-no-move'],
    },
    {
      label: 'The coordinator records a flaky test elsewhere as a finding',
      at: 150,
      call: {
        kind: 'reply',
        person: 'Anything else I should know?',
        activity: ['Ran: npm test (1 flaky failure in the settings page test)'],
        reply:
          'The settings page test failed once and passed on a rerun. It is outside this work, so I recorded it as a finding.',
      },
      facts: {
        notWork: [{ kind: 'finding', text: 'The settings page test fails now and then', match: 'flak|settings' }],
      },
      targets: ['not-work', 'no-news-no-move', 'rows-are-work'],
    },
    {
      label: "The fix's PR opens, and a reviewer subagent starts",
      at: 170,
      events: [
        { child: 'act', ref: 'herdr:vn2' },
        { child: 'start', ref: 'toolu_r1', kind: 'subagent', name: 'Review the archive fix' },
      ],
      call: {
        kind: 'reply',
        person: null,
        activity: [
          'vn2: opened PR #231 "Keep the sync record when archiving offline"',
          'Started subagent: Review the archive fix',
        ],
        reply: 'vn2 opened the archive fix PR, #231, and a reviewer subagent is reading it.',
      },
      facts: {
        pieces: [{ id: 'vanish', stands: 'fix in review' }],
        children: [
          { ref: 'herdr:vn2', does: 'Fix notes that vanish after archiving', serves: 'vanish' },
          { ref: 'toolu_r1', does: 'Review the archive fix', serves: 'vanish' },
        ],
      },
      targets: ['piece-once', 'text-is-state', 'children-linked', 'each-once', 'where-it-stands'],
    },
    {
      label: 'The PR merges, and 2.5 prep starts',
      at: 200,
      events: [
        { child: 'end', ref: 'toolu_r1' },
        { child: 'end', ref: 'herdr:vn2' },
      ],
      call: {
        kind: 'reply',
        person: null,
        activity: ['Ran: gh pr merge 231', 'Ran: npm version 2.5.0', 'Ran: fastlane build'],
        reply: 'The reviewer approved, and I merged the archive fix. Starting 2.5: the release candidate is building.',
      },
      facts: {
        focus: 'shipping 2.5',
        focusMatch: '2\\.5',
        pieces: [
          { id: 'vanish', state: 'done', stands: 'fixed' },
          { id: 'r25', state: 'working', stands: 'release candidate on the way' },
        ],
        children: [],
      },
      targets: ['marks-true', 'piece-once', 'each-once'],
    },
    {
      label: 'The person asks why export sometimes picks the wrong default folder on one platform',
      at: 230,
      call: {
        kind: 'reply',
        person: 'Why does export sometimes pick the wrong default folder on Windows? Look into it after 2.5.',
        activity: ['Read src/export/folder.ts'],
        reply:
          'Export reads the last folder from a setting that Windows resets after an update. I will fix it after 2.5.',
      },
      facts: {
        pieces: [
          piece({ id: 'folder', names: ['Export folder'], match: 'folder', state: 'queued', stands: 'cause found' }),
        ],
      },
      targets: ['short-names'],
    },
    { label: 'Three hours pass', at: 410, checkpoint: true, targets: ['stall-times'] },
    {
      label: '2.5 is published, and nothing follows',
      at: 420,
      call: {
        kind: 'reply',
        person: 'Status?',
        activity: ['Ran: fastlane release ios', 'Ran: fastlane release android'],
        reply: '2.5 is live in both stores. Nothing else is queued from you.',
      },
      facts: { pieces: [{ id: 'r25', state: 'done', stands: 'live in both stores' }] },
      checkpoint: true,
      targets: ['head-follows', 'open-pieces-kept', 'marks-true', 'head'],
    },
  ],
}

/** One task, with both calls: the ledger call opens, answers and dismisses each ask, and the Overview call sees it. */
const singleTask: Replay = {
  name: 'single-task',
  about:
    'One session adds offline sync to a notes app: a question answered, a plan reversed, a piece set aside, an explanation that changes nothing, a question dismissed, and parts whose states differ.',
  hasLedgerCalls: true,
  start: { ledger: {}, facts: NO_FACTS },
  steps: [
    {
      label: 'The person asks for offline sync. The agent plans three pieces and starts the engine.',
      at: 0,
      call: {
        kind: 'reply',
        person:
          'Add offline sync to the notes app: notes should save without a connection, and sync once it comes back.',
        activity: ['Read src/notes/store.ts', 'Edited src/sync/queue.ts'],
        reply:
          'Plan: a sync engine that queues edits made offline, conflict handling for edits made on two devices, and a settings toggle to turn sync off. I started on the engine: it now queues edits in a local store.',
      },
      facts: {
        focus: 'adding offline sync to the notes app',
        focusMatch: 'offline|sync',
        pieces: [
          piece({
            id: 'engine',
            names: ['Sync engine'],
            match: 'engine|queue',
            state: 'working',
            stands: 'queues edits offline',
          }),
          piece({
            id: 'conflicts',
            names: ['Sync conflicts'],
            match: 'conflict',
            state: 'queued',
            stands: 'not started',
          }),
          piece({
            id: 'toggle',
            names: ['Sync toggle'],
            match: 'toggle|setting',
            state: 'queued',
            stands: 'not started',
          }),
        ],
      },
      targets: ['head-no-status', 'head-follows', 'head'],
    },
    {
      label: 'The engine works. The agent fixes a lint error, runs two review subagents and asks about conflicts.',
      at: 25,
      events: [
        { child: 'start', ref: 'toolu_a', kind: 'subagent', name: 'Review the sync engine diff' },
        { child: 'start', ref: 'toolu_b', kind: 'subagent', name: 'Check sync engine edge cases' },
      ],
      call: {
        kind: 'reply',
        person: null,
        activity: [
          'Ran: npm run lint (1 error in src/sync/queue.ts, fixed)',
          'Started subagent: Review the sync engine diff',
          'Started subagent: Check sync engine edge cases',
          'Ran: npm test (48 passed)',
        ],
        reply:
          'The sync engine works: edits made offline sync once the connection comes back. I fixed a lint error on the way, and two review subagents are reading the change. For conflicts, should the later edit win (last-write-wins), or should the app keep both edits for you to merge (manual merge)?',
      },
      facts: {
        pieces: [{ id: 'engine', stands: 'syncs on reconnect' }],
        asks: [
          {
            match: 'last-write-wins|manual merge|conflict',
            text: 'Last-write-wins or manual merge?',
            holdsUp: ['conflicts'],
          },
        ],
        children: [
          { ref: 'toolu_a', does: 'Review the sync engine diff', serves: 'engine' },
          { ref: 'toolu_b', does: 'Check sync engine edge cases', serves: 'engine' },
        ],
      },
      targets: ['head-follows', 'children-linked', 'asks-linked', 'held-text', 'no-restating'],
    },
    {
      label: 'The person answers "manual merge"',
      at: 40,
      events: [
        { child: 'end', ref: 'toolu_a' },
        { child: 'end', ref: 'toolu_b' },
      ],
      call: {
        kind: 'reply',
        person: 'Manual merge.',
        activity: ['Edited src/sync/conflicts.ts'],
        reply:
          'Going with manual merge: the app keeps both edits and marks the note for you to merge. I started on it.',
      },
      facts: {
        pieces: [{ id: 'conflicts', state: 'working', stands: 'manual merge under way' }],
        asks: [],
        children: [],
      },
      targets: ['changes-move', 'asks-linked'],
    },
    {
      label: 'The person reverses: last-write-wins with a backup copy',
      at: 70,
      call: {
        kind: 'reply',
        person:
          'Actually, manual merge is too much for now. Use last-write-wins, but keep a backup copy of the losing edit.',
        activity: ['Edited src/sync/conflicts.ts'],
        reply: 'Switched to last-write-wins: the later edit wins, and the losing edit is saved as a backup copy.',
      },
      facts: { pieces: [{ id: 'conflicts', stands: 'last-write-wins with a backup copy', was: 'manual merge' }] },
      checkpoint: true,
      targets: ['was-on-reversal', 'piece-once', 'was-lines'],
    },
    {
      label: 'Conflicts progress. The person sets the toggle aside and asks for an offline banner first.',
      at: 95,
      call: {
        kind: 'reply',
        person: 'Hold the settings toggle for now. Before that, add a banner that tells people they are offline.',
        activity: ['Ran: npm test -- conflicts (12 passed)', 'Edited src/ui/banner.tsx'],
        reply:
          'Last-write-wins works on both test devices, and backup copies save. I set the settings toggle aside and started the offline banner.',
      },
      facts: {
        pieces: [
          { id: 'conflicts', stands: 'works on both test devices' },
          { id: 'toggle', state: 'set-aside', stands: 'not started' },
          piece({
            id: 'banner',
            names: ['Offline banner'],
            match: 'banner',
            state: 'working',
            stands: 'first version',
          }),
        ],
      },
      targets: ['was-on-reversal', 'open-pieces-kept', 'marks-true'],
    },
    {
      label: 'The person asks how the backup copy is named and why the plan changed. Nothing is decided.',
      at: 110,
      call: {
        kind: 'reply',
        person: 'How is the backup copy named? And remind me why we dropped manual merge?',
        activity: [],
        reply:
          'A backup copy takes the note title with the time of the losing edit. We dropped manual merge because it needs a screen to merge on, which you wanted to leave for later.',
      },
      targets: ['no-news-no-move'],
    },
    {
      label: 'The banner shows on phones, and the agent asks whether it shows on web too',
      at: 130,
      call: {
        kind: 'reply',
        person: null,
        activity: ['Edited src/ui/banner.tsx', 'Ran: npm test -- banner (4 passed)'],
        reply: 'The offline banner shows on phones. Should it show on web too?',
      },
      facts: {
        pieces: [{ id: 'banner', stands: 'shows on phones' }],
        asks: [{ match: 'web', text: 'Should the banner show on web too?', holdsUp: ['banner'] }],
      },
      targets: ['asks-linked', 'held-text'],
    },
    {
      label: 'The person dismisses the web question. Device tests: Android syncs, and iOS loses edits after a crash.',
      at: 160,
      call: {
        kind: 'reply',
        person: 'Drop the web question. Run the device tests.',
        activity: ['Ran: npm run test:devices'],
        reply:
          'Device tests: on Android, edits made before a crash sync once the app restarts. On iOS, the last edit made before a crash is lost.',
      },
      facts: {
        pieces: [
          { id: 'banner', state: 'done', stands: 'shows on phones' },
          {
            id: 'engine',
            stands: 'Android syncs after a crash; iOS loses the last edit',
            parts: { Android: 'syncs after a crash', iOS: 'loses the last edit before a crash' },
          },
        ],
        asks: [],
      },
      checkpoint: true,
      targets: ['asks-linked', 'marks-true', 'where-it-stands'],
    },
  ],
}

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

/** A long turn with two mid-turn calls, its reply, then a catch-up after two replies were dropped. */
const longTurn: Replay = {
  name: 'long-turn',
  about:
    'A turn that finishes one piece and starts another, then investigates with nothing new, then two replies the inbox never saw.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 3,
      overview: overview({
        role: 'session',
        goal: 'Speed up note search',
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
  },
  steps: [
    {
      label: 'A mid-turn call at 12 minutes: one piece finished and the next started, with the task list',
      at: 12,
      call: {
        kind: 'mid-turn',
        person: 'Speed up search on large libraries, then rank results by recency.',
        activity: searchTurnBefore,
        turnStartedAt: 0,
        tasks: [
          { id: 't1', text: 'Rebuild the search index', status: 'done' },
          { id: 't2', text: 'Rank results by recency', status: 'in-progress' },
          { id: 't3', text: 'Add typo tolerance', status: 'pending' },
        ],
      },
      facts: {
        pieces: [
          { id: 'index', state: 'done', stands: 'fast on large libraries' },
          { id: 'rank', state: 'working', stands: 'under way' },
        ],
      },
      targets: ['marks-true', 'text-is-state', 'changes-move'],
    },
    {
      label: 'A mid-turn call at 25 minutes: more investigation and nothing new',
      at: 25,
      call: {
        kind: 'mid-turn',
        person: 'Speed up search on large libraries, then rank results by recency.',
        activity: searchTurnAfter,
        turnStartedAt: 0,
        tasks: [
          { id: 't1', text: 'Rebuild the search index', status: 'done' },
          { id: 't2', text: 'Rank results by recency', status: 'in-progress' },
          { id: 't3', text: 'Add typo tolerance', status: 'pending' },
        ],
      },
      checkpoint: true,
      targets: ['no-news-no-move'],
    },
    {
      label: 'The reply ends the turn',
      at: 40,
      call: {
        kind: 'reply',
        person: 'Speed up search on large libraries, then rank results by recency.',
        activity: [...searchTurnAfter, 'Edited src/search/rank.ts'],
        reply:
          'Search on a large library now takes 0.3 s, down from 2.1 s. Ranking by recency is half done: results sort by last edit, and pinned notes still need to stay on top.',
      },
      facts: { pieces: [{ id: 'rank', stands: 'sorts by last edit; pinned notes left' }] },
    },
    {
      label: 'Two replies were dropped, and a catch-up reads the whole conversation',
      at: 120,
      call: {
        kind: 'catch-up',
        conversation: [
          'Person: Speed up search on large libraries, then rank results by recency.',
          'Agent: Search on a large library now takes 0.3 s, down from 2.1 s. Ranking by recency is half done: results sort by last edit, and pinned notes still need to stay on top.',
          'Person: Pinned notes first, then recency.',
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
      },
      targets: ['marks-true', 'changes-move'],
    },
  ],
}

/** A catch-up of a conversation the inbox never saw, from an empty page. */
const catchUpFromEmpty: Replay = {
  name: 'catch-up-from-empty',
  about: 'A catch-up from an empty page marks finished work done, and links the question the last reply left open.',
  hasLedgerCalls: false,
  start: { ledger: {}, facts: NO_FACTS },
  steps: [
    {
      label: 'A catch-up reads a conversation that finished one piece and left a question open',
      at: 30,
      events: [{ askOpens: { id: 'i1', ask: 'Should PDFs open inside the app or in the system viewer?' } }],
      call: {
        kind: 'catch-up',
        conversation: [
          'Person: Let people attach images and PDFs to notes.',
          'Agent: Image attachments work: you can add a photo to a note, and it shows inline. Next are PDFs.',
          'Person: Good, go on.',
          'Agent: PDFs attach and show as a file row. Should PDFs open inside the app or in the system viewer?',
        ].join('\n\n'),
      },
      facts: {
        focus: 'attaching images and PDFs to notes',
        focusMatch: 'attach|image|pdf',
        pieces: [
          piece({
            id: 'images',
            names: ['Image attachments'],
            match: 'image|photo',
            state: 'done',
            stands: 'show inline',
          }),
          piece({
            id: 'pdfs',
            names: ['PDF attachments'],
            match: 'pdf',
            state: 'working',
            stands: 'attach as a file row',
          }),
        ],
        asks: [{ match: 'pdf', text: 'Should PDFs open inside the app or in the system viewer?', holdsUp: ['pdfs'] }],
      },
      targets: ['marks-true', 'asks-linked'],
    },
  ],
}

export const REPLAYS: Replay[] = [coordinatorDay, singleTask, longTurn, catchUpFromEmpty]
