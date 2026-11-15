import { describe, expect, test } from 'claude-code/testing'

import { feedPoll } from '../hooks/mod-feed'
import { MAX_FEED_FILE_BYTES } from '../hooks/feed'
import { EMPTY } from '../hooks/ledger'

describe('the mod feed poller', () => {
  test('reads a single file only when changed and closes its findings when it disappears', async () => {
    let mtime = 1
    let text = '{'
    let reads = 0
    let present = true
    let ledger = EMPTY
    const fs = {
      stat: async (path: string) => {
        if (!present) throw new Error(`missing ${path}`)
        return { kind: 'file' as const, isLink: false, mtimeMs: mtime, size: new TextEncoder().encode(text).length }
      },
      list: async () => [],
      exists: async () => present,
      read: async () => {
        reads++
        return text
      },
    }
    const poll = feedPoll(
      '/feed.json',
      [fs.stat, fs.list, fs.exists, fs.read],
      async () => 100,
      async change => void (ledger = change(ledger)),
    )
    await poll('s1')
    const unchanged = ledger
    await poll('s1')
    expect(ledger).toBe(unchanged)
    expect([reads, ledger.findings]).toEqual([1, []])
    mtime++
    text = JSON.stringify({
      version: 1,
      source: 'herdr-meta-patrol',
      writtenAt: 2,
      entries: [{ key: 'm/a', state: 'working', title: 'Ship feed', detail: 'Update state.', at: 2 }],
    })
    await poll('s1')
    expect([reads, ledger.findings.map(f => f.feedKey)]).toEqual([2, ['m/a']])
    present = false
    await poll('s1')
    expect(ledger.closedFindings).toMatchObject([{ feedKey: 'm/a', outcome: 'done: no longer reported' }])
  })

  test('merges directory writers and keeps unchanged snapshots available for reconciliation', async () => {
    const root = '/feeds'
    const text = (key: string, title: string) =>
      JSON.stringify({
        version: 1,
        source: key.startsWith('subagent/') ? 'claude-subagent-hook' : 'herdr-meta-patrol',
        writtenAt: 2,
        entries: [{ key, state: 'working', title, detail: 'Update state.', at: 2 }],
      })
    const contents = new Map([
      [`${root}/patrol.json`, text('herdr/local/worker', 'Patrol work')],
      [`${root}/subagent-s1-a1.json`, text('subagent/s1/a1', 'Subagent work')],
    ])
    let ledger = EMPTY
    let reads = 0
    const fs = {
      stat: async (path: string) => ({
        kind: path === root ? ('dir' as const) : ('file' as const),
        isLink: false,
        mtimeMs: 2,
        size: contents.get(path)?.length ?? 0,
      }),
      list: async () => [...contents.keys()].map(name => ({ name: name.slice(root.length + 1) })),
      exists: async () => true,
      read: async (path: string) => {
        reads++
        return contents.get(path)!
      },
    }
    const poll = feedPoll(
      root,
      [fs.stat, fs.list, fs.exists, fs.read],
      async () => 100,
      async change => void (ledger = change(ledger)),
    )
    await poll('s1')
    expect(ledger.findings.map(f => f.feedKey).sort()).toEqual(['herdr/local/worker', 'subagent/s1/a1'])
    expect(reads).toBe(2)
    contents.delete(`${root}/patrol.json`)
    await poll('s1')
    expect(ledger.findings.map(f => f.feedKey)).toEqual(['subagent/s1/a1'])
    expect(ledger.closedFindings.map(f => f.feedKey)).toEqual(['herdr/local/worker'])
  })

  test('clears the mtime cache when the conversation changes', async () => {
    const path = '/feed.json'
    const text = JSON.stringify({
      version: 1,
      source: 'claude-subagent-hook',
      writtenAt: 2,
      entries: [{ key: 'subagent/s1/a1', state: 'working', title: 'Subagent work', detail: 'Update state.', at: 2 }],
    })
    const ledgers = new Map([
      ['s1', EMPTY],
      ['s2', EMPTY],
    ])
    let active = 's1'
    let reads = 0
    const fs = {
      stat: async () => ({ kind: 'file' as const, isLink: false, mtimeMs: 2, size: text.length }),
      list: async () => [],
      exists: async () => true,
      read: async () => {
        reads++
        return text
      },
    }
    const poll = feedPoll(
      path,
      [fs.stat, fs.list, fs.exists, fs.read],
      async () => 100,
      async change => {
        ledgers.set(active, change(ledgers.get(active)!))
      },
    )
    await poll('s1')
    await poll('s1')
    active = 's2'
    await poll('s2')
    expect(reads).toBe(2)
    expect(ledgers.get('s1')?.findings).toMatchObject([{ feedKey: 'subagent/s1/a1' }])
    expect(ledgers.get('s2')?.findings).toMatchObject([{ feedKey: 'subagent/s1/a1' }])
  })

  test('does not read oversized snapshots', async () => {
    let reads = 0
    let ledger = EMPTY
    const fs = {
      stat: async () => ({ kind: 'file' as const, isLink: false, mtimeMs: 2, size: MAX_FEED_FILE_BYTES + 1 }),
      list: async () => [],
      exists: async () => true,
      read: async () => {
        reads++
        return '{}'
      },
    }
    const poll = feedPoll(
      '/large.json',
      [fs.stat, fs.list, fs.exists, fs.read],
      async () => 100,
      async change => void (ledger = change(ledger)),
    )
    await poll('s1')
    expect([reads, ledger]).toEqual([0, EMPTY])
  })
})
