import type { Replay } from '../status-replay'
import { minutes } from '../status-replay'
import { NO_FACTS, overview, piece, subject } from './builders'

const releases = [
  piece({
    id: 'r24',
    names: ['2.4 release'],
    match: '2\\.4',
    state: 'working',
    stands: 'build being signed',
    alsoRight: ['waits-on-other'],
  }),
  piece({
    id: 'hotfix',
    names: ['Hotfix release', '2.3.1 hotfix'],
    match: 'hotfix|2\\.3\\.1',
    state: 'working',
    stands: 'build being signed',
    alsoRight: ['waits-on-other'],
  }),
]

/** One task the agent cannot do holds up two releases at once. */
export const askHoldsTwo: Replay = {
  name: 'ask-holds-two',
  about: 'One task, signing in to the app store, holds up two releases, and the call links it to both.',
  hasLedgerCalls: false,
  start: {
    ledger: {
      turn: 4,
      overview: overview({
        head: { title: 'App store releases', description: 'Shipping the 2.4 release and the 2.3.1 hotfix' },
        subjects: [
          subject('s1', 'working', '2.4 release', 'build being signed', -20),
          subject('s2', 'working', 'Hotfix release', 'build being signed', -18),
        ],
        lastLookAt: minutes(-10),
      }),
    },
    facts: {
      ...NO_FACTS,
      focus: 'shipping the 2.4 release and the 2.3.1 hotfix',
      focusMatch: 'release|hotfix|2\\.4|store',
      pieces: releases,
    },
  },
  steps: [
    {
      label: 'Both builds are signed, and both uploads wait on one sign-in only the person can do',
      at: 5,
      events: [{ askOpens: { id: 'i1', ask: 'Sign in to App Store Connect', kind: 'task' } }],
      call: {
        kind: 'reply',
        person: 'Upload both builds when they are signed.',
        activity: ['Signed the 2.4 build', 'Signed the 2.3.1 hotfix build', 'Upload failed: not signed in'],
        reply:
          'Both builds are signed: 2.4 and the 2.3.1 hotfix. Neither can upload until you sign in to App Store Connect, which I cannot do for you. Once you sign in, I upload both.',
      },
      facts: {
        pieces: [
          { id: 'r24', stands: 'build signed; upload waits on the app store sign-in' },
          { id: 'hotfix', stands: 'build signed; upload waits on the app store sign-in' },
        ],
        asks: [{ match: 'app store', text: 'Sign in to App Store Connect', holdsUp: ['r24', 'hotfix'] }],
      },
      targets: ['asks-linked', 'ask-holds-several', 'open-pieces-kept'],
    },
  ],
}
