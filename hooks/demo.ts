import type { DemoCopy, Session, Subject } from '../types'
import { emptySession } from './session'

const MIN = 60_000
const REPO = 'https://github.com/acme/visor'

/** Where the sample session started. */
const DEMO_PLACE = { folder: '/Users/you/code/visor', branch: 'pinch-dismiss' }

/** The demo's atom outlives a hot reload, so a copy an earlier build seeded may lack a field. */
export function isDemoCopy(saved: unknown): saved is DemoCopy {
  if (!saved || typeof saved !== 'object') return false
  const d = saved as Record<string, unknown>

  const hasOverview = typeof (d.ledger as { overview?: unknown } | null)?.overview === 'object'

  return (
    hasOverview &&
    ['ledger', 'prViews', 'lastActions', 'notes', 'turns'].every(k => d[k] !== null && typeof d[k] === 'object')
  )
}

/** `s` placed where the sample started, with no turn running and the last reply 2 minutes before `now`. */
export function withDemoPresence(s: Session, now: number): Session {
  return {
    ...s,
    presence: { ...s.presence, isTurnRunning: false, lastReplyAt: now - 2 * MIN },
    place: DEMO_PLACE,
  }
}

/** The sample as a session a host can draw and press on. */
export function demoSession(now: number, agent: string): Session {
  const d = demoView(now, agent)
  const s = emptySession()

  return withDemoPresence(
    {
      ...s,
      ledger: d.ledger,
      lastActions: d.lastActions,
      prViews: d.prViews,
      presence: { ...s.presence, ...d.turns },
    },
    now,
  )
}

/** A demo subject that last changed at `at`, closed then when it is done. */
function subject(
  id: string,
  status: Subject['status'],
  name: string,
  text: string,
  at: number,
  more: Partial<Subject> = {},
): Subject {
  const isClosed = status === 'done' || status === 'dropped'

  return {
    id,
    name,
    status,
    text,
    was: null,
    merged: null,
    createdAt: at,
    changedAt: at,
    closedAt: isClosed ? at : null,
    into: null,
    ...more,
  }
}

