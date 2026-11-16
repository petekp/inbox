import { createHash, randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import net from 'node:net'
import { join } from 'node:path'

/**
 * Puts a message into a chat's running turn through the ChatGPT app's IPC socket. The app's main process routes
 * `thread-follower-steer-turn` to the window that owns the chat, which calls the app-server's `turn/steer`. The socket
 * and its messages are the app's own, not a public API. `docs/reference/codex-plugins/app-socket.md` records them.
 */

export type SteerTarget = { threadId: string; text: string; cwd: string }

export type SteerResult =
  | { kind: 'steered' }
  /** The app refused the steer, or gave no answer. The message may still have reached the turn. */
  | { kind: 'failed'; reason: string }

/** The method versions the app checked in 26.1106 and 26.1111. A window refuses a request of another version. */
const STEER_METHOD = 'thread-follower-steer-turn'
const STEER_VERSION = 1

/**
 * How long the app's router waits for the owning window's answer. The window waits up to 30 s for the turn's id, then
 * up to 30 s for the app-server's `turn/steer`, so this outlasts both and the answer is the window's own.
 */
const ROUTER_TIMEOUT_MS = 70_000
/** How long a steer may take from connecting to its answer. */
const STEER_DEADLINE_MS = 75_000

/** The longest Unix socket path the app uses as is. A longer one goes through a link in `/tmp`, as the app makes. */
const MAX_SOCKET_PATH_BYTES = process.platform === 'linux' ? 107 : 103

export async function appSocketPath(codexHome: string, uid: number | undefined): Promise<string> {
  if (process.platform === 'win32') return '\\\\.\\pipe\\codex-ipc'
  const dir = join(codexHome, 'ipc')
  const direct = join(dir, 'ipc.sock')
  if (Buffer.byteLength(direct) <= MAX_SOCKET_PATH_BYTES || uid === undefined) return direct
  const hash = createHash('sha256')
    .update(await realpath(dir))
    .digest('hex')

  return join('/tmp', `codex-ipc-${uid}`, hash, 'ipc.sock')
}

function frame(message: object): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8')
  const head = Buffer.alloc(4)
  head.writeUInt32LE(body.length, 0)

  return Buffer.concat([head, body])
}

type Response = {
  type: 'response'
  requestId: string
  resultType: 'success' | 'error'
  result?: unknown
  error?: unknown
}

function steerParams(to: SteerTarget) {
  const id = randomUUID()

  return {
    conversationId: to.threadId,
    clientUserMessageId: id,
    input: [{ type: 'text', text: to.text, text_elements: [] }],
    restoreMessage: {
      id,
      text: to.text,
      context: {
        prompt: to.text,
        addedFiles: [],
        fileAttachments: [],
        ideContext: null,
        imageAttachments: [],
        commentAttachments: [],
      },
      cwd: to.cwd,
      createdAt: Date.now(),
    },
    serviceTier: null,
    attachments: [],
    additionalContext: null,
    toolOutput: null,
  }
}

const errorText = (error: unknown): string => (typeof error === 'string' ? error : JSON.stringify(error ?? null))

/** Connects, says who it is, and sends one steer. Every way it ends settles the promise once and closes the socket. */
export function steerOver(socketPath: string, to: SteerTarget, deadlineMs = STEER_DEADLINE_MS): Promise<SteerResult> {
  return new Promise(resolve => {
    const socket = net.connect(socketPath)
    const initId = randomUUID()
    const steerId = randomUUID()
    let buffer = Buffer.alloc(0)
    let isDone = false
    const finish = (result: SteerResult) => {
      if (isDone) return
      isDone = true
      clearTimeout(timer)
      socket.destroy()
      resolve(result)
    }
    const failed = (reason: string): SteerResult => ({ kind: 'failed', reason })
    const timer = setTimeout(() => finish(failed('The Codex app did not answer in time')), deadlineMs)

    const onResponse = (r: Response) => {
      if (r.requestId === initId) {
        const clientId = (r.result as { clientId?: unknown } | undefined)?.clientId
        if (r.resultType !== 'success' || typeof clientId !== 'string') return finish(failed(errorText(r.error)))
        socket.write(
          frame({
            type: 'request',
            requestId: steerId,
            sourceClientId: clientId,
            version: STEER_VERSION,
            method: STEER_METHOD,
            params: steerParams(to),
            timeoutMs: ROUTER_TIMEOUT_MS,
          }),
        )
        return
      }
      if (r.requestId !== steerId) return
      if (r.resultType === 'success') return finish({ kind: 'steered' })
      finish(failed(errorText(r.error)))
    }

    socket.on('connect', () =>
      socket.write(
        frame({
          type: 'request',
          requestId: initId,
          sourceClientId: 'initializing-client',
          version: 0,
          method: 'initialize',
          params: { clientType: 'inbox' },
        }),
      ),
    )
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk])
      while (buffer.length >= 4) {
        const length = buffer.readUInt32LE(0)
        if (buffer.length < 4 + length) return
        const body = buffer.subarray(4, 4 + length).toString('utf8')
        buffer = buffer.subarray(4 + length)
        let message: { type?: unknown; requestId?: unknown }
        try {
          message = JSON.parse(body) as typeof message
        } catch {
          continue
        }
        if (message.type === 'client-discovery-request')
          socket.write(
            frame({ type: 'client-discovery-response', requestId: message.requestId, response: { canHandle: false } }),
          )
        else if (message.type === 'response') onResponse(message as Response)
      }
    })
    socket.on('error', err => finish(failed(err.message)))
    socket.on('close', () => finish(failed('The Codex app closed the connection')))
  })
}

export async function steerTurn(codexHome: string, to: SteerTarget): Promise<SteerResult> {
  let path: string
  try {
    path = await appSocketPath(codexHome, process.getuid?.())
  } catch (err) {
    return { kind: 'failed', reason: err instanceof Error ? err.message : String(err) }
  }

  return steerOver(path, to)
}
