import { expect, test } from 'bun:test'

import { ago } from '../../core/domain/text'
import { bannerOf } from '../../core/view/banners'
import { HOOKS_TRUST_TEXT } from '../../core/view/hooks-trust'
import { demoSession } from '../../core/view/demo'
import { herdrEnvelope } from '../../core/remote/herdr-envelope'
import { readSession } from '../../core/remote/herdr-read'
import { DOT } from '../../core/view/rows'
import type { ShownTab } from '../../core/view/tabs'
import type { LastAction, Stop } from '../../types'
import type { Block } from '../src/blocks'
import { screenOf } from '../src/screen'
import { AGENT, NOW, lookPresses, uiOn } from './fixtures'

const FOLLOWED = { is: 'session', terminal: 't1', sessionId: 's1' } as const
const OVERLOADED: Stop = {
  kind: 'api-error',
  apiError: { cause: 'overloaded', text: null },
  detail: 'overloaded_error',
  resets: null,
  at: NOW - 3 * 60_000,
}
const USAGE_LIMIT: Stop = {
  kind: 'usage-limit',
  apiError: null,
  detail: 'rate_limit',
  resets: '7:33pm',
  at: NOW - 60_000,
}

type Published = {
  stop?: Stop | null
  remoteActions?: string[]
  resumed?: LastAction
  hooksTrust?: unknown
}

function screenFor(
  o: Published,
  tab: ShownTab = 'needsYou',
  pressNote: { text: string; isError: boolean } | null = null,
) {
  const s = demoSession(NOW, AGENT)
  const session = {
    ...s,
    stop: o.stop ?? null,
    lastActions: o.resumed ? { ...s.lastActions, session: o.resumed } : s.lastActions,
  }
  const source = { host: 'claude-code' as const, agent: AGENT, sessionId: 's1', terminal: 't1', writtenAt: NOW }
  const envelope = herdrEnvelope({ ...source, ...(o.remoteActions && { remoteActions: o.remoteActions }) }, session)
  const read = readSession(
    JSON.stringify({ ...envelope, ...(o.hooksTrust !== undefined && { hooksTrust: o.hooksTrust }) }),
  )
  const screen = screenOf(FOLLOWED, read, uiOn(tab), { ...lookPresses(read), pressNote })
  if (screen.is !== 'inbox') throw new Error('the published session did not draw an inbox')
  return screen
}

const stopOf = (blocks: Block[]) => {
  const first = blocks[0]
  return first?.kind === 'banner' && first.id === 'session' ? first : null
}

test('a stop Resume continues past draws at the top of Asks with how long ago it stopped and Resume, which reads Resuming… once sent', () => {
  const stop = stopOf(screenFor({ stop: OVERLOADED, remoteActions: ['resume'] }).blocks)
  expect(stop?.banner).toMatchObject({
    kind: 'stopped',
    tone: 'error',
    lead: 'Stopped',
    body: 'The API is overloaded.',
  })
  expect(stop?.after).toBe(`${DOT}${ago(3 * 60_000)}`)
  expect(stop?.buttons.map(b => [b.label, b.isOut])).toEqual([['Resume', false]])
  expect(stop?.buttons[0]?.does).toEqual({
    is: 'press',
    press: { action: 'resume', id: 'session' },
    effects: [],
    kind: 'handoff',
  })

  const resumed: LastAction = {
    kind: 'handoff',
    action: 'resume',
    text: 'Resume',
    at: NOW - 1000,
    turnsStarted: demoSession(NOW, AGENT).presence.turnsStarted,
    delivery: { state: 'queued', message: 'Continue' },
  }
  const sent = stopOf(screenFor({ stop: OVERLOADED, remoteActions: ['resume'], resumed }).blocks)
  expect(sent?.buttons.map(b => [b.label, b.isOut])).toEqual([['Resuming…', true]])

  const failed = { ...resumed, delivery: { state: 'failed' as const, reason: 'Claude Code is not running' } }
  const refused = stopOf(screenFor({ stop: OVERLOADED, remoteActions: ['resume'], resumed: failed }).blocks)
  expect([refused?.buttons.map(b => b.label), refused?.feedback]).toEqual([
    ['Resume'],
    { text: 'Not sent: Claude Code is not running', tone: 'error' },
  ])
})

test('a stop with no Resume, because Resume cannot continue past it or the host takes none from the look, gives the fix in its text', () => {
  const limited = stopOf(screenFor({ stop: USAGE_LIMIT, remoteActions: ['resume'] }).blocks)
  expect([limited?.banner.body, limited?.buttons]).toEqual(['Usage limit reached. Resume after 7:33pm.', []])

  const older = stopOf(screenFor({ stop: OVERLOADED }).blocks)
  expect([older?.banner.body, older?.buttons]).toEqual(['The API is overloaded. Send a message to resume.', []])
})

test('only Asks draws the stop, and a session that has not stopped draws none', () => {
  expect(stopOf(screenFor({ stop: OVERLOADED, remoteActions: ['resume'] }, 'findings').blocks)).toBeNull()
  expect(stopOf(screenFor({ remoteActions: ['resume'] }).blocks)).toBeNull()
})

test('while Codex does not run the inbox hooks every tab shows the Codex tab banner first, and a press note follows in its own tone', () => {
  const hooks = bannerOf('hooks-trust', HOOKS_TRUST_TEXT.modified)
  for (const tab of ['overview', 'needsYou', 'findings', 'prs'] as const)
    expect(screenFor({ hooksTrust: 'modified' }, tab).banners).toEqual([hooks])

  const note = { text: 'Not sent: the session ended', isError: true }
  expect(screenFor({ hooksTrust: 'modified' }, 'needsYou', note).banners).toEqual([
    hooks,
    bannerOf('press-failed', note.text),
  ])
  expect(screenFor({}, 'needsYou', { text: 'That item changed.', isError: false }).banners).toEqual([
    bannerOf('press-note', 'That item changed.'),
  ])
  expect(screenFor({ hooksTrust: 'stale' }).banners).toEqual([])
})