/** The sample. `agent` names the agent that closed its closed items, as a real close does. */
export function demoView(now: number, agent: string): DemoCopy {
  return {
    ledger: {
      overview: {
        head: { title: 'Pinch to dismiss', description: 'Adding a pinch that dismisses glances' },
        subjects: [
          subject('s1', 'working', 'Dismiss gesture', 'pinch fades the glance', now - 2 * MIN),
          subject('s2', 'working', 'Glasses pairing', 'needs this Mac paired', now - 12 * MIN),
          subject('s3', 'queued', 'Flick option', 'waits on your pick', now - 12 * MIN, {
            was: 'flick and pinch both',
          }),
          subject('s4', 'done', 'Fade-out', 'dismissed glances fade', now - 25 * MIN),
          subject('s5', 'waits-on-other', 'Glasses trial', 'lenses ship Friday', now - 3 * 60 * MIN),
          subject('s6', 'done', 'Glance hit test', 'finds the glance you look at', now - 5 * 60 * MIN),
          subject('s7', 'done', 'Settings toggle', 'pinch can be turned off', now - 6 * 60 * MIN),
        ],
        children: [
          {
            id: 'c1',
            ref: 'demo-review',
            kind: 'subagent',
            name: 'Review the gesture code',
            subjectId: 's1',
            startedAt: now - 4 * MIN,
            endedAt: null,
            lastActivityAt: now - MIN,
            delegateState: null,
          },
          {
            id: 'c2',
            ref: 'demo-log',
            kind: 'background',
            name: 'Watch the pairing log',
            subjectId: 's2',
            startedAt: now - 50 * MIN,
            endedAt: null,
            lastActivityAt: null,
            delegateState: null,
          },
          {
            id: 'c3',
            ref: 'demo-tuning',
            kind: 'delegate',
            name: 'Tune how hard a pinch must be',
            subjectId: 's1',
            startedAt: now - 9 * MIN,
            endedAt: null,
            lastActivityAt: null,
            delegateState: 'blocked',
          },
          {
            id: 'c4',
            ref: 'demo-fade-timing',
            kind: 'delegate',
            name: 'Time the fade-out',
            subjectId: 's1',
            startedAt: now - 30 * MIN,
            endedAt: now - 3 * MIN,
            lastActivityAt: now - 30 * MIN,
            delegateState: 'finished',
          },
          {
            id: 'c5',
            ref: 'demo-pairing-errors',
            kind: 'subagent',
            name: 'Search the pairing errors',
            subjectId: 's2',
            startedAt: now - 25 * MIN,
            endedAt: null,
            lastActivityAt: now - 20 * MIN,
            delegateState: null,
          },
        ],
        askSubjects: { d11: 's3', d14: 's2', d17: 's2' },
        nextId: 8,
        nextChildId: 6,
        lastLookAt: now - 30 * MIN,
        look: null,
      },
      items: [
        {
          id: 'd11',
          kind: 'question',
          label: '1',
          from: 'update',
          ask: 'Dismiss a glance with a pinch, or a flick of the wrist?',
          options: ['Pinch', 'Flick'],
          rec: 'Pinch',
          isDesignChoice: true,
          helps: [],
          turn: 14,
          at: now - 12 * MIN,
        },
        {
          id: 'd12',
          kind: 'question',
          label: '2',
          from: 'update',
          ask: 'Bring a dismissed glance back when you look at it?',
          options: ['Leave it gone', 'Bring it back'],
          rec: 'Leave it gone',
          helps: [],
          turn: 14,
          at: now - 12 * MIN,
        },
        {
          id: 'd13',
          kind: 'question',
          label: '3',
          from: 'update',
          ask: 'Show glances while you are walking or driving?',
          options: ['Yes', 'No'],
          rec: 'No',
          helps: [],
          turn: 14,
          at: now - 12 * MIN,
        },
        {
          id: 'd14',
          kind: 'task',
          label: null,
          from: 'record',
          ask: 'Put on the glasses and pair them with this Mac',
          options: [],
          rec: null,
          helps: [{ kind: 'terminal', command: 'visor pair', name: 'visor pair' }],
          turn: 14,
          at: now - 5 * MIN,
        },
        {
          id: 'd15',
          kind: 'question',
          label: null,
          from: 'record',
          ask: 'What should the wake word be for the agent?',
          options: [],
          rec: null,
          helps: [],
          turn: 11,
          at: now - 40 * MIN,
        },
        {
          id: 'd16',
          kind: 'task',
          label: null,
          from: 'record',
          ask: 'Check the glances outdoors in bright sun',
          options: [],
          rec: null,
          helps: [{ kind: 'copy', text: 'http://localhost:3000/preview', name: 'preview URL' }],
          turn: 14,
          at: now - 5 * MIN,
        },
        {
          id: 'd18',
          kind: 'task',
          label: null,
          from: 'record',
          ask: 'Run the gesture tests and send back the failures',
          options: [],
          rec: null,
          helps: [{ kind: 'run', command: 'npm run test:gestures', name: 'gesture tests' }],
          turn: 14,
          at: now - 4 * MIN,
        },
        {
          id: 'd17',
          kind: 'task',
          label: null,
          from: 'record',
          ask: 'Calibrate eye tracking for the new lenses',
          options: [],
          rec: null,
          helps: [],
          turn: 12,
          at: now - 25 * MIN,
        },
      ],
      closed: [
        {
          id: 'd5',
          kind: 'question',
          ask: 'Track hands with the camera or the wristband?',
          outcome: 'Wristband',
          how: 'answered',
          at: now - 90 * MIN,
        },
        {
          id: 'd6',
          kind: 'question',
          ask: 'Commit the gesture and the anchor fix separately?',
          outcome: 'yes',
          how: 'answered',
          at: now - 60 * MIN,
        },
        {
          id: 'd9',
          kind: 'task',
          ask: 'Add the simulator key to .env.local',
          outcome: 'done',
          how: 'done',
          at: now - 45 * MIN,
        },
        {
          id: 'd7',
          kind: 'question',
          ask: 'Fall back to voice when your hands are busy?',
          outcome: `closed by ${agent}: no longer applies: voice already takes over when no hand is seen`,
          how: 'claude',
          at: now - 30 * MIN,
        },
        {
          id: 'd8',
          kind: 'question',
          ask: 'Add a gaze-only mode too?',
          outcome: 'dismissed',
          how: 'dismissed',
          at: now - 20 * MIN,
        },
        {
          id: 'd10',
          kind: 'question',
          ask: 'Fade a glance when you look away?',
          outcome: 'Yes, fade it',
          how: 'answered',
          at: now,
          item: {
            id: 'd10',
            kind: 'question',
            label: null,
            from: 'record',
            ask: 'Fade a glance when you look away?',
            options: ['Yes, fade it', 'No, keep it solid'],
            rec: 'Yes, fade it',
            helps: [],
            turn: 14,
            at: now - 12 * MIN,
          },
        },
      ],
      findings: [
        {
          id: 'd20',
          kind: 'opportunity',
          title: 'Pinch and flick could share one gesture handler',
          detail:
            'Both paths read the hand **the same way** before acting. One `onGesture` handler would keep them from *drifting apart*.',
          path: 'src/input/gestures.ts',
          at: now - 3 * 60 * MIN,
        },
        {
          id: 'd21',
          kind: 'opportunity',
          title: 'Glances could re-sort only when one moves',
          detail:
            'The view sorts every glance by distance on every frame. Sorting only when one moves would save battery on long sessions.',
          path: 'src/view/glances.ts',
          at: now - 90 * MIN,
        },
        {
          id: 'd22',
          kind: 'issue',
          title: 'Snoozed glances come back after a restart',
          detail:
            'The saved layout keeps snoozed glances, and a restart shows them again, so a glance snoozed for an hour returns at once.',
          path: 'src/view/layout.ts',
          at: now - 45 * MIN,
        },
        {
          id: 'd23',
          kind: 'issue',
          title: 'Pinned glances drift in a dim room',
          detail:
            'Anchoring trusts the camera’s position even when tracking is poor, so in a dim room a pinned glance slides a few centimeters a minute.',
          path: 'src/space/anchors.ts',
          at: now - 30 * MIN,
        },
      ],
      closedFindings: [
        {
          id: 'd19',
          kind: 'issue',
          title: 'The view redraws every glance when one changes',
          detail: 'A change to one glance redraws all of them.',
          path: 'src/view/Glance.tsx',
          at: now - 4 * 60 * MIN,
          how: 'claude',
          outcome: `closed by ${agent}: fixed, it now redraws only the glance that changed`,
          closedAt: now - 2 * 60 * MIN,
        },
      ],
      prs: ['acme/visor#31', 'acme/visor#29', 'acme/visor#33'],
      nextId: 24,
      turn: 14,
      batchTurn: 14,
      updates: 14,
    },
    stop: null,
    prViews: {
      branchRef: 'acme/visor#31',
      isFetching: false,
      views: {
        'acme/visor#31': {
          ref: 'acme/visor#31',
          number: 31,
          title: 'Add pinch-to-dismiss to glances',
          url: `${REPO}/pull/31`,
          isDraft: false,
          state: 'OPEN',
          base: 'main',
          mergeable: 'CONFLICTING',
          reviewDecision: 'CHANGES_REQUESTED',
          checks: [
            {
              name: 'format',
              bucket: 'pass',
              url: `${REPO}/actions/runs/1`,
              workflow: 'CI',
              startedAt: now - 16 * MIN,
              finishedAt: now - 16 * MIN + 19_000,
            },
            {
              name: 'unit tests',
              bucket: 'fail',
              url: `${REPO}/actions/runs/2`,
              workflow: 'CI',
              startedAt: now - 16 * MIN,
              finishedAt: now - 12 * MIN - 8_000,
            },
            {
              name: 'lint',
              bucket: 'fail',
              url: `${REPO}/actions/runs/3`,
              workflow: 'CI',
              startedAt: now - 16 * MIN,
              finishedAt: now - 15 * MIN - 19_000,
            },
            { name: 'gesture e2e', bucket: 'pending', url: null, workflow: 'CI', startedAt: now - 2 * MIN },
          ],
          threads: [
            {
              id: 'DT1',
              author: 'sam',
              reply: null,
              isWaiting: true,
              isOutdated: false,
              isLinesChanged: false,
              path: 'src/view/Glance.tsx',
              line: 47,
              body: 'A glance flickers for one frame before it fades out. Can it wait for the fade?',
              url: `${REPO}/pull/31#discussion_r1`,
              at: now - 3 * 60 * MIN,
            },
            {
              id: 'DT2',
              author: 'sam',
              reply: {
                author: 'robin',
                body: 'Agreed, the glance you look at is the one you mean.',
                url: `${REPO}/pull/31#discussion_r3`,
                at: now - 5 * 60 * MIN,
              },
              isWaiting: true,
              isOutdated: true,
              isLinesChanged: false,
              path: 'src/input/gestures.ts',
              line: 87,
              body: 'Should a pinch dismiss only the glance you look at?',
              url: `${REPO}/pull/31#discussion_r2`,
              at: now - 26 * 60 * MIN,
            },
            {
              id: 'DT3',
              author: 'robin',
              reply: {
                author: 'you',
                body: 'Done in the latest push.',
                url: `${REPO}/pull/31#discussion_r5`,
                at: now - 2 * 60 * MIN,
              },
              isWaiting: false,
              isOutdated: false,
              isLinesChanged: false,
              path: 'src/view/glances.ts',
              line: 112,
              body: 'Can the angle come from gaze.ts instead of being computed again here?',
              url: `${REPO}/pull/31#discussion_r4`,
              at: now - 26 * 60 * MIN,
            },
            {
              id: 'DT4',
              author: 'review-bot',
              reply: null,
              isWaiting: true,
              isOutdated: true,
              isLinesChanged: true,
              path: 'src/input/gestures.ts',
              line: 114,
              body: 'A dismissed glance still takes pinches.',
              url: `${REPO}/pull/31#discussion_r6`,
              at: now - 50 * MIN,
            },
          ],
          isYours: true,
          wasSeenOpen: true,
          error: null,
        },
        'acme/visor#29': {
          ref: 'acme/visor#29',
          number: 29,
          title: 'Show the battery level as a glance',
          url: `${REPO}/pull/29`,
          isDraft: false,
          state: 'OPEN',
          base: 'main',
          mergeable: 'MERGEABLE',
          reviewDecision: 'APPROVED',
          checks: [
            { name: 'format', bucket: 'pass', url: null },
            { name: 'unit tests', bucket: 'pass', url: null },
          ],
          threads: [],
          isYours: true,
          wasSeenOpen: true,
          error: null,
        },
        'acme/visor#33': {
          ref: 'acme/visor#33',
          number: 33,
          title: 'Remember where each glance was pinned',
          url: `${REPO}/pull/33`,
          isDraft: true,
          state: 'OPEN',
          base: 'main',
          mergeable: 'MERGEABLE',
          reviewDecision: '',
          checks: [
            { name: 'format', bucket: 'pass', url: null },
            { name: 'unit tests', bucket: 'pending', url: null },
          ],
          threads: [],
          isYours: true,
          wasSeenOpen: true,
          error: null,
        },
      },
    },
    lastActions: {
      d18: {
        kind: 'handoff',
        action: 'step-0',
        text: 'Run gesture tests',
        at: now - 1 * MIN,
        turnsStarted: 14,
      },
      'acme/visor#31 thread DT1': {
        kind: 'handoff',
        action: 'thread-address',
        text: 'Address',
        at: now - 2 * MIN,
        turnsStarted: 14,
      },
    },
    notes: {},
    turns: { turnsStarted: 14, turnsApplied: 14 },
  }
}
