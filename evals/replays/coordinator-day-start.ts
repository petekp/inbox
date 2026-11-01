import { minutes } from '../status-replay'
import type { Replay } from '../status-replay'
import { delegate, NO_FACTS, overview, piece, question, subject } from './builders'

/** The busy page a coordinator's day starts from, last seen two hours earlier. */
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
    }),
  },
  facts: {
    ...NO_FACTS,
    focus: 'shipping notes 2.4',
    focusMatch: '2\\.4',
    pieces: [
      piece({ id: 'merge', names: ['Sync merge'], match: 'merge', state: 'working', stands: 'in review' }),
      piece({ id: 'r24', names: ['2.4 release'], match: '2\\.4', state: 'working', stands: 'notes drafted' }),
      piece({ id: 'export', names: ['Export button'], match: 'button', state: 'set-aside', stands: 'works on web' }),
      piece({
        id: 'font',
        names: ['Vendor font'],
        match: 'font',
        state: 'waits-on-other',
        stands: 'waits on the license',
      }),
      piece({
        id: 'search',
        names: ['Search speed'],
        match: 'search',
        state: 'queued',
        stands: 'slow on large libraries',
      }),
      piece({ id: 'dark', names: ['Dark mode'], match: 'dark', state: 'queued', stands: 'design picked' }),
      piece({ id: 'widgets', names: ['Widgets'], match: 'widget', state: 'queued', stands: 'not started' }),
      piece({ id: 'crash', names: ['Crash on launch'], match: 'crash', state: 'done', stands: 'fixed on Android' }),
      piece({ id: 'login', names: ['Login timeout'], match: 'login', state: 'done', stands: 'fixed' }),
      piece({
        id: 'backup',
        names: ['Backup restore'],
        match: 'backup',
        state: 'done',
        stands: 'restores attachments',
      }),
    ],
    asks: [{ match: 'release notes', text: 'Approve the 2.4 release notes?', holdsUp: ['r24'] }],
    children: [
      { ref: 'herdr:sm4', does: 'Merge edits made on two devices', serves: 'merge' },
      { ref: 'herdr:release-notes', does: 'Write the 2.4 release notes', serves: 'r24' },
    ],
  },
}
