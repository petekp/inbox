import { GOOD_RUNS } from './status-evals-runs'

export const BAD_RUNS: Record<string, { at: number; answer: string; breaks: string }> = {
  'coordinator-day': {
    at: 1,
    answer: GOOD_RUNS['coordinator-day']![1]!.replace(
      'DONE: s6 | filed for later',
      'SET: s6 | queued | filed for later\nSERVES: s6 | -',
    ),
    breaks: 'marks-true',
  },
  'single-task': { at: 7, answer: 'SET: s2 | working | last-write-wins with backup', breaks: 'was-on-reversal' },
  'long-turn': { at: 1, answer: 'SET: s2 | working | reading the ranking code', breaks: 'no-news-no-move' },
  'catch-up-from-empty': {
    at: 0,
    answer: GOOD_RUNS['catch-up-from-empty']![0]!.replace('DONE: Image attachments | show inline\n', ''),
    breaks: 'piece-once',
  },
  'removed-goal': {
    at: 0,
    answer: `${GOOD_RUNS['removed-goal']![0]!}\nGOAL: Attachments import shipped | working Attachments in; queued Import live`,
    breaks: 'goal-only-when-clear',
  },
  'milestone-work-done': {
    at: 0,
    answer: 'SET: s4 | working | recent after pinned, title matches left\nSET: m2 | working | ranking left',
    breaks: 'serves-linked',
  },
  'goal-met-next': {
    at: 1,
    answer: GOOD_RUNS['goal-met-next']![1]!.replace(/^HEAD: [^\n]*\n/, 'HEAD: 2.5 release | Shipping the 2.5 update\n'),
    breaks: 'head-follows',
  },
  'goal-wait': {
    at: 0,
    answer: `${GOOD_RUNS['goal-wait']![0]!}\nSET: m2 | working | hotfix`,
    breaks: 'milestones-true',
  },
  'no-goal-yet': {
    at: 2,
    answer: `${GOOD_RUNS['no-goal-yet']![2]!}\nGOAL: Upkeep done | working Docs current; queued Library bumped`,
    breaks: 'goal-only-when-clear',
  },
  'goal-from-work': {
    at: 0,
    answer: GOOD_RUNS['goal-from-work']![0]!.replace(/\nGOAL: [^\n]*/, ''),
    breaks: 'goal-when-clear',
  },
  'restart-reads-backlog': {
    at: 0,
    answer: GOOD_RUNS['restart-reads-backlog']![0]!.replace(/\n(GOAL|SERVES): [^\n]*/g, ''),
    breaks: 'goal-when-clear',
  },
  'chat-states-direction': { at: 0, answer: 'NO CHANGE', breaks: 'goal-when-clear' },
  'unrelated-ask-reasons': {
    at: 0,
    answer: `${GOOD_RUNS['unrelated-ask-reasons']![0]!}\nGOAL: Library pinned | working Tests pass; queued 4.3 adopted`,
    breaks: 'goal-only-when-clear',
  },
  'goal-work-left': {
    at: 0,
    answer: GOOD_RUNS['goal-work-left']![0]!.replace(/\nSERVES: [^\n]*/g, ''),
    breaks: 'serves-linked',
  },
  'typed-goal-kept': {
    at: 0,
    answer: `${GOOD_RUNS['typed-goal-kept']![0]!}\nSERVES: Dark theme colors | m1`,
    breaks: 'serves-linked',
  },
  'goal-names-release': {
    at: 0,
    answer: GOOD_RUNS['goal-names-release']![0]!.replace(
      'MILESTONE: queued | 2.6 published | Awaiting search improvements\nNEXT: 2.6 published',
      'MILESTONE: queued | Speed target verified | Under 100 ms unverified\nNEXT: Speed target verified',
    ),
    breaks: 'milestones-true',
  },
  'goal-on-busy-page': {
    at: 0,
    answer: GOOD_RUNS['goal-on-busy-page']![0]!.replace('SERVES: s1 | m1', 'SERVES: s1 | -'),
    breaks: 'serves-linked',
  },
  'mid-turn-activity': {
    at: 0,
    answer: 'DONE: s1 | fast on large libraries\nSET: s2 | working | editing rank.ts',
    breaks: 'text-no-ids',
  },
  'milestone-dropped': {
    at: 0,
    answer: GOOD_RUNS['milestone-dropped']![0]!.replace('SERVES: s2 | -\nSERVES: s3 | -\n', ''),
    breaks: 'serves-linked',
  },
  'catch-up-shipped': {
    at: 0,
    answer: GOOD_RUNS['catch-up-shipped']![0]!.replace(
      'DONE: s1 | merged and shipped in the 2.5 beta',
      'DROP: s1 | merged and shipped',
    ),
    breaks: 'marks-true',
  },
  'goal-typed-while-running': {
    at: 0,
    answer: GOOD_RUNS['goal-typed-while-running']![0]!.replace(
      'NEW: working | Notes widget',
      'NEW: queued | Notes widget',
    ),
    breaks: 'marks-true',
  },
  'goal-awaiting-milestones': {
    at: 0,
    answer: 'DONE: s3 | merged\nSET: s4 | working | wider layout in',
    breaks: 'milestones-true',
  },
  'ask-holds-two': {
    at: 1,
    answer: 'NEW: working | 2.5 beta | signed, upload needs sign-in',
    breaks: 'ask-holds-several',
  },
  'one-task-plan': {
    at: 0,
    answer: `${GOOD_RUNS['one-task-plan']![0]!}\nNEW: working | Tooltip test | being written`,
    breaks: 'piece-once',
  },
  'idle-work': {
    at: 0,
    answer: GOOD_RUNS['idle-work']![0]!.replace('NEW: working | Retry button |', 'NEW: working | Web retry bug |'),
    breaks: 'marks-true',
  },
  'stale-goal': {
    at: 4,
    answer: GOOD_RUNS['stale-goal']![4]!.replace(/^DONE: m3 [^\n]*\n/, ''),
    breaks: 'goal-left',
  },
  'goal-outcome-dropped': {
    at: 4,
    answer: GOOD_RUNS['goal-outcome-dropped']![4]!.replace(/\nRETIRE: [^\n]*/, ''),
    breaks: 'goal-left',
  },
  'milestone-split': {
    at: 0,
    answer: 'DONE: s9 | merged\nSET: m1 | working | help icon merged',
    breaks: 'milestone-size',
  },
  'next-milestone': {
    at: 1,
    answer: GOOD_RUNS['next-milestone']![1]!.replace('\nNEXT: m4', ''),
    breaks: 'milestone-next',
  },
  'child-label-repeat': {
    at: 0,
    answer:
      GOOD_RUNS['child-label-repeat']?.[0]?.replace(
        'SET: s2 | working | one PR, not merged',
        'SET: s2 | working | moving sync files into layers',
      ) ?? '',
    breaks: 'child-not-restated',
  },
  'release-plan-once': {
    at: 0,
    answer: `${GOOD_RUNS['release-plan-once']?.[0] ?? ''}\nMILESTONE: queued | Candidate approved | Waiting on your check`,
    breaks: 'no-wait-on-person',
  },
  'children-finished': {
    at: 1,
    answer: 'DONE: s1 | PDF export merged',
    breaks: 'step-left-named',
  },
  'fix-through-merge': {
    at: 1,
    answer: 'SET: s1 | working | fix merged, beta next\nNEW: working | 2.5 beta | building with the share sheet fix',
    breaks: 'marks-true',
  },
  'next-release': {
    at: 0,
    answer: `${GOOD_RUNS['next-release']![0]!.replace(/^RETIRE: [^\n]*\n/, '')}\nSERVES: Share extension | -`,
    breaks: 'goal-left',
  },
  'head-description': {
    at: 0,
    answer:
      'SET: s2 | working | syncs on reconnect, merging clashing edits left\nSET: m2 | working | syncs on reconnect\nSET: m3 | queued | not started',
    breaks: 'head-follows',
  },
  'finished-pass': {
    at: 1,
    answer: 'SET: s1 | waits-on-other | Page text done, screenshots needed\nSUGGEST: Website notes page live',
    breaks: 'goal-suggested',
  },
  'milestone-reply-landed': {
    at: 0,
    answer: GOOD_RUNS['milestone-reply-landed']![0]!.replace('DONE: m2 | all six branches on main\n', ''),
    breaks: 'milestones-true',
  },
  'milestone-last-work-done': {
    at: 0,
    answer: `${GOOD_RUNS['milestone-last-work-done']![0]!}\nNEW: working | Branch checks | checks running\nSERVES: Branch checks | m2`,
    breaks: 'milestones-true',
  },
  'unrelated-task': {
    at: 0,
    answer: `${GOOD_RUNS['unrelated-task']![0]!}\nLINK: i3 | s1`,
    breaks: 'asks-linked',
  },
  'milestone-decided': {
    at: 0,
    answer: 'SET: s1 | working | Decided "!", edit not made yet',
    breaks: 'asks-linked',
  },
  'milestone-held-by-ask': {
    at: 0,
    answer: 'SET: s3 | working | cap wired, oldest dropped for now\nSET: s2 | queued | flush on background built',
    breaks: 'marks-true',
  },
  'head-after-done': { at: 2, answer: 'HEAD: Greet flags | Adding options to greet', breaks: 'head-follows' },
}
