import type { Replay } from '../status-replay'
import { minutes } from '../status-replay'
import { NO_FACTS, overview, piece, question, subject } from './builders'

const DAY = 24 * 60

/**
 * A session the person comes back to after two days. Work left days ago still reads working, a piece finished since
 * the last look comes back, and the reply names the search work by its PR number.
 */
export const idleWork: Replay = {
  name: 'idle-work',
  about:
    'The person comes back after two days. One piece has had no change for three days and nothing holds it, one was set aside, one waits on a sign-in, and one has waited three days on a vendor. A piece that finished since the last look breaks again, and the reply names a PR by its number. Then an answer with stray prose lines.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 12,
      items: [{ ...question('i1', 'Sign in to App Store Connect so the build can upload', -2 * DAY), kind: 'task' }],
      overview: overview({
        head: { title: 'Notes 3.0', description: 'Building the notes 3.0 features' },
        subjects: [
          subject('s1', 'working', 'Share sheet', 'iPad crash fixed', -3 * DAY),
          subject('s2', 'queued', 'Dark mode', 'set aside until search ships', -2 * DAY),
          subject('s3', 'working', 'Store upload', 'build signed', -2 * DAY),
          subject('s4', 'working', 'Search speed', 'index built, queries slow', -40),
          subject('s5', 'done', 'Retry button', 'works on web', -30),
          subject('s6', 'waits-on-other', 'Font license', 'waits on the vendor', -3 * DAY),
        ],
        askSubjects: { i1: ['s3'] },
        lastLookAt: minutes(-60),
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'building the notes 3.0 features',
      focusMatch: '3\\.0|notes|search',
      pieces: [
        piece({
          id: 'share',
          names: ['Share sheet'],
          match: 'share',
          state: 'working',
          stands: 'iPad crash fixed',
        }),
        piece({ id: 'dark', names: ['Dark mode'], match: 'dark', state: 'set-aside', stands: 'after search ships' }),
        piece({
          id: 'upload',
          names: ['Store upload'],
          match: 'upload|store',
          state: 'working',
          stands: 'build signed, waits on the sign-in',
          alsoRight: ['waits-on-other'],
        }),
        piece({
          id: 'search',
          names: ['Search speed'],
          match: 'search',
          state: 'working',
          stands: 'index built, queries slow',
        }),
        piece({ id: 'retry', names: ['Retry button'], match: 'retry', state: 'done', stands: 'works on web' }),
        piece({
          id: 'font',
          names: ['Font license'],
          match: 'font',
          state: 'waits-on-other',
          stands: 'waits on the vendor',
        }),
      ],
      asks: [{ match: 'app store', text: 'Sign in to App Store Connect', holdsUp: ['upload'] }],
    },
  },
  steps: [
    {
      label:
        'Two days later the search work goes up for review as a numbered PR, and the retry button breaks again on web',
      at: 2 * DAY,
      call: {
        kind: 'reply',
        person: "I'm back. Where is search, and is anything broken?",
        activity: ['Ran the search benchmark', 'Opened PR #3655', 'Opened the web build'],
        reply:
          'Search on big libraries now answers in under 100 ms. I opened PR #3655 with it, and it waits on review. One thing broke: the retry button does nothing on web again since the last merge, so I am fixing it now.',
      },
      facts: {
        pieces: [
          {
            id: 'search',
            state: 'waits-on-other',
            stands: 'fast on big libraries, waits on review',
            alsoRight: ['working'],
          },
          { id: 'retry', state: 'working', stands: 'broken on web again' },
          { id: 'share', state: 'done', alsoRight: ['dropped'] },
        ],
      },
      targets: ['marks-true', 'piece-once', 'open-pieces-kept', 'no-number-names'],
    },
    {
      label: 'An answer holds its edits between stray lines of prose, and one edit names a PR by its number',
      at: 2 * DAY + 20,
      call: {
        kind: 'reply',
        person: 'Is the retry fix in?',
        activity: ['Fixed the retry button on web'],
        reply: 'The retry button works on web again.',
        answer: [
          'Here are the changes:',
          'DONE: Retry button | works on web again',
          'NEW: working | PR 3655 | waits on review',
          'That is all.',
        ].join('\n'),
      },
      facts: { pieces: [{ id: 'retry', state: 'done', stands: 'works on web again' }] },
      targets: ['marks-true', 'no-number-names'],
    },
  ],
}
