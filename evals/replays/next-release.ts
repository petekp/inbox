import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { goal, milestone, NO_FACTS, overview, piece, subject } from './builders'

const DAY = 24 * 60

/** The release goal once the work has left it: the page shows it met, or shows no goal. */
const LEFT_GOAL = { text: 'Notes 2.5 in the store', match: '2\\.5', milestones: [], isLeft: true as const }

/**
 * A release goal whose outcome happened days ago, held open by a subject that still sits under a done milestone,
 * then the next release's work. The goal ends on its own, and none of the 2.6 work serves it.
 */
export const nextRelease: Replay = {
  name: 'next-release',
  about:
    'The inferred goal "Notes 2.5 in the store" has "Sync fixed" and "Cleanup done" done, and "2.5 published" queued with no work linked. Tag colors, handed to another session, still sits under "Cleanup done". Nothing has moved the goal for two days. The person starts 2.6 with a look at a share extension, then says 2.5 has been in the store since Tuesday, then asks for the extension in the 2.6 beta. The 2.5 goal ends retired or met on its own, never through the 2.6 work, which serves Other work until the 2.6 goal is set.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 24,
      overview: overview({
        head: { title: '2.5 release', description: 'Getting notes 2.5 into the store' },
        subjects: [
          subject('s1', 'done', 'Sync conflicts', 'merged', -3 * DAY),
          subject('s2', 'done', 'Launch crash', 'merged', -2 * DAY),
          subject('s3', 'waits-on-other', 'Tag colors', 'handed to the theme session', -2 * DAY),
          subject('s4', 'queued', 'Export folder', 'set aside', -2 * DAY),
        ],
        lastLookAt: minutes(-DAY),
        goal: goal('Notes 2.5 in the store', -3 * DAY),
        milestones: [
          milestone('m1', 'done', 'Sync fixed', '', -3 * DAY),
          milestone('m2', 'done', 'Cleanup done', 'crash fix merged', -2 * DAY),
          milestone('m3', 'queued', '2.5 published', '', -3 * DAY),
        ],
        nextMilestoneId: 4,
        serves: { s1: 'm1', s2: 'm2', s3: 'm2', s4: 'none' },
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
          { id: 'ms-cleanup', name: 'Cleanup done', match: 'cleanup', state: 'done' },
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
          match: 'crash',
          state: 'done',
          stands: 'merged',
          serves: 'ms-cleanup',
        }),
        piece({
          id: 'tags',
          names: ['Tag colors'],
          match: 'tag',
          state: 'waits-on-other',
          stands: 'handed to the theme session',
          serves: 'none',
          servesAlso: 'ms-cleanup',
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
      label: 'The person starts 2.6 with a look at a share extension. The 2.5 goal has had no work for two days.',
      at: 10,
      call: {
        kind: 'reply',
        person:
          'Time to start on 2.6. First see what a Safari share extension takes: sharing a link should make a note.',
        activity: ['Read src/share/README.md', 'Edited src/share/extension.swift'],
        reply:
          'Looked at the share extension: an extension target takes the shared link and makes a note with the page title. A first cut works from Safari. Images are not handled yet.',
      },
      facts: {
        goal: LEFT_GOAL,
        focus: 'starting 2.6 with a share extension',
        focusMatch: 'share|2\\.6',
        pastMatch: '2\\.5',
        pieces: [
          piece({
            id: 'share',
            names: ['Share extension'],
            match: 'shar|extension',
            state: 'working',
            stands: 'makes a note from Safari, images left',
            serves: 'none',
          }),
        ],
      },
      targets: ['goal-left', 'goal-only-when-clear'],
    },
    {
      label: 'The person says 2.5 has been in the store since Tuesday, and the extension handles images',
      at: 25,
      call: {
        kind: 'reply',
        person: 'By the way, 2.5 has been in the store since Tuesday. Does the extension handle images yet?',
        activity: ['Edited src/share/extension.swift', 'Ran: xcodebuild test -scheme ShareExtension'],
        reply:
          'Good to know 2.5 is out. Images now come through as attachments on the note, and the extension works end to end from Safari and Photos.',
      },
      facts: {
        pieces: [{ id: 'share', stands: 'works from Safari and Photos', alsoRight: ['done'] }],
      },
      targets: ['goal-left', 'goal-only-when-clear'],
    },
    {
      label: 'The person asks for the share extension in the 2.6 TestFlight beta',
      at: 40,
      call: {
        kind: 'reply',
        person: 'Ship it: get the share extension into the 2.6 TestFlight beta.',
        activity: ['Edited fastlane/Fastfile', 'Ran: fastlane beta --dry-run'],
        reply:
          'The share extension is done. Setting up the 2.6 TestFlight build now: the build signs, and the upload is next.',
      },
      facts: {
        focus: 'getting the share extension into the 2.6 beta',
        focusMatch: '2\\.6|beta|share',
        goalClear: { text: 'Share extension in the 2.6 TestFlight beta', match: '2\\.6|beta' },
        goal: { text: 'Share extension in the 2.6 beta', match: '2\\.6|beta', milestones: [] },
        pieces: [
          { id: 'share', state: 'done', stands: 'works from Safari and Photos', serves: 'ms-share' },
          piece({
            id: 'beta',
            names: ['TestFlight build', '2.6 beta'],
            match: 'testflight|beta|build',
            state: 'working',
            stands: 'signs, upload next',
            serves: 'ms-beta',
          }),
        ],
      },
      targets: ['goal-when-clear', 'milestones-shape', 'serves-linked'],
    },
  ],
}
