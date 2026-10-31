import type { Replay } from '../status-replay'
import { NO_FACTS, piece } from './builders'

/** One task, with both calls: the ledger call opens, answers and dismisses each ask, and the Status call sees it. */
export const singleTask: Replay = {
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
            names: ['Sync engine', 'Offline sync'],
            match: 'engine|queue|offline sync',
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
      targets: ['head-no-status', 'head-follows'],
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
      targets: ['head-follows', 'children-linked', 'asks-linked', 'held-text', 'not-work'],
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
      facts: {
        pieces: [
          { id: 'conflicts', stands: 'last-write-wins with a backup copy', was: 'manual merge', alsoRight: ['done'] },
        ],
      },
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
    {
      label:
        'The agent fixes the iOS edit loss. Its notes between tool calls say so, and its last message only says where it saved the results.',
      at: 185,
      call: {
        kind: 'reply',
        person: 'Fix the iOS edit loss.',
        activity: ['Edited src/sync/queue.ts', 'Ran: npm run test:devices', 'Edited docs/device-tests.md'],
        reply:
          'Found it: on iOS the queue file was written in place, so a crash mid-write lost the last edit. The queue now writes a temp file and renames it over the old one.\n\nDevice tests pass: on Android and iOS, edits made before a crash sync once the app restarts. That finishes the sync engine.\n\nSaved the device test results to docs/device-tests.md.',
      },
      facts: {
        pieces: [{ id: 'engine', state: 'done', stands: 'syncs after a crash on Android and iOS', parts: undefined }],
      },
      targets: ['marks-true', 'changes-move'],
    },
  ],
}
