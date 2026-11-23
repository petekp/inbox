import type { Child } from '../../types'
import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { goal, milestone, NO_FACTS, overview, piece, subject } from './builders'

const landing: Child = {
  id: 'c1',
  ref: 'herdr:land-main',
  kind: 'delegate',
  name: 'Running checks and pushing the branches to main',
  subjectId: null,
  startedAt: minutes(-17),
  endedAt: minutes(-1),
  lastActivityAt: minutes(-17),
  delegateState: 'finished',
}

const ciFix: Child = {
  id: 'c2',
  ref: 'herdr:editor-ci-fix',
  kind: 'delegate',
  name: 'editor ci fix',
  subjectId: null,
  startedAt: minutes(-1),
  endedAt: null,
  lastActivityAt: minutes(-1),
  delegateState: 'working',
}

/**
 * A reply says every branch a milestone is for is on main, while one branch's subject still has a failing check. In a
 * real session the Status call closed the finished subjects but not the milestone. The CI fix may stay under the
 * editor change's subject, which is done or still working, or get a subject of its own.
 */
export const milestoneReplyLanded: Replay = {
  name: 'milestone-reply-landed',
  about:
    'A goal to get feature branches onto main: its first milestone is done, and "Remaining branches" is working with six working subjects. A delegate lands every branch. The reply says all of them are on main, that one browser test now fails on GitHub, and that a new session fixes it.',
  hasLedgerCalls: false,
  isShort: true,
  start: {
    ledger: {
      turn: 30,
      items: [],
      overview: overview({
        head: { title: 'Notes app', description: 'Landing the feature branches, reviewing the sync proposal' },
        subjects: [
          subject('s1', 'working', 'Branch landing', 'landing six branches through a delegate', -17),
          subject('s2', 'working', 'Export API', 'step one built, not pushed', -18 * 60),
          subject('s3', 'working', 'Editor speedups', 'both upstream issues posted', -5 * 60),
          subject('s4', 'working', 'Decision log split', 'split done, citation fixes in', -17 * 60),
          subject('s5', 'working', 'Dependency audit', 'image library upgrade accepted, landing later', -6 * 60),
          subject('s6', 'working', 'Stale label bug', 'fix verified, not landed', -16 * 60),
        ],
        children: [landing, ciFix],
        lastLookAt: minutes(-2.5 * 60),
        goal: goal('Feature branches on main', -6 * 60),
        milestones: [
          milestone('m1', 'done', 'Cleanup on main', 'on main, matches GitHub', -20),
          milestone('m2', 'working', 'Remaining branches', 'six not on main yet, docs conflicts', -20),
        ],
        nextMilestoneId: 3,
        serves: { s1: 'none', s2: 'm2', s3: 'm2', s4: 'm2', s5: 'm2', s6: 'm2' },
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'landing the feature branches of the notes app on main',
      focusMatch: 'notes|branch|main|land',
      goal: {
        text: 'Feature branches on main',
        match: 'branch',
        milestones: [
          { id: 'ms-cleanup', name: 'Cleanup on main', match: 'cleanup', state: 'done' },
          { id: 'ms-branches', name: 'Remaining branches', match: 'remaining', state: 'working' },
        ],
      },
      pieces: [
        piece({
          id: 'landing',
          names: ['Branch landing'],
          match: 'landing',
          state: 'working',
          stands: 'landing six branches through a delegate',
          serves: 'none',
          servesAlso: 'ms-branches',
        }),
        piece({ id: 'export', names: ['Export API'], match: 'export', state: 'working', stands: 'step one built' }),
        piece({
          id: 'editor',
          names: ['Editor speedups', 'Editor CI fix', 'editor reorder test'],
          match: 'speedup|\\bci\\b|reorder|browser test',
          state: 'working',
          stands: 'both upstream issues posted',
        }),
        piece({ id: 'log', names: ['Decision log split'], match: 'decision', state: 'working', stands: 'split done' }),
        piece({
          id: 'deps',
          names: ['Dependency audit'],
          match: 'depend|audit',
          state: 'working',
          stands: 'upgrade accepted',
        }),
        piece({ id: 'stale', names: ['Stale label bug'], match: 'stale', state: 'working', stands: 'fix verified' }),
      ],
    },
  },
  steps: [
    {
      label: 'The landing delegate finishes, and the reply says every branch is on main and one check fails',
      at: 0,
      call: {
        kind: 'reply',
        person: null,
        activity: [
          'ran: git cherry origin/main export-api',
          'ran: git cherry origin/main editor-speedups',
          'ran: git cherry origin/main decision-log-split',
          'ran: git cherry origin/main dependency-cleanup',
          'ran: git cherry origin/main stale-label-fix',
          'ran: git fetch -q origin',
          'ran: git log --oneline -8 origin/main',
          'ran: gh run list --branch main --limit 3',
          'ran: git worktree add ../worktrees/notes/editor-ci-fix -b editor-ci-fix origin/main',
          'edited ../worktrees/notes/editor-ci-fix/.scratch/BRIEF.md',
          'ran: start agent session editor-ci-fix "Fix the editor reorder test in CI"',
          'ran: end agent session export-api',
          'ran: end agent session decision-log-split',
          'ran: end agent session dependency-cleanup',
          'ran: end agent session stale-label-fix',
        ],
        reply: [
          "All six branches are now on main. GitHub's checks are red on one browser test, and I've started an agent session to fix it.",
          '',
          "**Landed:** main matches GitHub and your checkout, and `git cherry` shows nothing from the branches is missing. Each branch came in through a merge commit. The conflicts were in docs, the changelog and the lockfile. The landing session kept main's wording and added each branch's change on top.",
          '',
          '**Passed:** on this Mac, the merged result passes lint, typecheck, every unit test, the app build and the browser tests. On GitHub, the general checks pass.',
          '',
          "**Failing on GitHub:** the browser-tests job fails at the editor reorder test, the same way on both attempts. That test passed on GitHub before this landing. It comes from the editor speedups change, which had never run on GitHub's machines before.",
          '',
          '**Fix under way:** I chose to fix forward rather than revert. The new session runs in the tab "Fix the editor reorder test in CI". It is done only when GitHub\'s checks pass.',
          '',
          '**Cleanup:** I removed the worktrees and branches of the landed delegates and closed their sessions.',
        ].join('\n'),
      },
      facts: {
        focus: 'getting the notes app main branch green: fixing the editor reorder test in CI',
        focusMatch: 'notes|editor|\\bci\\b|test|main',
        milestones: [{ id: 'ms-branches', state: 'done' }],
        pieces: [
          { id: 'landing', state: 'done', stands: 'all six branches on main' },
          { id: 'export', state: 'done', stands: 'on main' },
          {
            id: 'editor',
            state: 'working',
            stands: 'on main, its browser test fails on GitHub, fix under way',
            alsoRight: ['done'],
          },
          { id: 'log', state: 'done', stands: 'on main' },
          { id: 'deps', state: 'done', stands: 'on main' },
          { id: 'stale', state: 'done', stands: 'fix on main' },
        ],
        children: [{ ref: 'herdr:editor-ci-fix', does: 'fixes the editor reorder test in CI', serves: 'editor' }],
      },
      targets: ['milestones-true'],
    },
  ],
}
