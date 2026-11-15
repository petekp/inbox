import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MAX_FEED_FILE_BYTES } from '../../hooks/feed'
import { readFeedFiles } from '../../feed-reader'

test('the shared feed reader stats before reading and skips files above the size cap', async () => {
  const text = JSON.stringify({ version: 1, source: 'patrol', writtenAt: 1, entries: [] })
  const reads: string[] = []
  const io = {
    resolve: (path: string) => path,
    join: (root: string, name: string) => `${root}/${name}`,
    stat: async (path: string) => ({
      isDirectory: () => path === '/feed',
      isFile: () => path !== '/feed',
      size: path === '/feed/large.json' || path === '/large.json' ? MAX_FEED_FILE_BYTES + 1 : text.length,
    }),
    list: async () => ['small.json', 'large.json'].map(name => ({ name, isFile: () => true })),
    read: async (path: string) => {
      reads.push(path)
      return text
    },
  }
  const directory = await readFeedFiles('/feed', io)
  assert.deepEqual(
    directory?.files.map(f => [f.path, f.feed?.source ?? null]),
    [
      ['/feed/small.json', 'patrol'],
      ['/feed/large.json', null],
    ],
  )
  assert.deepEqual(reads, ['/feed/small.json'])
  assert.equal((await readFeedFiles('/large.json', io))?.files[0]?.feed, null)
  assert.deepEqual(reads, ['/feed/small.json'])
})
