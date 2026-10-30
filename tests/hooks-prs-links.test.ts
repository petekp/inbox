import { expect, mock, test } from 'claude-code/testing'
import { PRESS_GUARD_MS, QUEUED_AFTER_MS, SETTLED_MS } from '../hooks/view'
import { w, arrive, world } from './hooks-world'
import { PANE, sidebarTokens } from './hooks-helpers'

test('a PR linked in a reply shows in the PRs tab, a task naming it opens it, its buttons send its conflicts and thread and say so, and its failing check waits on the person', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const vars: Record<string, string> = {}
  world($, on, [], vars)
  w.ledgerReply = 'NEW: do | - | Mark #12 ready for review | - | -'
  let hasReply = false
  let isResolved = false
  let onFetched: (() => void) | undefined
  let isFetching = false
  on('state.set', { plugin: 'inbox', key: 'session' } as const, async (_$, e, next) => {
    const r = await next(e)
    const wasFetching = isFetching
    isFetching = e.value.prViews.isFetching
    if (wasFetching && !isFetching) onFetched?.()
    return r
  })
  w.ghAnswers.push(
    {
      match: argv => argv.includes('view') && argv.includes('12'),
      get stdout() {
        return JSON.stringify({
          number: 12,
          title: 'Add a greeting CLI',
          url: 'https://github.com/acme/greet/pull/12',
          isDraft: false,
          state: 'OPEN',
          baseRefName: 'main',
          mergeable: 'CONFLICTING',
          reviewDecision: 'REVIEW_REQUIRED',
          statusCheckRollup: [
            {
              __typename: 'CheckRun',
              name: 'test',
              status: 'COMPLETED',
              conclusion: 'FAILURE',
              detailsUrl: 'https://github.com/acme/greet/actions/runs/7/job/1',
            },
          ],
        })
      },
    },
    {
      match: argv => argv.includes('graphql'),
      get stdout() {
        return JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                reviewThreads: {
                  nodes: [
                    {
                      id: 'T1',
                      isResolved,
                      isOutdated: false,
                      path: 'bin/greet',
                      line: 4,
                      originalLine: 4,
                      comments: {
                        totalCount: hasReply ? 2 : 1,
                        nodes: [
                          {
                            author: { login: 'sam' },
                            body: 'Quote the name.',
                            url: 'https://github.com/acme/greet/pull/12#r1',
                          },
                        ],
                      },
                      last: {
                        nodes: [
                          hasReply
                            ? {
                                author: { login: 'sam' },
                                body: 'Still unquoted.',
                                url: '',
                                createdAt: '2026-10-08T00:00:00Z',
                              }
                            : { author: { login: 'sam' }, body: 'Quote the name.', url: '' },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        })
      },
    },
  )
  w.theme = 'dark'

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'open the PR', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Opened https://github.com/acme/greet/pull/12.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()

  const pane = await $.ui.mount(PANE)
  expect((await pane.find({ key: 'help-i1-0-key' }))?.props.label).toBe('Open PR #12')
  let opened = () => {}
  w.ghAnswers.push({ match: argv => argv[0] === 'open', stdout: '', hold: () => new Promise(r => (opened = r)) })
  const pressing = pane.press({ key: 'help-i1-0' })
  await clock.settle()
  expect(w.ran.at(-1)).toEqual(['open', 'https://github.com/acme/greet/pull/12'])
  expect(await pane.find({ text: 'Opening PR #12…' })).toBeDefined()
  expect(await pane.find({ text: /\u2007·\sOpening/ })).toBeUndefined()
  await clock.advance(SETTLED_MS / 2)
  opened()
  await pressing
  await clock.settle()
  expect(await pane.find({ text: /^ ·\s✓\sOpened\sPR\s#12$/ })).toBeDefined()
  await clock.advance(SETTLED_MS / 2 + 1)
  expect(await pane.find({ text: /✓\sOpened\sPR\s#12$/ })).toBeDefined()
  await clock.advance(SETTLED_MS / 2)
  expect(await pane.find({ text: /✓\sOpened\sPR\s#12$/ })).toBeUndefined()
  w.ghAnswers.pop()

  await pane.press({ key: 'tab-prs' })
  await clock.settle()
  expect(await pane.find({ text: /Add a greeting CLI/ })).toBeDefined()
  for (const line of ['Blocked', /^\u2007·\sconflicts with main$/])
    expect(await pane.find({ text: line })).toBeDefined()
  expect(await pane.find({ key: 'merge-acme/greet#12' })).toBeUndefined()

  await pane.press({ key: 'resolve-acme/greet#12' })
  expect(w.sent.at(-1)).toContain('PR #12 (https://github.com/acme/greet/pull/12) conflicts with main.')
  await clock.settle()
  expect(await pane.find({ text: /✓ Asked to resolve conflicts\u2007·/ })).toBeDefined()
  expect((await pane.find({ key: 'resolve-acme/greet#12' }))?.props.label).toBe('Resolve conflicts again')

  const muted = (await pane.find({ type: 'Text', text: /conflicts with main$/ }))?.props.color
  expect(await pane.find({ text: /✓\sOpened\sPR\s#12$/ })).toBeUndefined()
  await pane.press({ key: 'open-acme/greet#12' })
  await clock.settle()
  expect(await pane.find({ text: /✓\sOpened\sPR\s#12$/ })).toBeDefined()
  w.ghAnswers.push({ match: argv => argv[0] === 'open', stdout: '', fails: 'no browser' })
  await pane.press({ key: 'open-acme/greet#12' })
  await clock.settle()
  const failed = (await pane.find({ type: 'Text', text: 'Could not open PR #12: no browser' }))?.props.color
  expect(failed).toBeDefined()
  expect(failed).not.toBe(muted)
  w.ghAnswers.pop()

  await pane.press({ key: 'next' })
  await clock.settle()
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'fix-acme/greet#12-test-key' })
  expect(w.sent.at(-1)).toContain('The test check failed on PR #12')
  await clock.settle()
  expect(await pane.find({ key: 'fix-acme/greet#12-test-key' })).toBeUndefined()
  expect(await pane.find({ text: /^ ·\s✓\sAsked\sto\sfix$/ })).toBeDefined()
  await pane.press({ key: 'title-acme/greet#12 check test' })
  await clock.advance(PRESS_GUARD_MS)
  expect((await pane.find({ key: 'fix-acme/greet#12-test-key' }))?.props.label).toMatch(/Fix again$/)
  expect(await pane.find({ text: '✓ Asked to fix' })).toBeDefined()
  expect(await pane.find({ text: /^ ·\s✓\sAsked\sto\sfix$/ })).toBeUndefined()
  await pane.press({ key: 'log-acme/greet#12-test-key' })
  await clock.settle()
  expect(w.ran.at(-1)).toEqual(['open', 'https://github.com/acme/greet/actions/runs/7/job/1'])
  expect(await pane.find({ text: /^\u2007·\s✓\sOpened\sthe\slog$/ })).toBeDefined()

  await pane.press({ key: 'previous' })
  await pane.press({ key: 'discuss-T1-key' })
  expect(w.sent.at(-1)).toContain("Let's talk through this review comment on PR #12")
  await clock.settle()
  expect(await pane.find({ text: /Discussing…/ })).toBeDefined()
  expect((await pane.find({ key: 'discuss-T1' }))?.props.label).toMatch(/\bDiscuss$/)
  w.submitAnswer = { drop: 'a hook refused it' }
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'address-T1' })
  expect(w.sent.at(-1)).toContain('Address this review comment on PR #12')
  expect(w.sent.at(-1)).toContain('bin/greet:4, from @sam:\n> Quote the name.')
  await clock.settle()
  expect(await pane.find({ text: 'Not sent: a hook refused it' })).toBeDefined()
  expect((await pane.find({ key: 'address-T1-key' }))?.props.label).toBe('Address')
  w.submitAnswer = 'hold'
  w.inFlight.push(pane.press({ key: 'retry-T1' }))
  await clock.settle()
  await clock.advance(QUEUED_AFTER_MS)
  expect(await pane.find({ text: /^\u2007·\sQueued:\sAddress$/ })).toBeDefined()
  expect(await pane.find({ key: 'address-T1-key' })).toBeUndefined()
  await pane.press({ key: 'title-acme/greet#12 thread T1' })
  await clock.advance(PRESS_GUARD_MS)
  w.inFlight.push(pane.press({ key: 'address-T1-key' }))
  await clock.settle()
  expect(w.held).toHaveLength(1)
  expect((await pane.find({ key: 'address-T1' }))?.props.dimColor).toBe(true)
  await arrive($)
  await clock.settle()
  expect(await pane.find({ text: /^\u2007·\sAddressed$/ })).toBeDefined()

  expect(await pane.find({ key: 'address-T1-key' })).toBeDefined()
  await clock.advance(PRESS_GUARD_MS)
  expect((await pane.find({ key: 'address-T1-key' }))?.props.label).toBe('Address again')
  await pane.press({ key: 'open-T1' })
  await clock.settle()
  expect(w.ran.at(-1)).toEqual(['open', 'https://github.com/acme/greet/pull/12#r1'])
  expect(await pane.find({ text: /^\u2007·\s✓\sOpened\sthe\scomment$/ })).toBeDefined()
  expect(await pane.find({ text: /^ 1$/ })).toBeDefined()
  hasReply = true
  await pane.press({ key: 'tab-findings' })
  await pane.press({ key: 'tab-prs' })
  await clock.settle()
  expect(await pane.find({ text: /Still unquoted/ })).toBeDefined()

  const sends = w.sent.length
  w.beforeAct = async () => {
    isResolved = true
    const fetched = new Promise<void>(resolve => (onFetched = resolve))
    await $.command.run({ command: 'inbox', args: '' } as never)
    await fetched
  }
  await pane.press({ key: 'address-T1-key' })
  expect(w.sent.length).toBe(sends)
  expect(await pane.find({ text: /^This changed before your press\. Nothing was sent\.$/ })).toBeDefined()

  vars.HERDR_PANE_ID = 'p1'
  await $.command.run({ command: 'inbox', args: '' } as never)
  await clock.settle()
  expect(sidebarTokens()['inbox-prs']).toBe('1')
})
