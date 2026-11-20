import type { Replay } from '../status-replay'
import { minutes } from '../status-replay'
import { goal, milestone, NO_FACTS, overview, piece, subject } from './builders'

const DAY = 24 * 60

/**
 * A typed goal whose work has all landed, while its review milestone still reads working with no work linked, and a
 * fix still waits on a check the agent never asked for. Two replies say the work is finished, merged and pushed, and
 * the second says the review is done. The Status call answered both with NO CHANGE in a real session, which left the
 * milestone, the fix and the head behind.
 */
export const finishedPass: Replay = {
  name: 'finished-pass',
  about:
    'A typed cleanup goal: its fixes milestone is done, its review milestone still reads working with no work linked, and a scroll fix still says it waits on the person\'s check, with no ask. Step 1: the agent pushes main and says nothing waits on the person. Step 2: the person asks whether the pass is done, the reply says it is, lists what is left unapproved, and recommends the next pass.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 40,
      items: [],
      overview: overview({
        head: { title: 'Notes app', description: 'Reviewing the code and checking recent fixes' },
        subjects: [
          subject('s1', 'waits-on-other', 'Website notes page', 'Page text done, screenshots needed', -4 * DAY),
          subject('s2', 'waits-on-other', 'Scroll jump bug', 'Fix in place, your check next', -26 * 60),
          subject('s3', 'done', 'Sync flicker', 'gone', -3 * DAY),
          subject('s4', 'done', 'Tag menu bug', 'fixed', -2 * DAY),
          subject('s5', 'dropped', 'Old export button', 'replaced by the share sheet', -2 * DAY),
          subject('s6', 'done', 'Card skip fix', 'merged', -60),
          subject('s7', 'done', 'Code cleanup', 'six fixes merged', -30),
        ],
        lastLookAt: minutes(-3 * 60),
        goal: { ...goal('Code cleanup pass', -12 * 60, 'typed'), was: 'Website notes section live' },
        milestones: [
          milestone('m1', 'working', 'Review written', 'Review written', -26),
          milestone('m2', 'done', 'Top fixes merged', 'merged into main', -26),
        ],
        nextMilestoneId: 3,
        serves: { s1: 'none', s2: 'none', s7: 'm2' },
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'the code cleanup pass on the notes app',
      focusMatch: 'clean|notes|review|fix',
      goal: {
        text: 'Code cleanup pass',
        match: 'clean',
        milestones: [
          { id: 'ms-review', name: 'Review written', match: 'review', state: 'done', alsoRight: ['working'] },
          { id: 'ms-fixes', name: 'Top fixes merged', match: 'fix', state: 'done' },
        ],
      },
      pieces: [
        piece({
          id: 'site',
          names: ['Website notes page'],
          match: 'website|site',
          state: 'waits-on-other',
          stands: 'page text done, screenshots needed',
          alsoRight: ['queued'],
          serves: 'none',
        }),
        piece({
          id: 'scroll',
          names: ['Scroll jump bug', 'scroll jump fix'],
          match: 'scroll',
          state: 'done',
          stands: 'fix merged into main',
          alsoRight: ['waits-on-other', 'working'],
          serves: 'none',
        }),
        piece({ id: 'cleanup', names: ['Code cleanup'], match: 'cleanup', state: 'done', stands: 'six fixes merged' }),
        piece({ id: 'card', names: ['Card skip fix'], match: 'card', state: 'done', stands: 'merged' }),
      ],
    },
  },
  steps: [
    {
      label: 'The agent pushes main, with the scroll jump fix on it, and says nothing waits on the person',
      at: 0,
      call: {
        kind: 'reply',
        person: 'Re "Push the four new commits on main to GitHub now?": Push now',
        activity: ['Ran: git fetch origin && git log --oneline origin/main..main', 'Ran: git push origin main'],
        reply:
          "I've pushed. GitHub's main now matches yours, with all four commits on it: the AGENTS.md wording, the card skip fix, the scroll jump fix and the cleanup fixes.\n\nNothing is waiting on you.",
      },
      facts: {
        pieces: [{ id: 'scroll', state: 'done', stands: 'fix merged and pushed', alsoRight: [] }],
        milestones: [{ id: 'ms-review', state: 'done', alsoRight: ['working'] }],
      },
      targets: ['marks-true', 'open-pieces-kept'],
    },
    {
      label: 'The person asks whether the pass is done, and the reply says it is and recommends the next pass',
      at: 8,
      events: [
        { askOpens: { id: 'i1', ask: 'Add the animation timing check as a step in the build script?' } },
        { askOpens: { id: 'i2', ask: 'Show a notice in Settings when the settings folder cannot be saved?' } },
        { askOpens: { id: 'i3', ask: 'Start the next pass, on how the editor keeps keyboard focus?' } },
      ],
      call: {
        kind: 'reply',
        person: 'is the cleanup pass all done?',
        activity: [],
        reply: [
          'Yes, everything you approved is finished: the six fixes and the five doc fixes. They are merged into main, installed in your app and pushed to GitHub.',
          '',
          "**Two of the new behaviours haven't been seen in the running app:**",
          '- "Not saved" showing on a card. It is traced in the code, but no test reaches that step.',
          '- The settings fix on a truly full disk. Only a unit test has run that case.',
          '',
          '**Left over from this pass, none of it approved yet:**',
          '- **The animation timing check.** It adds a step to the build script, so it needs its own yes.',
          "- **A notice in Settings when the settings folder can't be saved.** That is new wording.",
          '',
          '**The areas the review named for later passes:**',
          '1. **How the editor keeps keyboard focus.** It has the most repeat bugs.',
          '2. **The order of the startup steps.** About 25 steps run in a hand-written order, with no test for it.',
          '',
          "If you want to keep going, I'd start the editor focus pass. It has the strongest bug history.",
        ].join('\n'),
      },
      facts: {
        asks: [
          { match: 'animation', text: 'Add the animation timing check?', holdsUp: [] },
          { match: 'settings', text: 'Show a notice in Settings?', holdsUp: [] },
          { match: 'focus', text: 'Start the next pass, on editor focus?', holdsUp: [] },
        ],
        milestones: [{ id: 'ms-review', state: 'done', alsoRight: [] }],
        goalSuggested: { text: 'Editor focus pass done', match: 'focus|keyboard' },
      },
      targets: ['marks-true', 'milestones-true', 'goal-suggested'],
    },
  ],
}
