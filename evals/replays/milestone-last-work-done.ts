import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { goal, milestone, NO_FACTS, overview, piece, subject } from './builders'

/**
 * A milestone whose words went stale while its work finished, and one linked subject still working. The reply says
 * that subject landed. In a real session the Status call closed the subject and wrote the milestone working again in
 * its old words, which held it open.
 */
export const milestoneLastWorkDone: Replay = {
  name: 'milestone-last-work-done',
  about:
    'A goal to get feature branches onto main: its first milestone is done, and "Remaining branches" still reads working in words from hours ago. Every subject linked to it closed but one, which is working. The reply says that last piece is on main and its checks passed.',
  hasLedgerCalls: false,
  isShort: true,
  start: {
    ledger: {
      turn: 39,
      items: [],
      overview: overview({
        head: { title: 'Notes app', description: 'Designing the export API, fixing card animations' },
        subjects: [
          subject('s1', 'done', 'Branch landing', 'all six branches on main', -6 * 60),
          subject('s2', 'done', 'Export API', 'landed on main', -6 * 60),
          subject('s3', 'done', 'Sync proposal', 'design note and review finished', -50),
          subject('s4', 'done', 'Editor speedups', 'landed, main checks green', -5 * 60),
          subject('s5', 'done', 'Decision log split', 'landed on main', -6 * 60),
          subject('s6', 'done', 'Stale label bug', 'fix landed on main', -6 * 60),
          subject('s7', 'done', 'Editor CI fix', 'browser test fixed, main checks green', -5 * 60),
          subject('s8', 'dropped', 'Renderer split', 'plan dropped by the person', -3 * 60),
          subject('s9', 'working', 'Export API design', 'API pushed, checks running', -10),
          subject('s10', 'working', 'Card animation fixes', 'corner fix and tuning panel on main', -10),
        ],
        lastLookAt: minutes(-8.5 * 60),
        goal: goal('Feature branches on main', -12 * 60),
        milestones: [
          milestone('m1', 'done', 'Cleanup on main', 'on main, matches GitHub', -6.2 * 60),
          milestone('m2', 'working', 'Remaining branches', 'six not on main yet, docs conflicts', -6.2 * 60),
        ],
        nextMilestoneId: 3,
        serves: {
          s1: 'none',
          s2: 'm2',
          s3: 'm2',
          s4: 'm2',
          s5: 'm2',
          s6: 'm2',
          s7: 'm2',
          s8: 'm2',
          s9: 'm2',
          s10: 'none',
        },
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'the export API design and the card animation fixes in the notes app',
      focusMatch: 'notes|export|card|animation',
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
          id: 'design',
          names: ['Export API design'],
          match: 'design',
          state: 'working',
          stands: 'API pushed, checks running',
          serves: 'ms-branches',
        }),
        piece({
          id: 'cards',
          names: ['Card animation fixes'],
          match: 'card|animation',
          state: 'working',
          stands: 'corner fix and tuning panel on main',
          serves: 'none',
        }),
      ],
    },
  },
  steps: [
    {
      label: 'The reply says the export API is on main and its checks passed',
      at: 0,
      call: {
        kind: 'reply',
        person: null,
        activity: [
          'ran: git fetch -q origin',
          'ran: git rev-parse origin/main',
          'ran: gh api repos/example/notes/actions/runs --jq "[.workflow_runs[] | {id, conclusion}]"',
          'ran: end agent session export-api-design',
          'edited docs/backlog.md',
        ],
        reply: [
          "The public export API is on main, and GitHub's checks passed. I closed that session and removed its worktree and branch.",
          '',
          'The session found three follow-ups:',
          '',
          '1. **The 1-second limit counts from when the export starts.** In a burst, a request that waited behind others gets less time before it gives up.',
          "2. **The README is over the repo's size limit.** The commit hook now blocks any new README line.",
          '3. **One size budget is now well under its limit.** It should be recorded again in a separate change.',
          '',
          'The other follow-ups are in the backlog.',
          '',
          'The card animation dev server is still running. Tell me when you are done with the tuning panel and I will stop it.',
        ].join('\n'),
      },
      facts: {
        focus: 'the card animation fixes in the notes app',
        focusMatch: 'notes|card|animation',
        milestones: [{ id: 'ms-branches', state: 'done' }],
        pieces: [{ id: 'design', state: 'done', stands: 'API on main, checks passed' }],
      },
      targets: ['milestones-true'],
    },
  ],
}
