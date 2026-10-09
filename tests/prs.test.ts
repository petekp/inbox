import { describe, expect, test } from 'claude-code/testing'

import { commentLine, prRefs, prRowsOnYou, readThreads, readView, readableComment, readiness } from '../hooks/prs'
import type { Handoffs } from '../hooks/prs'

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
    // The thread's time is its first comment's; a comment with none leaves it unknown.
    expect(threads.map(t => t.at)).toEqual([Date.parse('2026-10-08T09:30:00Z'), null, null])
    expect(threads[0]?.reply?.at).toBe(Date.parse('2026-10-08T10:00:00Z'))
    // T3 is outdated with no reply: a later commit changed its lines, so it no longer waits on the viewer.
    expect(threads.map(t => [t.id, t.isWaiting, t.isLinesChanged, t.line, t.replies])).toEqual([
      ['T1', true, false, 4, 1],
      ['T4', false, false, 2, 0],
      ['T3', true, true, 9, 0],
    ])
    expect(readiness({ ...view, threads, fetchedAt: 0, error: null }).text).toBe(
      'Blocked: 1 failing check, changes requested, 1 thread waiting on you, 1 thread on changed lines, 1 check running',
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
    expect(readThreads(outdated('2026-10-08T11:00:00Z'))[0]?.isLinesChanged).toBe(true)
    expect(readThreads(outdated('2026-10-08T13:00:00Z'))[0]?.isLinesChanged).toBe(false)
  })

  test('a thread sent to Claude stops waiting on the person and still blocks; a failing check always waits', () => {
    const view = readView('acme/greet#12', VIEW)!
    const pr = { ...view, threads: readThreads(THREADS).slice(0, 1), fetchedAt: 0, error: null }
    const sent: Handoffs = { isThreadSent: () => true }
    expect(prRowsOnYou(pr, sent)).toBe(1)
    expect(readiness(pr, sent).text).toBe(
      'Blocked: 1 failing check, changes requested, 1 thread sent to Claude, 1 check running',
    )
  })
})
