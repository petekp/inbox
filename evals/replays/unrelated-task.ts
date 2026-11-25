import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { goal, NO_FACTS, overview, piece, question, subject } from './builders'

/**
 * One prompt ranks two PRs, records a task to sign in to npm and records a design-choice question about clamp.js. In
 * a real terminal session the Status call linked the npm task to the new clamp.js subject, so that subject's row showed
 * the task in place of its question.
 */
export const unrelatedTask: Replay = {
  name: 'unrelated-task',
  about:
    'The person just typed the goal "Pick greet.js\'s English greeting", which has no milestones yet. The subjects are "Greeting wording" and "Range end bug". One prompt ranks two PRs, records the task "Sign in to npm before publishing" and the question "Should clamp.js\'s error name its bounds lo/hi or min/max?".',
  hasLedgerCalls: false,
  isShort: true,
  start: {
    ledger: {
      turn: 3,
      items: [question('i1', "Should greet.js's English greeting say Hello or Hi?", -12)],
      overview: overview({
        head: { title: 'Greeting and range', description: 'Checking greet.js wording and range.js end bug' },
        subjects: [
          subject('s1', 'working', 'Greeting wording', 'English greeting choice open, Spanish default noticed', -12),
          subject('s2', 'queued', 'Range end bug', 'range includes end value, fix not made', -12),
        ],
        askSubjects: { i1: ['s1'] },
        lastLookAt: minutes(-3),
        goal: { ...goal("Pick greet.js's English greeting", -1, 'typed'), isAwaitingMilestones: true },
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: "picking greet.js's English greeting",
      focusMatch: 'greet|greeting|range',
      goal: {
        text: "Pick greet.js's English greeting",
        match: 'greet',
        milestones: [],
      },
      pieces: [
        piece({
          id: 'greeting',
          names: ['Greeting wording'],
          match: 'greeting|hello',
          state: 'working',
          stands: 'Hello or Hi open',
        }),
        piece({
          id: 'range',
          names: ['Range end bug'],
          match: 'range',
          state: 'queued',
          stands: 'range includes its end value, fix not made',
        }),
      ],
      asks: [
        { match: 'hello or hi', text: "Should greet.js's English greeting say Hello or Hi?", holdsUp: ['greeting'] },
      ],
    },
  },
  steps: [
    {
      label: 'One prompt ranks two PRs and records an npm sign-in task and a clamp.js question',
      at: 0,
      events: [
        { askOpens: { id: 'i3', ask: 'Sign in to npm before publishing', kind: 'task' } },
        {
          askOpens: {
            id: 'i4',
            ask: "Should clamp.js's error name its bounds lo/hi or min/max?",
            options: ['lo/hi', 'min/max'],
          },
        },
      ],
      call: {
        kind: 'reply',
        person:
          "Without editing files: rank my open PRs in petekp/inbox-release-sample with #3 first, then #1. Record a task for me to sign in to npm before publishing. And record a design-choice question for me: should clamp.js's error name its bounds lo/hi or min/max?",
        activity: [
          'inbox order_prs: petekp/inbox-release-sample #3, #1',
          'inbox record: task "Sign in to npm before publishing"',
          'inbox record: question "Should clamp.js\'s error name its bounds lo/hi or min/max?"',
        ],
        reply: [
          "I've ranked the PRs and recorded both items in your inbox. I didn't edit any files.",
          '',
          '- PR order: "Add a test script" (#3) is first, then "Add an MIT license" (#1). "Trim the name before greeting" (#2) is also open; since you didn\'t rank it, it appears after those two.',
          "- npm sign-in: recorded as a task, since the login asks for your credentials and I can't do that for you. Type ! npm login here, then ! npm whoami to check it worked.",
          '- clamp.js bounds: recorded as a design-choice question. The parameters, the doc comment and the error message in clamp.js:12 all use lo/hi today.',
          '',
          "Should clamp.js's error name its bounds lo/hi or min/max? I'd keep lo/hi, because it matches the parameter names and nothing else would need to change.",
          '',
          'The earlier question about whether greet.js says Hello or Hi is still open, and so is the note about range.js including its end value.',
        ].join('\n'),
      },
      facts: {
        goal: {
          text: "Pick greet.js's English greeting",
          match: 'greet',
          milestones: [
            {
              id: 'ms-english',
              name: 'English greeting chosen',
              match: 'english|chosen|picked|decided',
              state: 'working',
            },
          ],
        },
        asks: [
          { match: 'hello or hi', text: "Should greet.js's English greeting say Hello or Hi?", holdsUp: ['greeting'] },
          { match: 'npm', text: 'Sign in to npm before publishing', holdsUp: [] },
        ],
      },
      targets: ['asks-linked'],
    },
  ],
}
