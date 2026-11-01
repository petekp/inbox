import type { Replay } from '../status-replay'
import { piece } from './builders'
import { coordinatorDayLater } from './coordinator-day-later'
import { coordinatorDayStart } from './coordinator-day-start'

const NOTES_25 = {
  text: 'Notes 2.5 in the stores',
  match: '2\\.5',
  milestones: [
    { id: 'ms-vanish', name: 'Notes stop vanishing', match: 'vanish', state: 'working' as const },
    { id: 'ms-live25', name: '2.5 live', match: '2\\.5', state: 'queued' as const },
  ],
}

/** A coordinator's day: Status calls only, from a busy page. The fixture opens and closes the asks and presses the goal. */
export const coordinatorDay: Replay = {
  name: 'coordinator-day',
  about:
    'A coordinator ships 2.4, files two features for later, takes 2.5 as the next goal, runs a bug fix through a delegate and ships 2.5, from a busy page the person last saw two hours earlier. Then it picks up queued work with no one naming a goal, until the person types one.',
  hasLedgerCalls: false,
  start: coordinatorDayStart,
  steps: [
    {
      label:
        'The delegate reports the sync merge done, the person approves the notes, and the coordinator publishes 2.4',
      at: 40,
      events: [{ child: 'end', ref: 'herdr:sm4' }, { askCloses: 'i1' }, { child: 'end', ref: 'herdr:release-notes' }],
      call: {
        kind: 'reply',
        person: 'sm4 says the merge on reconnect is done and reviewed. The notes look good. Ship it.',
        activity: [
          'Ran: git merge sm4-merge-on-reconnect',
          'Ran: npm test (212 passed)',
          'Ran: fastlane release ios',
          'Ran: fastlane release android',
        ],
        reply:
          'Merged the reconnect merge from sm4, and the tests pass. Published 2.4 to both stores at 9:40 this morning. Store review took 20 minutes, and it went live at 9:38 on Android. I will look at crash reports again in an hour.',
      },
      facts: {
        pieces: [
          { id: 'merge', state: 'done', stands: 'merges edits on reconnect' },
          { id: 'r24', state: 'done', stands: 'live in both stores' },
        ],
        milestones: [
          { id: 'ms-merge', state: 'done' },
          { id: 'ms-live24', state: 'done' },
        ],
        asks: [],
        children: [],
      },
      targets: ['milestones-true', 'no-time-words', 'marks-true', 'text-no-ids'],
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
        goalStated: { text: 'Fix the vanishing notes, then ship 2.5', match: '2\\.5' },
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
      targets: [
        'proposal-when-stated',
        'head-follows',
        'open-pieces-kept',
        'marks-true',
        'children-linked',
        'child-labels',
        'head',
      ],
    },
    {
      label: 'The person presses Use this goal on the 2.5 proposal',
      at: 60,
      events: [{ press: 'use-goal' }],
      facts: {
        goal: NOTES_25,
        pieces: [
          ...['merge', 'r24', 'crash', 'login', 'backup'].map(id => ({ id, serves: 'none' })),
          { id: 'vanish', serves: 'ms-vanish' },
          { id: 'r25', serves: 'ms-live25' },
        ],
      },
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
      targets: ['piece-once', 'no-duplicates', 'short-names', 'was-not-cut', 'serves-linked'],
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
      label: 'The person answers the ask in the inbox, and reads the page',
      at: 115,
      events: [{ askCloses: 'i2' }, { look: 30 }],
      facts: { asks: [] },
    },
    ...coordinatorDayLater,
  ],
}
