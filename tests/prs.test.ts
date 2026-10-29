import { describe, expect, test } from 'claude-code/testing'

import {
  inPrOrder,
  commentLine,
  prRefs,
  prNeedsYou,
  prompts,
  readThreadsAnswer,
  readView,
  readableComment,
  readiness,
} from '../hooks/prs'

const VIEW = JSON.stringify({
  number: 12,
  title: 'Add a greeting CLI',
  url: 'https://github.com/acme/greet/pull/12',
  isDraft: false,
  state: 'OPEN',
  baseRefName: 'main',
  mergeable: 'MERGEABLE',
  reviewDecision: 'CHANGES_REQUESTED',
  statusCheckRollup: [
    {
      __typename: 'CheckRun',
      name: 'lint',
      status: 'COMPLETED',
      conclusion: 'FAILURE',
      detailsUrl: 'https://github.com/acme/greet/runs/1',
      workflowName: 'CI',
      startedAt: '2026-10-08T09:00:00Z',
      completedAt: '2026-10-08T09:00:41Z',
    },
    { __typename: 'CheckRun', name: 'test', status: 'IN_PROGRESS', conclusion: '' },
    {
      __typename: 'StatusContext',
      context: 'deploy/preview',
      state: 'SUCCESS',
      targetUrl: 'https://preview.example.com',
    },
  ],
})

const THREADS = JSON.stringify({
  data: {
    viewer: { login: 'pat' },
    repository: {
      pullRequest: {
        reviewThreads: {
          nodes: [
            {
              id: 'T1',
              isResolved: false,
              isOutdated: false,
              path: 'bin/greet',
              line: 4,
              originalLine: 4,
              comments: {
                totalCount: 2,
                nodes: [
                  {
                    author: { login: 'pat' },
                    body: 'Names are not quoted on purpose.',
                    url: 'https://github.com/acme/greet/pull/12#r1',
                    createdAt: '2026-10-08T09:30:00Z',
                  },
                ],
              },
              last: {
                nodes: [
                  {
                    author: { login: 'sam' },
                    body: 'Quote the name.',
                    url: 'https://github.com/acme/greet/pull/12#r2',
                    createdAt: '2026-10-08T10:00:00Z',
                  },
                ],
              },
            },
            {
              id: 'T2',
              isResolved: true,
              isOutdated: false,
              path: 'README.md',
              line: 1,
              originalLine: 1,
              comments: { totalCount: 1, nodes: [{ author: { login: 'sam' }, body: 'Typo.', url: '' }] },
              last: { nodes: [{ author: { login: 'sam' }, body: '', url: '' }] },
            },
            {
              id: 'T4',
              isResolved: false,
              isOutdated: false,
              path: 'bin/greet',
              line: 2,
              originalLine: 2,
              comments: {
                totalCount: 1,
                nodes: [{ author: { login: 'pat' }, body: 'Why this reads argv first.', url: '' }],
              },
              last: { nodes: [{ author: { login: 'pat' }, body: '', url: '' }] },
            },
            {
              id: 'T3',
              isResolved: false,
              isOutdated: true,
              path: 'bin/greet',
              line: null,
              originalLine: 9,
              comments: {
                totalCount: 1,
                nodes: [{ author: { login: 'review-bot' }, body: 'Unused variable.', url: '' }],
              },
              last: { nodes: [{ author: { login: 'review-bot' }, body: '', url: '' }] },
            },
          ],
        },
      },
    },
  },
})

