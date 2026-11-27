import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { goal, milestone, NO_FACTS, overview, piece, question, subject } from './builders'

/**
 * The person answers the question a "decided" milestone is for, and the agent asks before it applies the answer. The
 * edit question holds up the greeting subject, which serves the milestone, so the milestone stays open while it is open.
 * Then the person says yes, and the agent makes the edit but cannot run the file. In the omp session the milestone
 * stayed working, with the text "\"!\" added, not run", until a later turn ran the file.
 */
export const milestoneDecided: Replay = {
  name: 'milestone-decided',
  about:
    'A typed goal to settle a small app\'s release questions, with the milestones "Greeting ending decided", "Range bug fixed" and "PR #2 decided". Step 1: the person answers the greeting question with "!", and the agent asks whether to edit the file, since the person had said no edits. Step 2: the person says yes, and the agent adds the "!" but cannot run the file.',
  hasLedgerCalls: false,
  isShort: true,
  start: {
    ledger: {
      turn: 6,
      items: [question('i1', 'Should the greeting end with "!" or "."?', -12)],
      overview: overview({
        head: { title: 'Greeting and range', description: 'Checking the greeting and range code' },
        subjects: [
          subject('s1', 'working', 'Greeting ending', 'Waiting on "!" or "." choice', -12),
          subject('s2', 'queued', 'Range bug', 'Off-by-one, end included', -12),
        ],
        askSubjects: { i1: ['s1'] },
        lastLookAt: minutes(-3),
        goal: goal('Settle the greet release questions', -8, 'typed'),
        milestones: [
          milestone('m1', 'working', 'Greeting ending decided', 'waiting on the "!" or "." choice', -4),
          milestone('m2', 'queued', 'Range bug fixed', 'off-by-one found', -4),
          milestone('m3', 'queued', 'PR #2 decided', 'merge or close, unanswered', -4),
        ],
        nextMilestoneId: 4,
        serves: { s1: 'm1', s2: 'm2' },
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'settling the greeting ending and the range bug in greet',
      focusMatch: 'greet|range|ending',
      goal: {
        text: 'Settle the greet release questions',
        match: 'greet',
        milestones: [
          { id: 'ms-ending', name: 'Greeting ending decided', match: 'ending', state: 'working' },
          { id: 'ms-range', name: 'Range bug fixed', match: 'range', state: 'queued' },
          { id: 'ms-pr', name: 'PR #2 decided', match: 'pr #2', state: 'queued' },
        ],
      },
      pieces: [
        piece({
          id: 'ending',
          names: ['Greeting ending'],
          match: 'ending|greeting',
          state: 'working',
          stands: 'waiting on the "!" or "." choice',
          serves: 'ms-ending',
        }),
        piece({
          id: 'range',
          names: ['Range bug'],
          match: 'range',
          state: 'queued',
          stands: 'off-by-one, end included',
          serves: 'ms-range',
        }),
      ],
      asks: [{ match: 'end with', text: 'Should the greeting end with "!" or "."?', holdsUp: ['ending'] }],
    },
  },
  steps: [
    {
      label: 'The person answers "!", and the agent asks whether to make the edit',
      at: 0,
      events: [
        { askCloses: 'i1' },
        {
          askOpens: {
            id: 'i2',
            ask: 'Should I edit greet.js to add the "!"?',
            options: ['Yes, edit it', 'No, leave it'],
          },
        },
      ],
      call: {
        kind: 'reply',
        person: 'Re "Should the greeting end with "!" or "."?": End with "!"',
        activity: ['inbox record: question "Should I edit greet.js to add the "!"?"'],
        reply: [
          'I took your answer as end the greeting with "!". The inbox already shows that question closed with your choice.',
          '',
          'I haven\'t changed greet.js yet, because your earlier instructions said not to edit files. Should I make the edit now? I\'d say yes: it\'s one line. Line 23 would become `greetings[lang] + ", " + name + "!"`, so the output would be Hola, world!, and --shout would give HOLA, WORLD!. The question is in your inbox.',
          '',
          'The range() finding is still open.',
        ].join('\n'),
      },
      facts: {
        milestones: [{ id: 'ms-ending', state: 'working' }],
        pieces: [
          {
            id: 'ending',
            state: 'working',
            stands: '"!" chosen, edit not made yet',
            alsoRight: ['done'],
          },
        ],
        asks: [{ match: 'edit greet', text: 'Should I edit greet.js to add the "!"?', holdsUp: ['ending'] }],
      },
      targets: ['milestones-true', 'asks-linked'],
    },
    {
      label: 'The person says yes, and the agent adds the "!" but cannot run greet.js',
      at: 4,
      events: [{ askCloses: 'i2' }],
      call: {
        kind: 'reply',
        person: 'Re "Should I edit greet.js to add the "!"?": Yes, edit it',
        activity: [
          'Edited greet.js',
          'Ran: node greet.js world',
          'inbox record: finding "greet.js was not run: node is not installed here"',
        ],
        reply: [
          'Done. Line 23 of greet.js now ends the greeting with "!", so the output would be Hola, world!.',
          '',
          "I couldn't run greet.js to see it, because node isn't installed here. I recorded that as a finding in your inbox.",
        ].join('\n'),
      },
      facts: {
        milestones: [
          { id: 'ms-ending', state: 'done' },
          { id: 'ms-range', alsoRight: ['working'] },
        ],
        pieces: [{ id: 'ending', state: 'done', stands: '"!" added, not run', alsoRight: ['working'] }],
        asks: [],
      },
      targets: ['milestones-true'],
    },
  ],
}
