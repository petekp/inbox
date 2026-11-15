import { describe, expect, test } from 'claude-code/testing'

import { applyFeed, applyFeedFiles, FEED_TTL_MS, parseFeed } from '../hooks/feed'
import type { Feed, FeedEntry } from '../hooks/feed'
import { inboxText, carryText } from '../hooks/inbox-text'
import { EMPTY } from '../hooks/ledger'
import { closeFinding } from '../hooks/ledger-close'
import { addAgentItem, addFinding, applyUpdate } from '../hooks/ledger-update'
import { recordItem } from '../hooks/tools'
import { buildPrompt } from '../hooks/ledger-prompt'
import { tabBarBanners } from '../hooks/banners'
import { CLAUDE_CODE } from '../hooks/model-text'
import { parseReply } from '../hooks/reply-parse'
import type { Finding } from '../types'

const entry = (change: Partial<FeedEntry> = {}): FeedEntry => ({
  key: 'machine/worker',
  state: 'working',
  title: 'Add progress feed',
  detail: 'Update the shared ledger.',
  at: 100,
  ...change,
})
const feed = (...entries: FeedEntry[]): Feed => ({ version: 1, source: 'herdr-meta-patrol', writtenAt: 100, entries })
const finding = (change: Partial<Finding> = {}): Finding => ({
  id: 'f1',
  kind: 'issue' as const,
  title: 'Add progress feed',
  detail: 'Manual note.',
  path: null,
  at: 10,
  ...change,
})