describe('prs', () => {
  test('a review comment reads without the HTML and badges review bots add', () => {
    const body =
      '**<sub><sub>![P1 Badge](https://img.shields.io/badge/P1-orange?style=flat)</sub></sub>  Guard the empty list**\n\n' +
      'An empty `Array<string>` reaches [the parser](https://example.com/parser).<!-- review state -->'
    expect(readableComment(body)).toBe(
      '**P1  Guard the empty list**\n\nAn empty `Array<string>` reaches [the parser](https://example.com/parser).',
    )
    expect(commentLine(body)).toBe('P1 Guard the empty list An empty Array<string> reaches the parser.')
  })

  test('a PR press quotes each review comment line and clips a long comment', () => {
    const view = readView('acme/greet#12', VIEW)!
    const [thread] = readThreadsAnswer(THREADS).threads
    const long = { ...thread!, body: `First line\nSecond line ${'x'.repeat(3000)}`, reply: null }
    const message = prompts.address({ ...view, threads: [], isYours: true, wasSeenOpen: true, error: null }, [long])
    expect(message).toContain('> First line\n> Second line')
    expect(message).toContain('…[cut]')
    expect(message).not.toContain('x'.repeat(2100))
  })

  test('finds PR links once each', () => {
    expect(
      prRefs('see https://github.com/acme/greet/pull/12 and https://github.com/acme/greet/pull/12#r1, not /issues/3'),
    ).toEqual(['acme/greet#12'])
  })

  test('reads checks and open threads; threads where someone else spoke last block the merge', () => {
    const view = readView('acme/greet#12', VIEW)!
    expect(view.checks.map(c => [c.name, c.bucket])).toEqual([
      ['lint', 'fail'],
      ['test', 'pending'],
      ['deploy/preview', 'pass'],
    ])
    expect(view.checks.map(c => [c.workflow, c.startedAt, c.finishedAt])).toEqual([
      ['CI', Date.parse('2026-10-08T09:00:00Z'), Date.parse('2026-10-08T09:00:41Z')],
      [undefined, undefined, undefined],
      [undefined, undefined, undefined],
    ])
    const threads = readThreadsAnswer(THREADS).threads
    expect(threads[0]?.reply?.body).toBe('Quote the name.')
    expect(threads.map(t => t.at)).toEqual([Date.parse('2026-10-08T09:30:00Z'), null, null])
    expect(threads[0]?.reply?.at).toBe(Date.parse('2026-10-08T10:00:00Z'))
    expect(threads.map(t => [t.id, t.isWaiting, t.isLinesChanged, t.line])).toEqual([
      ['T1', true, false, 4],
      ['T4', false, false, 2],
      ['T3', true, true, 9],
    ])
    expect(readiness({ ...view, threads, isYours: true, wasSeenOpen: true, error: null }).text).toBe(
      'Blocked: 1 failing check, changes requested, 1 thread waiting on you',
    )
  })

  test('a check run again on the same commit reads as its latest run, so a passing re-run clears an earlier failure and a failing re-run keeps it', () => {
    const run = (name: string, conclusion: string, startedAt?: string, workflowName = 'CI') => ({
      __typename: 'CheckRun',
      name,
      workflowName,
      status: conclusion === '' ? 'QUEUED' : 'COMPLETED',
      conclusion,
      ...(startedAt ? { startedAt, completedAt: startedAt } : {}),
      detailsUrl: `https://github.com/acme/greet/actions/runs/${name}-${conclusion}`,
    })
    const viewWith = (rollup: object[]) =>
      readView('acme/greet#12', JSON.stringify({ ...JSON.parse(VIEW), statusCheckRollup: rollup }))!
    const checks = (rollup: object[]) => viewWith(rollup).checks.map(c => [c.workflow, c.name, c.bucket])

    expect(
      checks([
        run('lint', 'CANCELLED', '2026-10-08T09:00:00Z'),
        run('lint', 'SUCCESS', '2026-10-08T09:05:00Z'),
        run('test', 'SUCCESS', '2026-10-08T09:01:00Z'),
        run('test', 'FAILURE', '2026-10-08T09:06:00Z'),
        run('lint', 'FAILURE', '2026-10-08T09:02:00Z', 'Nightly'),
      ]),
    ).toEqual([
      ['CI', 'lint', 'pass'],
      ['CI', 'test', 'fail'],
      ['Nightly', 'lint', 'fail'],
    ])
    expect(checks([run('lint', 'FAILURE', '2026-10-08T09:00:00Z'), run('lint', '')])).toEqual([
      ['CI', 'lint', 'pending'],
    ])
    const rerunPassed = viewWith([
      run('lint', 'FAILURE', '2026-10-08T09:00:00Z'),
      run('lint', 'SUCCESS', '2026-10-08T09:05:00Z'),
    ])
    expect(readiness({ ...rerunPassed, threads: [], isYours: true, wasSeenOpen: true, error: null }).text).toBe(
      'Blocked: changes requested',
    )
  })

  test('an outdated thread waits again when someone replies after the latest commit', () => {
    const outdated = (replyAt: string) =>
      JSON.stringify({
        data: {
          viewer: { login: 'pat' },
          repository: {
            pullRequest: {
              commits: { nodes: [{ commit: { committedDate: '2026-10-08T12:00:00Z' } }] },
              reviewThreads: {
                nodes: [
                  {
                    id: 'T5',
                    isResolved: false,
                    isOutdated: true,
                    path: 'bin/greet',
                    line: null,
                    originalLine: 3,
                    comments: {
                      totalCount: 2,
                      nodes: [{ author: { login: 'sam' }, body: 'Quote the name.', url: '' }],
                    },
                    last: {
                      nodes: [{ author: { login: 'sam' }, body: 'Still unquoted.', url: '', createdAt: replyAt }],
                    },
                  },
                ],
              },
            },
          },
        },
      })
    expect(readThreadsAnswer(outdated('2026-10-08T11:00:00Z')).threads[0]?.isLinesChanged).toBe(true)
    expect(readThreadsAnswer(outdated('2026-10-08T13:00:00Z')).threads[0]?.isLinesChanged).toBe(false)
  })

  test('a thread sent to Claude stops waiting on the person and waits on others; a failing check always waits', () => {
    const view = readView('acme/greet#12', VIEW)!
    const pr = {
      ...view,
      threads: readThreadsAnswer(THREADS).threads.slice(0, 1),
      isYours: true,
      wasSeenOpen: true,
      error: null,
    }
    const sent = () => true
    expect(prNeedsYou(pr, sent)).toBe(true)
    expect(readiness(pr, sent).text).toBe('Blocked: 1 failing check, changes requested')
    const onOthers = { ...pr, checks: pr.checks.filter(c => c.bucket !== 'fail'), reviewDecision: 'APPROVED' }
    expect(readiness(onOthers, sent)).toMatchObject({
      status: 'waiting',
      text: 'Waiting: 1 thread sent to Claude, 1 check running',
    })
    expect(readiness({ ...onOthers, checks: [], reviewDecision: 'REVIEW_REQUIRED' }, sent)).toMatchObject({
      status: 'waiting',
      text: 'Waiting: 1 thread sent to Claude, needs approval',
    })
    expect(readiness({ ...onOthers, checks: [], threads: [] }, sent).status).toBe('ready')
  })

  test('PRs that wait on the person come first, then those waiting on others, then finished ones, newest first within each', () => {
    const view = readView('acme/greet#12', VIEW)!
    const base = {
      ...view,
      checks: [],
      threads: [],
      reviewDecision: 'APPROVED',
      isYours: true,
      wasSeenOpen: true,
      error: null,
    }
    const pr = (number: number, changes: Partial<typeof base>) => ({
      ...base,
      ...changes,
      number,
      ref: `acme/greet#${number}`,
    })
    const prs = [
      pr(9, { state: 'MERGED' }),
      pr(20, { reviewDecision: 'REVIEW_REQUIRED' }),
      pr(11, {}),
      pr(14, { mergeable: 'CONFLICTING' }),
      pr(15, {}),
      pr(13, { isDraft: true }),
    ]
    expect(inPrOrder(prs).map(p => p.number)).toEqual([14, 15, 11, 13, 20, 9])
  })
})
