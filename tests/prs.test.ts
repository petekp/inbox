import { describe, expect, test } from 'claude-code/testing'

import { commentLine, prRefs, readThreads, readView, readableComment, readiness } from '../hooks/prs'

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
                  },
                ],
              },
              last: {
                nodes: [
                  {
                    author: { login: 'sam' },
                    body: 'Quote the name.',
                    url: 'https://github.com/acme/greet/pull/12#r2',
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
    const threads = readThreads(THREADS)
    // T1 is the viewer's note with a reply from sam, so it waits on the viewer.
    // T4 is the viewer's own note with no reply yet, so it doesn't wait on the viewer.
    expect(threads[0]?.reply?.body).toBe('Quote the name.')
    expect(threads.map(t => [t.id, t.isWaiting, t.line, t.replies])).toEqual([
      ['T1', true, 4, 1],
      ['T4', false, 2, 0],
      ['T3', true, 9, 0],
    ])
    expect(readiness({ ...view, threads, fetchedAt: 0, error: null }).text).toBe(
      'Blocked: 1 failing check, changes requested, 2 threads waiting on you, 1 check running',
    )
  })
})