describe('progress feed', () => {
  test('parses writer snapshots and truncates overlong text at UTF-16 limits', () => {
    const valid = { version: 1, source: 'herdr-meta-patrol', writtenAt: 1, entries: [entry()] }
    expect(parseFeed(JSON.stringify(valid))?.entries).toEqual(valid.entries)
    const subagent = parseFeed(
      JSON.stringify({ ...valid, source: 'claude-subagent-hook', entries: [entry({ key: 'subagent/s1/a1' })] }),
    )
    expect(subagent?.source).toBe('claude-subagent-hook')
    expect(
      applyFeedFiles(EMPTY, '/feed', [{ path: '/feed/subagent-s1-a1.json', feed: subagent }], 2).findings,
    ).toMatchObject([{ feedKey: 'subagent/s1/a1' }])
    const long = parseFeed(
      JSON.stringify({
        ...valid,
        entries: [entry({ title: '😀'.repeat(130), detail: 'd'.repeat(601) })],
      }),
    )?.entries[0]
    expect(long?.title).toBe('😀'.repeat(60))
    expect(long?.title.length).toBe(120)
    expect(long?.detail).toBe('d'.repeat(600))
    expect(parseFeed(JSON.stringify({ ...valid, source: '' }))).toBeNull()
    expect(parseFeed('{')).toBeNull()
    expect(parseFeed(JSON.stringify({ ...valid, version: 2 }))).toBeNull()
    expect(
      parseFeed(JSON.stringify({ ...valid, entries: [entry(), entry({ key: 'machine/other' }), entry()] })),
    ).toBeNull()
    expect(
      parseFeed(JSON.stringify({ ...valid, entries: Array.from({ length: 41 }, (_, i) => entry({ key: `m/${i}` })) })),
    ).toBeNull()
  })

  test('reads durable Meta tasks without six-hour expiry and keeps live warnings separate', () => {
    const source = '/feed/meta-open-items.json'
    const durable = {
      version: 1 as const,
      source: 'meta-open-items',
      writtenAt: 100,
      entries: [
        entry({
          key: 'task/human-check',
          kind: 'task',
          state: 'blocked',
          title: 'Check the milestone',
          detail: 'Verify the exit criteria',
          owner: { machine: 'local', agent: 'meta' },
          at: 100,
        }),
        entry({
          key: 'work/training',
          title: 'Training run',
          kind: 'work',
          owner: { machine: 'local', agent: 'meta-trainer' },
          at: 100,
        }),
      ],
    }
    const parsed = parseFeed(JSON.stringify(durable))
    expect(parsed).toMatchObject({ source: 'meta-open-items', entries: durable.entries })
    const withWarning = parseFeed(
      JSON.stringify({
        version: 1,
        source: 'herdr-meta-patrol',
        writtenAt: 100,
        entries: [],
        warnings: [{ key: 'herdr/local/meta-worker/untracked-work', title: 'meta-worker', detail: 'working', at: 100 }],
      }),
    )!
    const loaded = applyFeedFiles(
      EMPTY,
      '/feed',
      [
        { path: source, feed: parsed },
        { path: '/feed/herdr-local.json', feed: withWarning },
      ],
      100 + FEED_TTL_MS * 2,
    )
    expect(loaded.items).toMatchObject([{ kind: 'task', ask: 'Check the milestone', sourceManaged: true }])
    expect(loaded.findings).toMatchObject([{ title: 'Training run', sourceManaged: true }])
    expect(loaded.untrackedWork).toMatchObject([
      { key: 'herdr/local/meta-worker/untracked-work', title: 'meta-worker' },
    ])
    expect(tabBarBanners([], null, null, loaded.untrackedWork)).toMatchObject([
      { kind: 'untracked-work', lead: 'Untracked work.', body: expect.stringContaining('meta-worker') },
    ])
    expect(inboxText(CLAUDE_CODE, loaded, false)).not.toContain('Check the milestone')
    expect(applyUpdate(loaded, parseReply('CLOSED: i1 | done: checked')!, 200, 1).items).toEqual(loaded.items)
    const reply = parseReply(
      `NEW: do | - | Check the milestone | - | -\nASKED: ${loaded.findings[0]!.id} | ${loaded.items[0]!.id}`,
    )!
    const modelUpdate = applyUpdate(loaded, reply, 200, 1)
    expect(modelUpdate.items).toEqual(loaded.items)
    expect(modelUpdate.findings).toEqual(loaded.findings)
    const recorded = recordItem(
      CLAUDE_CODE,
      loaded,
      { kind: 'task', ask: 'Check the milestone', steps: ['Review again'], detail: 'Changed detail' },
      200,
    )
    expect(recorded.result).toContain('managed by the active work source')
    expect(recorded.ledger.items).toEqual(loaded.items)
    const relatedTask = addAgentItem(
      loaded,
      {
        kind: 'task',
        ask: 'Training run',
        options: [],
        rec: null,
        helps: [],
        isDesignChoice: false,
        detail: undefined,
        document: undefined,
        documentPreview: undefined,
      },
      200,
    )
    expect(relatedTask.is).toBe('added')
    expect(relatedTask.ledger.findings).toEqual(loaded.findings)
    const duplicateFinding = addFinding(loaded, {
      kind: 'issue',
      title: 'Training run',
      detail: 'A different description.',
      path: null,
      document: 'new report.md',
      at: 200,
    })
    expect(duplicateFinding.isAdded).toBe(false)
    expect(duplicateFinding.ledger.findings).toEqual(loaded.findings)
    const missingSource = applyFeedFiles(
      loaded,
      '/feed',
      [{ path: '/feed/herdr-local.json', feed: withWarning }],
      999999999,
    )
    expect(missingSource.items).toEqual(loaded.items)
    const cleared = applyFeedFiles(
      loaded,
      '/feed',
      [
        { path: source, feed: parseFeed(JSON.stringify({ ...durable, entries: [] })) },
        { path: '/feed/herdr-local.json', feed: parseFeed(JSON.stringify({ ...withWarning, warnings: [] })) },
      ],
      999999999,
    )
    expect(cleared.items).toEqual([])
    expect(cleared.findings).toEqual([])
    expect(cleared.untrackedWork).toEqual([])
  })

  test('retains untracked warnings while a machine snapshot is invalid and clears them on a valid snapshot', () => {
    const path = '/feed/herdr-local.json'
    const warningFeed = parseFeed(
      JSON.stringify({
        version: 1,
        source: 'herdr-meta-patrol',
        writtenAt: 1,
        entries: [],
        warnings: [{ key: 'w1', title: 'meta-worker', detail: 'working', at: 1 }],
      }),
    )!
    const initial = applyFeedFiles(EMPTY, '/feed', [{ path, feed: warningFeed }], 2)
    const unavailable = applyFeedFiles(initial, '/feed', [{ path, feed: undefined }], 3)
    expect(unavailable.untrackedWork).toEqual(initial.untrackedWork)
    const cleared = applyFeedFiles(
      unavailable,
      '/feed',
      [
        {
          path,
          feed: parseFeed(
            JSON.stringify({
              version: 1,
              source: 'herdr-meta-patrol',
              writtenAt: 4,
              entries: [],
              warnings: [],
            }),
          ),
        },
      ],
      4,
    )
    expect(cleared.untrackedWork).toEqual([])
  })

  test('adds and updates feed-owned findings without adopting hand findings', () => {
    const first = applyFeed(EMPTY, feed(entry({ state: 'blocked' })), 110)
    expect(first.findings).toMatchObject([
      { id: 'f1', kind: 'progress', detail: 'Blocked: Update the shared ledger.', feedKey: 'machine/worker' },
    ])
    const changed = applyFeed(first, feed(entry({ title: 'Feed work', detail: 'Update the tab.', at: 120 })), 130)
    expect(changed.findings).toMatchObject([{ id: 'f1', title: 'Feed work', detail: 'Update the tab.', at: 120 }])
    expect(applyFeed(changed, feed(entry({ title: 'Feed work', detail: 'Update the tab.', at: 120 })), 140)).toBe(
      changed,
    )

    const manual = { ...EMPTY, findings: [finding()], nextId: 2 }
    const independent = applyFeed(manual, feed(entry()), 110, '/feed/herdr-meta-patrol.json')
    expect(independent.findings).toMatchObject([
      { id: 'f1', kind: 'issue', detail: 'Manual note.' },
      { id: 'f2', kind: 'progress', feedKey: 'machine/worker', feedSource: '/feed/herdr-meta-patrol.json' },
    ])
    expect(independent.nextId).toBe(3)

    const completed = applyFeed(independent, feed(entry({ state: 'done' })), 120, '/feed/herdr-meta-patrol.json')
    expect(completed.findings.map(f => f.id)).toEqual(['f1'])
    expect(completed.closedFindings.map(f => f.id)).toEqual(['f2'])

    const missing = applyFeedFiles(independent, '/feed', [{ path: '/feed/herdr-meta-patrol.json', feed: feed() }], 130)
    expect(missing.findings.map(f => f.id)).toEqual(['f1'])
    expect(missing.closedFindings.map(f => f.id)).toEqual(['f2'])
  })

  test('preserves legacy unmarked findings that were previously adopted by title', () => {
    const legacy = {
      ...EMPTY,
      findings: [
        finding({
          kind: 'progress',
          detail: 'Update the shared ledger.',
          feedKey: 'machine/worker',
          feedSource: '/feed/herdr-meta-patrol.json',
        }),
      ],
      nextId: 2,
    }
    const active = applyFeed(legacy, feed(entry()), 120, '/feed/herdr-meta-patrol.json')
    expect(active.findings.map(f => f.id)).toEqual(['f1', 'f2'])
    expect(active.findings[0]).toMatchObject({ id: 'f1', feedKey: 'machine/worker' })
    expect(active.findings[0]).not.toHaveProperty('feedOwned')
    expect(inboxText(CLAUDE_CODE, active, false)).toContain('Add progress feed')
    const completed = applyFeed(active, feed(entry({ state: 'done' })), 130, '/feed/herdr-meta-patrol.json')
    expect(completed.findings.map(f => f.id)).toEqual(['f1'])
    expect(completed.closedFindings).toMatchObject([
      { id: 'f2', feedOwned: true, outcome: 'done: Update the shared ledger.' },
    ])

    const expired = applyFeedFiles(
      active,
      '/feed',
      [{ path: '/feed/herdr-meta-patrol.json', feed: feed(entry()) }],
      100 + FEED_TTL_MS,
    )
    expect(expired.findings.map(f => f.id)).toEqual(['f1'])
    expect(expired.closedFindings).toMatchObject([{ id: 'f2', feedOwned: true, outcome: 'done: feed entry expired' }])
  })

  test('legacy unmarked findings survive a missing feed and stay visible to prompts and ordinary updates', () => {
    const legacyFinding = finding({
      kind: 'progress',
      title: 'skills#188: separate OKR rules',
      detail: 'The work is still in progress.',
      feedKey: 'github/pr/188',
      feedSource: '/feed/github-prs-skills.json',
    })
    const legacy = { ...EMPTY, findings: [legacyFinding], nextId: 2 }
    const disappeared = applyFeedFiles(legacy, '/feed', [], 120)

    expect(disappeared.findings).toEqual([legacyFinding])
    expect(disappeared.closedFindings).toEqual([])
    expect(inboxText(CLAUDE_CODE, disappeared, false)).toContain('skills#188: separate OKR rules')
    expect(carryText(disappeared, 'carry')).toContain('skills#188: separate OKR rules')
    expect(
      buildPrompt(disappeared, {
        person: '',
        trigger: null,
        activity: [],
        reply: '',
        turn: 1,
        press: null,
        screen: '',
        tasks: [],
      }),
    ).toContain('f1 | progress: skills#188: separate OKR rules')

    const normallyClosed = applyUpdate(disappeared, parseReply('FIXED: f1 | reviewed the note')!, 130, 1)
    expect(normallyClosed.findings).toEqual([])
    expect(normallyClosed.closedFindings).toMatchObject([{ id: 'f1', outcome: 'reviewed the note', how: 'update' }])
  })

  test('closes completed and missing entries, preserves dismissed keys, and ignores untracked completion', () => {
    const path = '/feed/patrol.json'
    const open = applyFeedFiles(EMPTY, '/feed', [{ path, feed: feed(entry()) }], 110)
    const done = applyFeedFiles(
      open,
      '/feed',
      [{ path, feed: feed(entry({ state: 'done', detail: 'Merged the change.' })) }],
      120,
    )
    expect(done.findings).toEqual([])
    expect(done.closedFindings).toMatchObject([{ id: 'f1', how: 'update', outcome: 'done: Merged the change.' }])
    expect(done.closedFindings.map(f => f.id)).toContain('f1')
    const retainedHistory = applyFeedFiles(done, '/feed', [{ path, feed: feed() }], 130)
    expect(retainedHistory.closedFindings).toHaveLength(1)
    expect(retainedHistory.closedFindings[0]).toMatchObject({ id: 'f1', feedKey: undefined, feedSource: undefined })
    expect(applyFeed(EMPTY, feed(entry({ state: 'done' })), 120)).toBe(EMPTY)

    const missing = applyFeedFiles(open, '/feed', [{ path, feed: feed() }], 130)
    expect(missing.findings).toEqual([])
    expect(missing.closedFindings).toMatchObject([{ id: 'f1', outcome: 'done: no longer reported' }])
    const dismissed = closeFinding(open, 'f1', { how: 'dismissed', outcome: 'dismissed' }, 120)
    const stillDismissed = applyFeedFiles(
      dismissed,
      '/feed',
      [{ path, feed: feed(entry({ detail: 'Still running.' })) }],
      130,
    )
    expect(stillDismissed.findings).toEqual([])
    expect(stillDismissed.closedFindings).toMatchObject([{ how: 'dismissed', feedKey: 'machine/worker' }])
    expect(applyFeed(EMPTY, feed(entry({ state: 'done' })), 120)).toBe(EMPTY)
  })

  test('reconciles each snapshot separately and expires old entries', () => {
    const a = { path: '/feed/patrol.json', feed: feed(entry({ key: 'herdr/a' })) }
    const b = { path: '/feed/subagents-s1.json', feed: feed(entry({ key: 'subagent/s1/1', title: 'Subagent work' })) }
    const both = applyFeedFiles(EMPTY, '/feed', [a, b], 110)
    const onlyB = applyFeedFiles(both, '/feed', [b], 120)
    expect(onlyB.findings.map(f => f.feedKey)).toEqual(['subagent/s1/1'])
    expect(onlyB.closedFindings).toMatchObject([{ feedKey: 'herdr/a', outcome: 'done: no longer reported' }])

    const active = applyFeedFiles(EMPTY, '/feed', [{ ...a, feed: feed(entry({ at: 100 })) }], 110)
    const stale = applyFeedFiles(active, '/feed', [{ ...a, feed: feed(entry({ at: 100 })) }], 100 + FEED_TTL_MS)
    expect(stale.findings).toEqual([])
    expect(stale.closedFindings).toMatchObject([{ feedKey: 'machine/worker', outcome: 'done: feed entry expired' }])
    expect(applyFeedFiles(EMPTY, '/feed', [{ ...a, feed: feed(entry({ at: 100 })) }], 100 + FEED_TTL_MS)).toBe(EMPTY)
  })

  test('hides feed findings from model text and ignores model closes for their ids', () => {
    const ordinary = { ...EMPTY, findings: [finding()] }
    const withFeed = {
      ...ordinary,
      findings: [
        ...ordinary.findings,
        { ...finding(), id: 'f2', kind: 'progress' as const, feedKey: 'machine/worker', feedOwned: true as const },
      ],
    }
    const exchange = { person: '', trigger: null, activity: [], reply: '', turn: 0, press: null, screen: '', tasks: [] }
    expect(inboxText(CLAUDE_CODE, withFeed, false)).toBe(inboxText(CLAUDE_CODE, ordinary, false))
    expect(carryText(withFeed, 'carry')).toBe(carryText(ordinary, 'carry'))
    expect(buildPrompt(withFeed, exchange)).toBe(buildPrompt(ordinary, exchange))
    expect(applyUpdate(withFeed, parseReply('CLOSED: f2 | done: shipped')!, 200, 1).findings.map(f => f.id)).toContain(
      'f2',
    )
  })

  test('does not count feed findings against the regular finding cap', () => {
    const ledger = {
      ...EMPTY,
      findings: [
        ...Array.from({ length: 30 }, (_, i) => ({
          ...finding(),
          id: `f${i + 1}`,
          feedKey: `m/${i}`,
          feedOwned: true as const,
        })),
        ...Array.from({ length: 29 }, (_, i) => ({ ...finding(), id: `f${i + 31}`, title: `Manual ${i}` })),
      ],
      nextId: 60,
    }
    const added = addFinding(ledger, {
      kind: 'issue',
      title: 'Another manual finding',
      detail: 'A regular finding.',
      path: null,
      at: 100,
    })
    expect(added.expired?.feedKey).toBeUndefined()
    expect(added.ledger.findings.filter(f => f.feedKey).length).toBe(30)
  })
})
