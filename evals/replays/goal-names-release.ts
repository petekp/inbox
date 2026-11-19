import type { Child, Subject, SubjectStatus } from '../../types'
import { factsAfter } from '../status-facts'
import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { goal, milestone, overview, subject } from './builders'
import { coordinatorDay } from './coordinator-day'

const TYPED_GOAL_STEP = coordinatorDay.steps.findIndex(s => s.events?.some(e => 'press' in e && e.press === 'type'))

/** The step's `until` waits on a folded folder row, which this page does not have. */
const { until, ...typedGoalStep } = coordinatorDay.steps[TYPED_GOAL_STEP]!

function made(
  id: string,
  status: SubjectStatus,
  name: string,
  text: string,
  createdAt: number,
  changedAt: number,
): Subject {
  return { ...subject(id, status, name, text, changedAt), createdAt: minutes(createdAt) }
}

function ended(child: Omit<Child, 'startedAt' | 'endedAt' | 'lastActivityAt'>, times: [number, number, number]): Child {
  const [startedAt, endedAt, lastActivityAt] = times.map(minutes)

  return { ...child, startedAt: startedAt!, endedAt: endedAt!, lastActivityAt: lastActivityAt! }
}

const delegate = (id: string, name: string, subjectId: string, isWorking: boolean) =>
  ({
    id,
    ref: `herdr:${name}`,
    kind: 'delegate',
    name,
    subjectId,
    delegateState: isWorking ? 'working' : null,
  }) as const

/**
 * `coordinator-day` from the page a recorded Codex run left before the person typed the goal, so each model's runs of
 * that one call are judged apart.
 */
export const goalNamesRelease: Replay = {
  name: 'goal-names-release',
  about:
    'The 2.5 goal is met and the export folder fix is under way, as its own row. The person types "Search under 100 ms in 2.6", and the milestones must cover both outcomes it names: the speed and the 2.6 release.',
  hasLedgerCalls: false,
  isShort: true,
  start: {
    ledger: {
      turn: 16,
      overview: overview({
        head: { title: 'Export folder', description: 'Fixing Windows folder choice after updates' },
        subjects: [
          made('s1', 'done', 'Sync merge', 'reconnect edits merged', -40, 40),
          made('s2', 'done', '2.4 release', 'live in both stores', -30, 40),
          made('s3', 'queued', 'Export button', 'works on web', -300, -300),
          made('s4', 'waits-on-other', 'Vendor font', 'waits on the license', -240, -240),
          made('s5', 'queued', 'Search speed', 'slow on large libraries', -200, -200),
          made('s6', 'done', 'Dark mode', 'filed for later', -180, 55),
          made('s7', 'done', 'Widgets', 'filed for later', -170, 55),
          made('s8', 'done', 'Crash on launch', 'fixed on Android', -150, -150),
          made('s9', 'done', 'Login timeout', 'fixed', -100, -100),
          made('s10', 'done', 'Backup restore', 'restores attachments', -60, -60),
          made('s11', 'done', 'Vanishing notes', 'Archive fix merged', 55, 200),
          made('s12', 'done', '2.5 release', 'Live in both stores', 55, 420),
          made('s13', 'working', 'Export folder', 'Windows update fix underway', 230, 440),
        ],
        children: [
          ended(delegate('c1', 'sm4', 's1', true), [-90, 40, -5]),
          ended(delegate('c2', 'release-notes', 's2', true), [-50, 40, -5]),
          ended(delegate('c3', 'vn2', 's11', false), [55, 200, 170]),
          ended(
            {
              id: 'c4',
              ref: 'toolu_r1',
              kind: 'subagent',
              name: 'Review the archive fix',
              subjectId: 's11',
              delegateState: null,
            },
            [170, 200, 170],
          ),
        ],
        lastLookAt: minutes(115.5),
        lastCallReadAt: minutes(440),
        goal: { ...goal('Notes 2.5 shipped', 55), metAt: minutes(420) },
        milestones: [
          milestone('m4', 'done', 'Archived notes safe', 'Archive fix merged', 200),
          milestone('m5', 'done', 'Update published', 'Live in both stores', 420),
        ],
        nextMilestoneId: 6,
        serves: { s3: 'none', s4: 'none', s5: 'none', s11: 'm4', s12: 'm5', s13: 'none' },
        suggestedGoal: 'Export folder fix shipped',
      }),
    },
    facts: coordinatorDay.steps
      .slice(0, TYPED_GOAL_STEP)
      .reduce((facts, step) => factsAfter(facts, step.facts), coordinatorDay.start.facts),
  },
  steps: [{ ...typedGoalStep, targets: ['milestones-true'] }],
}
