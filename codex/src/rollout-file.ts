// Reads the bytes of a rollout file. Codex compresses older and archived rollouts with zstd (`.jsonl.zst`).

import { createReadStream } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import * as zlib from 'node:zlib'

/** Node reads zstd from 22.15 and 23.8. On an older Node, a compressed rollout is not read. */
export const canReadZstd = typeof zlib.createZstdDecompress === 'function'

export const isCompressed = (path: string): boolean => path.endsWith('.zst')

export type Bytes = { buf: Buffer; start: number }

/** The last `bytes` before `end` of a plain file, and the offset they start at. */
async function plainBytesBefore(path: string, bytes: number, end: number): Promise<Bytes> {
  const file = await open(path, 'r')
  try {
    const stop = Math.min(end, (await file.stat()).size)
    const start = Math.max(0, stop - bytes)
    const buf = Buffer.alloc(stop - start)
    const { bytesRead } = await file.read(buf, 0, buf.length, start)

    return { buf: buf.subarray(0, bytesRead), start }
  } finally {
    await file.close()
  }
}

/**
 * The last `bytes` before `end` of a compressed file's content. It streams the whole file up to `end`, keeping only the
 * window, since a compressed rollout can hold hundreds of megabytes.
 */
async function compressedBytesBefore(path: string, bytes: number, end: number): Promise<Bytes> {
  if (!canReadZstd) throw new Error('This Node cannot read zstd')
  const kept: Buffer[] = []
  let keptBytes = 0
  let read = 0
  const input = createReadStream(path)
  const content = input.pipe(zlib.createZstdDecompress())
  input.on('error', err => content.destroy(err))
  try {
    for await (const chunk of content as AsyncIterable<Buffer>) {
      const part = chunk.subarray(0, Math.max(0, end - read))
      read += part.length
      kept.push(part)
      keptBytes += part.length
      while (kept.length > 1 && keptBytes - kept[0]!.length >= bytes) keptBytes -= kept.shift()!.length
      if (read >= end) break
    }
  } finally {
    input.destroy()
    content.destroy()
  }
  const window = Buffer.concat(kept)
  const cut = Math.max(0, window.length - bytes)

  return { buf: window.subarray(cut), start: read - window.length + cut }
}

/** The tails of compressed rollouts read, newest last. Codex does not change a compressed rollout. */
const tails = new Map<string, { version: string; tail: Bytes }>()
const KEPT_TAILS = 4
const TAIL_KEPT_BYTES = 8 * 1024 * 1024

/**
 * The last `bytes` before `end` of a rollout's content, and the offset they start at. The tab polls a chat's newest turn
 * every few seconds, so the end of a compressed rollout is kept once read.
 */
export async function bytesBefore(path: string, bytes: number, end = Infinity): Promise<Bytes> {
  if (!isCompressed(path)) return plainBytesBefore(path, bytes, end)
  if (end !== Infinity || bytes > TAIL_KEPT_BYTES) return compressedBytesBefore(path, bytes, end)
  const info = await stat(path)
  const version = `${info.size}:${info.mtimeMs}`
  let known = tails.get(path)
  if (known?.version !== version) {
    known = { version, tail: await compressedBytesBefore(path, TAIL_KEPT_BYTES, Infinity) }
    tails.delete(path)
    tails.set(path, known)
    for (const old of tails.keys()) if (tails.size > KEPT_TAILS) tails.delete(old)
  }
  const { buf, start } = known.tail
  const cut = Math.max(0, buf.length - bytes)

  return { buf: buf.subarray(cut), start: start + cut }
}

/** The first `bytes` of a rollout's content. */
export async function firstBytes(path: string, bytes: number): Promise<Buffer> {
  if (!isCompressed(path)) {
    const file = await open(path, 'r')
    try {
      const buf = Buffer.alloc(bytes)
      const { bytesRead } = await file.read(buf, 0, bytes, 0)

      return buf.subarray(0, bytesRead)
    } finally {
      await file.close()
    }
  }

  return (await compressedBytesBefore(path, bytes, bytes)).buf
}
