import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { delegate, goal, milestone, NO_FACTS, overview, piece, question, subject } from './builders'

/**
 * The busy page a coordinator's day starts from, last seen two hours earlier. Its goal is 2.4 in the store: one milestone
 * done and two under way. The export button is linked under Other work, and the rest of the queued work is not linked yet.
 */
export const coordinatorDayStart: Replay['start'] = {
  place: { folder: '/work/notes', branch: 'main' },
  ledger: {
    turn: 6,
    items: [question('i1', 'Approve the 2.4 release notes?', -30)],
    overview: overview({
      head: { title: '2.4 release', description: 'Shipping notes 2.4 to the stores' },
      subjects: [
        subject('s1', 'working', 'Sync merge', 'merge on reconnect in review', -40),
        subject('s2', 'working', '2.4 release', 'notes drafted, build signed', -30),
        subject('s3', 'queued', 'Export button', 'works on web', -300),
        subject('s4', 'waits-on-other', 'Vendor font', 'waits on the license', -240),
        subject('s5', 'queued', 'Search speed', 'slow on large libraries', -200),
        subject('s6', 'queued', 'Dark mode', 'design picked', -180),
        subject('s7', 'queued', 'Widgets', 'not started', -170),
        subject('s8', 'done', 'Crash on launch', 'fixed on Android', -150),
        subject('s9', 'done', 'Login timeout', 'fixed', -100),
        subject('s10', 'done', 'Backup restore', 'restores attachments', -60),
      ],
      children: [delegate('c1', 'sm4', 's1', -90), delegate('c2', 'release-notes', 's2', -50)],
      askSubjects: { i1: 's2' },
      lastLookAt: minutes(-120),
      goal: goal('Notes 2.4 in the store', -200),
      milestones: [
        milestone('m1', 'done', 'Bugs fixed', 'crash, login and backup fixed', -60),
        milestone('m2', 'working', 'Sync merges edits', 'in review', -40),
        milestone('m3', 'working', 'Live in store', 'notes drafted', -30),
      ],
      nextMilestoneId: 4,
      serves: { s1: 'm2', s2: 'm3', s3: 'none', s8: 'm1', s9: 'm1', s10: 'm1' },
    }),
  },
  facts: {
    ...NO_FACTS,
    focus: 'shipping notes 2.4',
    focusMatch: '2\\.4',
    goal: {
      text: 'Notes 2.4 in the store',
      match: '2\\.4',
      milestones: [
        { id: 'ms-fixes', name: 'Bugs fixed', match: 'bug', state: 'done' },
        { id: 'ms-merge', name: 'Sync merges edits', match: 'merge', state: 'working' },
        { id: 'ms-live24', name: 'Live in store', match: 'live', state: 'working' },
      ],
    },
    pieces: [
      piece({
        id: 'merge',
        names: ['Sync merge'],
        match: 'merge',
        state: 'working',
        stands: 'in review',
        serves: 'ms-merge',
      }),
      piece({
        id: 'r24',
        names: ['2.4 release'],
        match: '2\\.4',
        state: 'working',
        stands: 'notes drafted',
        serves: 'ms-live24',
      }),
      piece({
        id: 'export',
        names: ['Export button'],
        match: 'button',
        state: 'set-aside',
        stands: 'works on web',
        serves: 'none',
      }),
      piece({
        id: 'font',
        names: ['Vendor font'],
        match: 'font',
        state: 'waits-on-other',
        stands: 'waits on the license',
        serves: 'none',
      }),
      piece({
        id: 'search',
        names: ['Search speed'],
        match: 'search',
        state: 'queued',
        stands: 'slow on large libraries',
        serves: 'none',
      }),
      piece({
        id: 'dark',
        names: ['Dark mode'],
        match: 'dark',
        state: 'queued',
        stands: 'design picked',
        serves: 'none',
      }),
      piece({
        id: 'widgets',
        names: ['Widgets'],
        match: 'widget',
        state: 'queued',
        stands: 'not started',
        serves: 'none',
      }),
      piece({
        id: 'crash',
        names: ['Crash on launch'],
        match: 'crash',
        state: 'done',
        stands: 'fixed on Android',
        serves: 'ms-fixes',
      }),
      piece({
        id: 'login',
        names: ['Login timeout'],
        match: 'login',
        state: 'done',
        stands: 'fixed',
        serves: 'ms-fixes',
      }),
      piece({
        id: 'backup',
        names: ['Backup restore'],
        match: 'backup',
        state: 'done',
        stands: 'restores attachments',
        serves: 'ms-fixes',
      }),
    ],
    asks: [{ match: 'release notes', text: 'Approve the 2.4 release notes?', holdsUp: ['r24'] }],
    children: [
      { ref: 'herdr:sm4', does: 'Merge edits made on two devices', serves: 'merge' },
      { ref: 'herdr:release-notes', does: 'Write the 2.4 release notes', serves: 'r24' },
    ],
  },
}
