import type { Replay } from '../status-replay'
import { NO_FACTS, overview, piece } from './builders'

const FINDING = 'pad() is called with a negative width in the help text'

/**
 * The person asks for two jobs. The agent finishes one and asks a question about the other, then the answer closes the
 * last open work, and one more exchange follows with nothing working.
 */
export const headAfterDone: Replay = {
  name: 'head-after-done',
  about:
    'A fresh session on a small CLI. The person asks for a --repeat flag and a decision on whether pad() trims long strings. The agent adds --repeat and asks the trimming question. The answer closes it, and an Explain on a finding follows.',
  hasLedgerCalls: false,
  start: {
    ledger: { turn: 1, overview: overview({ head: null, subjects: [] }) },
    facts: NO_FACTS,
  },
  steps: [
    {
      label: 'The agent adds --repeat and asks whether pad() should trim long strings',
      at: 5,
      events: [{ askOpens: { id: 'i1', ask: 'Should pad() trim strings longer than the width?' } }],
      call: {
        kind: 'reply',
        person: 'Add a --repeat flag to greet, and decide whether pad() should trim strings longer than the width.',
        activity: ['Edited src/greet.ts', 'Added tests for --repeat', 'Ran the tests'],
        reply:
          'greet now takes --repeat N and prints the greeting N times. Tests pass. For pad(), I asked in the inbox whether strings longer than the width should be cut or kept whole.',
      },
      facts: {
        focus: 'adding --repeat and settling how pad() handles long strings',
        focusMatch: 'repeat|pad|trim|greet|flag',
        titleMatch: 'repeat|pad|trim|greet|flag',
        pieces: [
          piece({ id: 'repeat', names: ['Repeat flag', '--repeat'], match: 'repeat', state: 'done', stands: 'added' }),
          piece({
            id: 'trim',
            names: ['Pad trimming', 'pad() trimming'],
            match: 'trim|pad',
            state: 'working',
            stands: 'waits on your answer',
          }),
        ],
        asks: [{ match: 'trim', text: 'Should pad() trim strings longer than the width?', holdsUp: ['trim'] }],
      },
    },
    {
      label: 'The person answers, and the agent settles pad(): nothing is working any more',
      at: 12,
      events: [{ askCloses: 'i1' }],
      call: {
        kind: 'reply',
        person: 'Keep long strings whole. pad() should never cut text.',
        activity: ['Edited src/pad.ts', 'Added a test for long strings', 'Ran the tests'],
        reply: 'pad() now returns strings longer than the width unchanged, and a test covers it. Tests pass.',
      },
      facts: { pieces: [{ id: 'trim', state: 'done', stands: 'long strings kept whole' }], asks: [] },
      targets: ['head-no-finished', 'head-follows', 'head-title-kept'],
    },
    {
      label: 'An Explain on a finding, with nothing working',
      at: 20,
      call: {
        kind: 'reply',
        person: `Remind me what this finding you recorded is about: why it matters, what fixing it would involve, and whether you would fix it now. Don't act on it yet.\n${FINDING}`,
        activity: [],
        reply:
          'The help text calls pad() with a width that can go below zero when the terminal is narrow. pad() then returns the text unchanged, so nothing breaks, but the columns stop lining up. The fix is one clamp to zero. I would fix it now.',
      },
      facts: { notWork: [{ kind: 'finding', text: FINDING, match: 'negative|help text' }] },
      targets: ['head-no-finished', 'head-follows', 'head-title-kept'],
    },
  ],
}
