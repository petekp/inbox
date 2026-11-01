import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { delegate, NO_FACTS, overview, piece, question, subject } from './builders'

/** A coordinator's day: Status calls only, from a busy page. The fixture opens and closes the asks. */
export const coordinatorDay: Replay = {
  name: 'coordinator-day',
  about:
    'A coordinator ships 2.4, files two features for later, runs a bug fix through a delegate and ships 2.5, from a busy page the person last saw two hours earlier. Then its work moves from one queued piece to the next with no one naming a new goal.',
  hasLedgerCalls: false,
  start: {
    place: { folder: '/work/notes', branch: 'main' },
    ledger: {
      turn: 6,
      items: [question('i1', 'Approve the 2.4 release notes?', -30)],
      overview: overview({
        head: { title: '2.4 release', description: 'Shipping notes 2.4 to the stores' },
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
      targets: ['marks-true', 'text-no-ids'],
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
      targets: ['no-time-words', 'marks-true'],
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
        pastMatch: '2\\.4',
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
      judgeUntil: { marks: '#137' },
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
      targets: ['piece-once', 'no-duplicates', 'short-names', 'was-not-cut'],
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
      targets: ['asks-linked', 'held-text', 'not-work'],
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
      targets: ['not-work', 'no-news-no-move'],
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
      checkpoint: true,
      judgeUntil: { marks: '#137' },
      targets: ['piece-once', 'text-no-ids', 'children-linked', 'each-once', 'where-it-stands'],
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
        pastMatch: 'vanish|archiv',
        pieces: [
          { id: 'vanish', state: 'done', stands: 'fixed' },
          { id: 'r25', state: 'working', stands: 'release candidate building', alsoRight: ['waits-on-other'] },
        ],
        children: [],
      },
      targets: ['marks-true', 'piece-once', 'head-follows'],
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
    { label: 'Three hours pass', at: 410 },
    {
      label: '2.5 is published, and nothing follows',
      at: 420,
      call: {
        kind: 'reply',
        person: 'Status?',
        activity: ['Ran: fastlane release ios', 'Ran: fastlane release android'],
        reply: '2.5 is live in both stores. Nothing else is queued from you.',
      },
      facts: { pieces: [{ id: 'r25', state: 'done', stands: 'live in both stores', alsoRight: [] }] },
      checkpoint: true,
      judgeUntil: { marks: '#137' },
      targets: ['head-follows', 'open-pieces-kept', 'marks-true', 'head'],
    },
    {
      label: 'The coordinator picks up the export folder bug from the queue. Nobody names a new goal.',
      at: 440,
      call: {
        kind: 'reply',
        person: 'ok',
        activity: ['Read src/export/folder.ts', 'Edit src/export/folder.ts'],
        reply:
          'Picking up the export folder bug from the queue. Windows resets the last-folder setting on update, so I am moving it to a file the update leaves alone.',
      },
      facts: {
        focus: 'fixing the export folder on Windows',
        focusMatch: 'export|folder',
        pastMatch: '2\\.5',
        pieces: [{ id: 'folder', state: 'working', stands: 'moving the setting to a file' }],
      },
      targets: ['head-follows'],
    },
    {
      label: 'The export folder fix merges, and the coordinator starts on search speed',
      at: 470,
      call: {
        kind: 'reply',
        person: 'Good. What about the slow search?',
        activity: ['Ran: gh pr merge 240', 'Ran: npm run profile:search'],
        reply:
          'The export folder fix is merged: the folder now survives a Windows update. On search, profiling a 20,000-note library shows the index rebuilds on every keystroke.',
      },
      facts: {
        focus: 'speeding up note search',
        focusMatch: 'search',
        pastMatch: 'export|folder',
        pieces: [
          { id: 'folder', state: 'done', stands: 'keeps the folder after an update' },
          { id: 'search', state: 'working', stands: 'index rebuilds on every keystroke' },
        ],
      },
      checkpoint: true,
      judgeUntil: { marks: '#137' },
      targets: ['head-follows', 'marks-true', 'head'],
    },
    {
      label: 'Search gets faster, on the same focus',
      at: 490,
      call: {
        kind: 'reply',
        person: 'Nice.',
        activity: ['Edit src/search/index.ts', 'Ran: npm test (230 passed)'],
        reply:
          'Search now keeps its index between keystrokes, so a large library answers at once. Next I will test it on older phones.',
      },
      facts: { pieces: [{ id: 'search', stands: 'fast on large libraries' }] },
      targets: ['head-follows'],
    },
  ],
}
