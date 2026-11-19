import assert from 'node:assert/strict'
import net from 'node:net'
import { mkdtemp, rm, writeFile, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { startCompanion } from '../src/companion-listener'

function request(path: string, value: unknown): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(path)
    let text = ''
    socket.setTimeout(2000, () => socket.destroy(new Error('request timeout')))
    socket.once('connect', () => socket.write(JSON.stringify(value) + '\n'))
    socket.on('data', chunk => {
      text += chunk
      if (text.includes('\n')) {
        socket.end()
        resolve(JSON.parse(text))
      }
    })
    socket.once('error', reject)
  })
}

test('companion socket uses the current handler, enforces its chat scope, and preserves another live owner', async () => {
  const root = await mkdtemp(process.platform === 'darwin' ? '/private/tmp/inbox-companion-' : '/tmp/inbox-companion-')
  const config = join(root, 'companion.json')
  const path = join(root, 'companion/bridge.sock')
  let calls = 0
  let generation = 1
  const stop = await (async () => {
    await writeFile(config, JSON.stringify({ enabled: true, sessions: [{ id: 's1', name: 'Fixture' }] }), {
      mode: 0o600,
    })
    return startCompanion(
      root,
      async () => {
        const current = generation
        return async () => {
          calls++
          return current
        }
      },
      () => {},
    )
  })()
  try {
    assert.equal((await lstat(path)).mode & 0o777, 0o600)
    assert.equal((await request(path, { version: 1, operation: 'list' })).result, 1)
    generation = 2
    assert.equal((await request(path, { version: 1, operation: 'view', session: 's1', opened: false })).result, 2)
    assert.equal((await request(path, { version: 1, operation: 'view', session: 's2', opened: false })).ok, false)
    assert.equal((await request(path, { version: 1, operation: 'list', extra: true })).ok, false)
    assert.equal(calls, 2)
    const inode = (await lstat(path)).ino
    const stopOther = await startCompanion(
      root,
      async () => async () => 'wrong owner',
      () => {},
    )
    await stopOther()
    assert.equal((await lstat(path)).ino, inode)
    assert.equal((await request(path, { version: 1, operation: 'list' })).result, 2)
    await writeFile(config, JSON.stringify({ enabled: false, sessions: [] }))
    assert.equal((await request(path, { version: 1, operation: 'list' })).ok, false)
    assert.equal(calls, 3)
  } finally {
    await stop()
    await rm(root, { recursive: true, force: true })
  }
})
