import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import type { MilestoneFact, Piece } from '../status-facts'
import { goal, milestone, NO_FACTS, overview, subject } from './builders'

const FIXES: [string, string, string][] = [
  ['s1', 'Help indent', 'help indent'],
  ['s2', 'Class name check', 'class name'],
  ['s3', 'Title buttons', 'title button'],
  ['s4', 'Status folds', 'status fold'],
  ['s5', 'Desktop margin', 'desktop margin'],
  ['s6', 'Help columns', 'help column'],
  ['s7', 'Row bar align', 'row bar'],
  ['s8', 'Mark colors', 'mark color'],
]

const OPEN: Piece[] = [
  { id: 's9', names: ['Help icon'], match: 'help icon', state: 'working', stands: 'fix in review', serves: 'ms-fixes' },
  {
    id: 's10',
    names: ['CSV export'],
    match: 'csv',
    state: 'working',
    stands: 'columns picked',
    serves: 'ms-fixes',
  },
  {
    id: 's11',
    names: ['PDF export'],
    match: 'pdf',
    state: 'queued',
    stands: 'not started',
    serves: 'ms-fixes',
  },
  {
    id: 's12',
    names: ['Welcome tour'],
    match: 'welcome',
    state: 'queued',
    stands: 'not started',
    serves: 'ms-fixes',
  },
  {
    id: 's13',
    names: ['Sample notes'],
    match: 'sample',
    state: 'queued',
    stands: 'not started',
    serves: 'ms-fixes',
  },
]

const FIXES_MILESTONE: MilestoneFact = { id: 'ms-fixes', name: 'Fixes merged', match: 'fixes', state: 'working' }
const RELEASE_MILESTONE: MilestoneFact = { id: 'ms-release', name: 'Release built', match: 'release', state: 'queued' }

/** A milestone of a typed goal that 13 subjects serve, 8 of them done, is split by theme on an exchange that never asks for it. */
export const milestoneSplit: Replay = {
  name: 'milestone-split',
  about:
    'The person typed the goal "Inbox 2.0 shipped". Its milestone "Fixes merged" holds 8 done fixes and 5 open pieces: a fix in review, two export pieces and two onboarding pieces. One reply merges the fix and names the other four. The milestone is split by theme, its done fixes stay with it and it closes, and the typed goal stays.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 30,
      overview: overview({
        head: { title: 'Inbox 2.0', description: 'Fixing the inbox, then shipping 2.0' },
        subjects: [
          ...FIXES.map(([id, name], n) => subject(id, 'done', name, 'merged', -280 + n * 25)),
          subject('s9', 'working', 'Help icon', 'fix in review', -40),
          subject('s10', 'working', 'CSV export', 'columns picked', -35),
          subject('s11', 'queued', 'PDF export', 'not started', -30),
          subject('s12', 'queued', 'Welcome tour', 'not started', -30),
          subject('s13', 'queued', 'Sample notes', 'not started', -30),
        ],
        lastLookAt: minutes(-20),
        goal: goal('Inbox 2.0 shipped', -300, 'typed'),
        milestones: [
          milestone('m1', 'working', 'Fixes merged', '', -300),
          milestone('m2', 'queued', 'Release built', '', -300),
        ],
        nextMilestoneId: 3,
        serves: Object.fromEntries([...FIXES.map(([id]) => id), ...OPEN.map(p => p.id)].map(id => [id, 'm1'])),
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'fixing the inbox, then shipping 2.0',
      focusMatch: 'inbox|2\\.0',
      goal: { text: 'Inbox 2.0 shipped', match: '2\\.0', milestones: [FIXES_MILESTONE, RELEASE_MILESTONE] },
      pieces: [
        ...FIXES.map(([id, name, match]): Piece => ({
          id,
          names: [name],
          match,
          state: 'done',
          stands: 'merged',
          serves: 'ms-fixes',
        })),
        ...OPEN,
      ],
    },
  },
  steps: [
    {
      label: 'The help icon fix merges, and the reply names the export and onboarding pieces that come next',
      at: 5,
      call: {
        kind: 'reply',
        person: 'Merge the help icon fix, then keep going.',
        activity: ['gh pr merge 512 --merge'],
        reply:
          'The help icon fix is merged. Next I finish CSV export and build PDF export, then the welcome tour and the sample notes a new user starts with.',
      },
      facts: {
        goal: {
          text: 'Inbox 2.0 shipped',
          match: '2\\.0',
          milestones: [
            { ...FIXES_MILESTONE, state: 'done' },
            RELEASE_MILESTONE,
            { id: 'ms-export', name: 'Export shipped', match: 'export', state: 'working', alsoRight: ['queued'] },
            {
              id: 'ms-onboarding',
              name: 'Onboarding ready',
              match: 'onboard|welcome|tour|new user',
              state: 'queued',
              alsoRight: ['working'],
            },
          ],
        },
        pieces: [
          { id: 's9', state: 'done', stands: 'merged' },
          { id: 's10', serves: 'ms-export' },
          { id: 's11', serves: 'ms-export' },
          { id: 's12', serves: 'ms-onboarding' },
          { id: 's13', serves: 'ms-onboarding' },
        ],
      },
      targets: ['milestone-size', 'milestones-true', 'goal-kept'],
    },
  ],
}
