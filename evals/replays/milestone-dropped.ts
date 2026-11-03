import type { Replay } from '../status-replay'
import { minutes } from '../status-replay'
import { goal, milestone, NO_FACTS, overview, subject } from './builders'

export const milestoneDropped: Replay = {
  name: 'milestone-dropped',
  about:
    'A goal with three milestones. In one message the person cuts one, whose work must be linked again, and splits a subject that was folded into another back out.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 8,
      overview: overview({
        head: { title: '2.5 release', description: 'Getting notes 2.5 out' },
        subjects: [
          subject('s1', 'working', 'Sync conflicts', 'merge on reconnect drafted', -50),
          subject('s2', 'queued', 'Store screenshots', 'not started', -48),
          subject('s3', 'queued', 'Review notes', 'draft started', -46),
          { ...subject('s4', 'queued', 'Theme editor', 'colors picked', -40), merged: 'Tag colors' },
          { ...subject('s5', 'dropped', 'Tag colors', 'part of the theme editor', -40), into: 's4' },
          subject('s6', 'queued', 'Changelog', 'not started', -38),
        ],
        lastLookAt: minutes(-20),
        goal: goal('Notes 2.5 in the store', -60),
        milestones: [
          milestone('m1', 'working', 'Sync fixed', '', -60),
          milestone('m2', 'queued', 'Store review', '', -60),
          milestone('m3', 'queued', 'Release notes', '', -60),
        ],
        nextMilestoneId: 4,
        serves: { s1: 'm1', s2: 'm2', s3: 'm2', s4: 'none', s6: 'm3' },
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'the notes 2.5 release',
      focusMatch: '2\\.5',
      goal: {
        text: 'Notes 2.5 in the store',
        match: '2\\.5',
        milestones: [
          { id: 'ms-sync', name: 'Sync fixed', match: 'sync', state: 'working' },
          { id: 'ms-review', name: 'Store review', match: 'store review', state: 'queued' },
          { id: 'ms-notes', name: 'Release notes', match: 'release notes', state: 'queued' },
        ],
      },
      pieces: [
        {
          id: 'sync',
          names: ['Sync conflicts'],
          match: 'sync',
          state: 'working',
          stands: 'merge on reconnect drafted',
          serves: 'ms-sync',
        },
        {
          id: 'screenshots',
          names: ['Store screenshots'],
          match: 'screenshot',
          state: 'queued',
          stands: 'not started',
          serves: 'ms-review',
        },
        {
          id: 'review',
          names: ['Review notes'],
          match: 'review note',
          state: 'queued',
          stands: 'draft started',
          serves: 'ms-review',
        },
        {
          id: 'theme',
          names: ['Theme editor'],
          match: 'theme',
          state: 'queued',
          stands: 'colors picked',
          merged: ['tags'],
          serves: 'none',
        },
        { id: 'tags', names: ['Tag colors'], match: 'tag', state: 'dropped', stands: 'part of the theme editor' },
        {
          id: 'changelog',
          names: ['Changelog'],
          match: 'changelog',
          state: 'queued',
          stands: 'not started',
          serves: 'ms-notes',
        },
      ],
    },
  },
  steps: [
    {
      label: 'The person cuts the store review from 2.5 and splits tag colors back out of the theme editor',
      at: 5,
      call: {
        kind: 'reply',
        person:
          'Take the store review out of 2.5. We ship 2.5 as a web beta first, so screenshots and review notes wait. And split tag colors back out of the theme editor: they need their own setting.',
        activity: [],
        reply:
          '2.5 now ships as a web beta. Store screenshots and review notes wait for the store release. Tag colors are their own piece again, with a setting of their own. Nothing is built for it yet.',
      },
      facts: {
        milestones: [{ id: 'ms-review', state: 'dropped' }],
        pieces: [
          { id: 'screenshots', stands: 'waits for the store release', serves: 'none' },
          { id: 'review', stands: 'waits for the store release', serves: 'none' },
          { id: 'tags', state: 'queued', stands: 'own setting planned' },
        ],
      },
      targets: ['serves-linked', 'milestones-true', 'open-pieces-kept'],
    },
  ],
}
