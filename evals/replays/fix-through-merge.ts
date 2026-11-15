import type { Replay } from '../status-replay'
import { minutes } from '../status-replay'
import { delegate, NO_FACTS, overview, subject } from './builders'
import { MERGE_LEFT } from './children-finished'

const shareDelegate = delegate('c1', 'Send a shared note once', 's1', -20)
const settingsDelegate = delegate('c2', 'Build the settings toggle', 's2', -60)

/**
 * A coordinator's bug fix, from the finding to the merge. A catch-up reads a conversation that calls the work by the
 * bug, by the fix under other words and by its PR, while another subject's delegate has finished and its merge is
 * still owed. Then the fix merges and a beta build follows it.
 */
export const fixThroughMerge: Replay = {
  name: 'fix-through-merge',
  about:
    'A coordinator. A delegate fixes the share sheet bug, and a catch-up reads a conversation that calls it the double send fix and names its PR, while the settings toggle waits on its check and merge. Then the fix merges and the 2.5 beta build starts.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 12,
      overview: overview({
        head: { title: 'Notes 2.5', description: 'Landing the 2.5 fixes from delegates' },
        subjects: [
          subject('s1', 'working', 'Share sheet bug', 'delegate fixing the double send', -20),
          subject('s2', 'working', 'Settings toggle', 'delegate building the toggle', -40),
        ],
        children: [
          shareDelegate,
          { ...settingsDelegate, endedAt: minutes(-10), lastActivityAt: minutes(-10), delegateState: 'finished' },
        ],
        lastLookAt: minutes(-60),
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'landing the notes 2.5 fixes',
      focusMatch: '2\\.5|notes|beta',
      pieces: [
        {
          id: 'share',
          names: ['Share sheet bug', 'double send fix'],
          match: '^(?!.*(beta|testflight)).*(share|double|twice|duplicate)',
          state: 'working',
          stands: 'fix being built',
        },
        {
          id: 'settings',
          names: ['Settings toggle'],
          match: 'setting|toggle',
          state: 'working',
          stands: 'toggle being built',
        },
      ],
      children: [{ ref: shareDelegate.ref, does: 'fixes the share sheet double send', serves: 'share' }],
    },
  },
  steps: [
    {
      label:
        'A catch-up reads the share sheet bug reach review as the double send fix, while the settings toggle waits on its check',
      at: 20,
      events: [{ child: 'finish', ref: shareDelegate.ref }],
      call: {
        kind: 'catch-up',
        conversation: [
          'Person: Please address the finding you recorded: the share sheet sends a note twice.',
          'Agent: I handed the share sheet bug to a delegate. It is fixing the double send.',
          'Agent: The settings toggle delegate finished, and its review came back clean. I am running the full check on it, then I merge it.',
          'Agent: The share sheet delegate finished and opened #31, the double send fix. It has a test that failed before the fix and passes after. Should #31 get a review, the full check and a merge?',
          'Person: Review, check, merge.',
          'Agent: The review of #31, the double send fix, is clean. The full check runs on it now, and it merges if that passes. The settings toggle check is still running.',
        ].join('\n\n'),
      },
      facts: {
        pieces: [
          { id: 'share', stands: 'fix built and reviewed, merge left', alsoRight: ['waits-on-other'] },
          {
            id: 'settings',
            stands: 'toggle built, merge left after the check',
            left: MERGE_LEFT,
            alsoRight: ['waits-on-other'],
          },
        ],
      },
      targets: ['piece-once', 'marks-true'],
    },
    {
      label: 'The share sheet fix merges, and the coordinator starts the 2.5 beta build with it',
      at: 35,
      call: {
        kind: 'reply',
        person: 'Did the check pass on #31?',
        activity: ['Ran: ./scripts/check.sh', 'Ran: gh pr merge 31', 'Ran: ./scripts/build-beta.sh'],
        reply:
          'The full check passed on #31, the double send fix, and it is merged. I started the 2.5 beta build with the fix in it, and it goes to TestFlight once it builds. The settings toggle check is still running.',
      },
      facts: {
        pieces: [
          { id: 'share', state: 'done', stands: 'fix merged', alsoRight: [] },
          {
            id: 'beta',
            names: ['2.5 beta', 'beta build', 'TestFlight build'],
            match: 'beta|testflight|2\\.5',
            state: 'working',
            stands: 'building with the share sheet fix',
            alsoRight: ['waits-on-other'],
          },
        ],
      },
      targets: ['marks-true', 'open-pieces-kept'],
    },
  ],
}
