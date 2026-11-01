import type { Step } from '../status-replay'
import { piece } from './builders'

/** The coordinator's day from the flaky test on: the fix and 2.5 ship, queued work with no goal named, then a typed goal. */
export const coordinatorDayLater: Step[] = [
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
      milestones: [{ id: 'ms-vanish', state: 'done' }],
      children: [],
    },
    targets: ['marks-true', 'milestones-true', 'piece-once', 'head-follows'],
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
        piece({
          id: 'folder',
          names: ['Export folder'],
          match: 'folder',
          state: 'queued',
          stands: 'cause found',
          serves: 'none',
        }),
      ],
    },
    targets: ['serves-linked', 'short-names'],
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
    facts: {
      pieces: [{ id: 'r25', state: 'done', stands: 'live in both stores', alsoRight: [] }],
      milestones: [{ id: 'ms-live25', state: 'done' }],
    },
    checkpoint: true,
    judgeUntil: { marks: '#137' },
    targets: ['head-follows', 'milestones-true', 'open-pieces-kept', 'marks-true', 'head'],
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
    targets: ['proposal-only-when-stated', 'head-follows'],
  },
  {
    label:
      'The person types the goal "Search under 100 ms in 2.6" with Edit. The reply merges the folder fix and starts on search.',
    at: 470,
    events: [{ press: 'type', text: 'Search under 100 ms in 2.6' }],
    call: {
      kind: 'reply',
      person: "I set this session's goal: Search under 100 ms in 2.6.",
      activity: ['Ran: gh pr merge 240', 'Ran: npm run profile:search'],
      reply:
        'The export folder fix is merged: the folder now survives a Windows update. On search, profiling a 20,000-note library shows the index rebuilds on every keystroke.',
    },
    facts: {
      focus: 'speeding up note search',
      focusMatch: 'search',
      pastMatch: 'export|folder',
      goal: {
        text: 'Search under 100 ms in 2.6',
        match: '100 ms',
        milestones: [
          { id: 'ms-fast', name: 'Under 100 ms', match: '100|fast|search', state: 'working' },
          { id: 'ms-live26', name: '2.6 live', match: '2\\.6', state: 'queued' },
        ],
      },
      pieces: [
        { id: 'folder', state: 'done', stands: 'keeps the folder after an update' },
        { id: 'search', state: 'working', stands: 'index rebuilds on every keystroke', serves: 'ms-fast' },
      ],
    },
    checkpoint: true,
    judgeUntil: { marks: '#137' },
    targets: ['milestones-true', 'serves-linked', 'head-follows', 'marks-true', 'head'],
  },
]
