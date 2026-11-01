import type { SubjectStatus } from '../../types'
import type { Piece } from '../status-facts'
import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { goal, milestone, NO_FACTS, overview, subject } from './builders'

type Row = [id: string, status: SubjectStatus, name: string, text: string, match: string, serves: string]

/** The busy page's open work: nine pieces the goal needs, three per milestone, and nine it does not. */
const ROWS: Row[] = [
  ['share', 'working', 'Share sheet', 'opens from any notebook', 'share sheet', 'ms-shared'],
  ['invite', 'working', 'Invite links', 'link made, not opened yet', 'invite', 'ms-shared'],
  ['roles', 'queued', 'Access roles', 'viewer and editor planned', 'roles', 'ms-shared'],
  ['cursors', 'queued', 'Live cursors', 'design picked', 'cursor', 'ms-merge'],
  ['merging', 'queued', 'Edit merging', 'not started', 'merging', 'ms-merge'],
  ['offline', 'queued', 'Offline edits', 'after edit merging', 'offline', 'ms-merge'],
  ['build', 'queued', 'Beta build', 'not started', 'beta build', 'ms-testers'],
  ['testers', 'queued', 'Tester group', 'twelve testers named', 'tester', 'ms-testers'],
  ['feedback', 'queued', 'Feedback form', 'draft written', 'feedback', 'ms-testers'],
  ['dark', 'queued', 'Dark mode', 'design picked', 'dark', 'none'],
  ['widgets', 'queued', 'Widgets', 'not started', 'widget', 'none'],
  ['export', 'queued', 'Export folder', 'cause found', 'export', 'none'],
  ['vendor', 'waits-on-other', 'Vendor font', 'waits on the license', 'vendor', 'none'],
  ['search', 'queued', 'Search speed', 'slow on large libraries', 'search', 'none'],
  ['tags', 'queued', 'Tag colors', 'palette picked', 'tag', 'none'],
  ['print', 'queued', 'Print layout', 'margins off on A4', 'print', 'none'],
  ['sizes', 'queued', 'Font sizes', 'three sizes planned', 'font size', 'none'],
  ['crashes', 'working', 'Crash reports', 'one crash on tablets', 'crash', 'none'],
]

const pieceOf = ([id, status, name, text, match, serves]: Row): Piece => ({
  id,
  names: [name],
  match,
  state: status === 'queued' ? 'queued' : status === 'working' ? 'working' : 'waits-on-other',
  stands: text,
  serves,
})

/** A page with 18 open subjects and a goal the person just accepted, so no subject is linked yet. */
export const goalOnBusyPage: Replay = {
  name: 'goal-on-busy-page',
  about:
    'A busy page with 18 open subjects, just after the person accepted a goal. One reply, and the call links each subject to the milestone it serves, or to none.',
  hasLedgerCalls: false,
  isShort: true,
  start: {
    ledger: {
      turn: 12,
      overview: overview({
        head: { title: 'Shared notebooks', description: 'Letting people share a notebook' },
        subjects: ROWS.map(([, status, name, text], n) => subject(`s${n + 1}`, status, name, text, -60 + n)),
        lastLookAt: minutes(-20),
        goal: goal('Shared notebooks in beta', -2),
        milestones: [
          milestone('m1', 'working', 'Notebooks shared', '', -2),
          milestone('m2', 'queued', 'Live edits merge', '', -2),
          milestone('m3', 'queued', 'Testers invited', '', -2),
        ],
        nextMilestoneId: 4,
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'sharing notebooks',
      focusMatch: 'shar',
      goal: {
        text: 'Shared notebooks in beta',
        match: 'shared notebooks',
        milestones: [
          { id: 'ms-shared', name: 'Notebooks shared', match: 'shared', state: 'working' },
          { id: 'ms-merge', name: 'Live edits merge', match: 'merge', state: 'queued' },
          { id: 'ms-testers', name: 'Testers invited', match: 'tester', state: 'queued' },
        ],
      },
      pieces: ROWS.map(pieceOf),
    },
  },
  steps: [
    {
      label: 'One reply moves the invite links, and the call links every subject',
      at: 5,
      call: {
        kind: 'reply',
        person: 'Go on with the invites.',
        activity: ['Edited src/share/invite.ts', 'Ran: npm test -- share (16 passed)'],
        reply: 'Invite links now open the notebook for the person invited, as a viewer. Access roles are next.',
      },
      facts: { pieces: [{ id: 'invite', stands: 'open the notebook as a viewer' }] },
      targets: ['serves-linked'],
    },
  ],
}
