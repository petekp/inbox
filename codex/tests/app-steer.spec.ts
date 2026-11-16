import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import net from 'node:net'
import { join } from 'node:path'
import { test } from 'node:test'

import { appSocketPath, steerOver } from '../src/app-steer'
import { tempDir } from './helpers'

type Request = { type: string; requestId: string; method?: string; version?: number; params?: Record<string, unknown> }
type SteerAnswer = { resultType: 'success'; result: unknown } | { resultType: 'error'; error: string } | null

function frame(message: object): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8')
  const head = Buffer.alloc(4)
  head.writeUInt32LE(body.length, 0)

  return Buffer.concat([head, body])
}

async function fakeRouter(steerAnswer: SteerAnswer) {
  const path = join(tempDir(), 'ipc.sock')
  const received: Request[] = []
  const discoveryAnswers: unknown[] = []
  const server = net.createServer(socket => {
    let buffer = Buffer.alloc(0)
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk])
      while (buffer.length >= 4 && buffer.length >= 4 + buffer.readUInt32LE(0)) {
        const length = buffer.readUInt32LE(0)
        const message = JSON.parse(buffer.subarray(4, 4 + length).toString('utf8')) as Request
        buffer = buffer.subarray(4 + length)
        if (message.type === 'client-discovery-response') {
          discoveryAnswers.push(message)
          continue
        }
        received.push(message)
        if (message.method === 'initialize') {
          socket.write(frame({ type: 'client-discovery-request', requestId: 'd1', request: { method: 'other' } }))
          socket.write(
            frame({
              type: 'response',
              requestId: message.requestId,
              resultType: 'success',
              result: { clientId: 'c1' },
            }),
          )
        } else if (steerAnswer)
          socket.write(
            frame({ type: 'response', requestId: message.requestId, method: message.method, ...steerAnswer }),
          )
      }
    })
  })
  await new Promise<void>(resolve => server.listen(path, resolve))

  return { path, received, discoveryAnswers, close: () => new Promise(resolve => server.close(resolve)) }
}

const TARGET = { threadId: 'thread-1', text: 'Re "Pick one": Blue', cwd: '/repo' }

test('a steer the app accepts says so, and sends the app’s steer request with version 1', async () => {
  const router = await fakeRouter({ resultType: 'success', result: { result: { turnId: 'turn-1' } } })
  const result = await steerOver(router.path, TARGET)
  await router.close()

  assert.deepEqual(result, { kind: 'steered' })
  const steer = router.received.find(m => m.method === 'thread-follower-steer-turn')
  assert.equal(steer?.version, 1)
  assert.equal(steer?.params?.conversationId, 'thread-1')
  assert.deepEqual(steer?.params?.input, [{ type: 'text', text: TARGET.text, text_elements: [] }])
  assert.deepEqual(router.discoveryAnswers, [
    { type: 'client-discovery-response', requestId: 'd1', response: { canHandle: false } },
  ])
})

test('a steer the owning window refused, as for a turn that ended, failed with the window’s reason', async () => {
  const error = 'Cannot steer conversation thread-1 because its active turn already ended'
  const router = await fakeRouter({ resultType: 'error', error })
  const result = await steerOver(router.path, TARGET)
  await router.close()

  assert.deepEqual(result, { kind: 'failed', reason: error })
})

test('a steer with no answer by the deadline failed', async () => {
  const router = await fakeRouter(null)
  const result = await steerOver(router.path, TARGET, 200)
  await router.close()

  assert.equal(result.kind, 'failed')
})

test('a socket no app listens on failed', async () => {
  const result = await steerOver(join(tempDir(), 'ipc.sock'), TARGET)

  assert.equal(result.kind, 'failed')
})

test('a Codex home whose socket path is too long uses the app’s link under /tmp', async () => {
  const home = join(tempDir(), 'a'.repeat(100))
  mkdirSync(join(home, 'ipc'), { recursive: true })

  assert.match(await appSocketPath(home, 501), /^\/tmp\/codex-ipc-501\/[0-9a-f]{64}\/ipc\.sock$/)
  assert.equal(await appSocketPath('/Users/a/.codex', 501), '/Users/a/.codex/ipc/ipc.sock')
})
