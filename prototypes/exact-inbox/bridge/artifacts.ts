import { createHash, randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { agentExec } from './core'
import type { HostBinding } from './binding'

const TEXT_FILE =
  /\.(txt|md|markdown|json|jsonl|csv|log|diff|patch|html?|svg|xml|yaml|yml|toml|ini|conf|env|js|jsx|ts|tsx|css|scss|sh|py|go|rs|swift|sql)$/i
const TEXT_NAME = /^(readme|license|makefile|dockerfile)$/i
const FILE_LIMIT = 5 * 1024 * 1024
const CACHE_LIMIT = 32 * 1024 * 1024
const MAX_SNAPSHOTS = 32
const TTL = 5 * 60 * 1000
let reading = 0
const RESERVATION = FILE_LIMIT + 65536
const snapshots = new Map<
  string,
  { bytes: Buffer; name: string; expires: number; comparison: boolean; text: boolean }
>()
const READ_FILE = `import os,sys,stat,json,base64
path,root=sys.argv[1:3]
if path.startswith('~/'): path=os.path.expanduser(path)
if not os.path.isabs(path):
 if not root or not os.path.isabs(root): raise ValueError('The host did not publish a project folder.')
 path=os.path.join(root,path)
fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
try:
 before=os.fstat(fd)
 if not stat.S_ISREG(before.st_mode) or before.st_size>5242880: raise ValueError('Only regular files up to 5 MiB can be opened.')
 data=b''
 while len(data)<=5242880:
  part=os.read(fd,min(65536,5242881-len(data)))
  if not part:break
  data+=part
 after=os.fstat(fd)
 fields=lambda s:(s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
 if len(data)>5242880 or fields(before)!=fields(after) or len(data)!=before.st_size:raise ValueError('The file changed while being read.')
 print(json.dumps({'name':os.path.basename(path),'data':base64.b64encode(data).decode('ascii')}))
finally:os.close(fd)`

function prune() {
  const now = performance.now()
  for (const [id, value] of snapshots) if (value.expires <= now) snapshots.delete(id)
}

async function comparisonBytes(bytes: Buffer): Promise<Buffer | null> {
  const marker = '<plaintext id="compare-data" hidden>'
  const text = bytes.toString('utf8')
  const at = text.lastIndexOf(marker)
  if (at < 0) return null
  let value: unknown
  try {
    value = JSON.parse(text.slice(at + marker.length))
  } catch {
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  if (typeof data.pick !== 'string' || !Array.isArray(data.choices)) return null
  const oversized =
    data.choices.length > 8 ||
    (Array.isArray(data.measures) && data.measures.length > 100) ||
    (Array.isArray(data.previews) && data.previews.length > 20)
  if (oversized || Buffer.byteLength(JSON.stringify(value)) > 512 * 1024)
    throw new Error('This comparison is too large to display.')
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }]
  let nodes = 0
  while (pending.length) {
    const next = pending.pop()!
    if (typeof next.value === 'string' && (next.value.length > 20000 || next.value.split('\n').length > 1000))
      throw new Error('This comparison text is too large to display.')
    if (++nodes > 10000 || next.depth > 12) throw new Error('This comparison is too complex to display.')
    if (next.value && typeof next.value === 'object') {
      const children = Object.values(next.value)
      if (children.length > 100) throw new Error('This comparison has too many entries.')
      pending.push(...children.map(value => ({ value, depth: next.depth + 1 })))
    }
  }
  const template = await readFile(resolve(import.meta.dir, '../../../hooks/compare-page.html'), 'utf8')
  return Buffer.from(template + JSON.stringify(value))
}

export async function snapshotArtifact(
  binding: HostBinding,
  target: string,
  projectFolder: string | null,
): Promise<string> {
  if (!target || target.includes('\0') || /^[a-z][a-z0-9+.-]*:/i.test(target))
    throw new Error('This file target is unsupported.')
  prune()
  const retained = [...snapshots.values()].reduce((sum, value) => sum + value.bytes.length, 0)
  if (reading >= 2 || snapshots.size + reading >= MAX_SNAPSHOTS || retained + (reading + 1) * RESERVATION > CACHE_LIMIT)
    throw new Error('Too many files are open. Try again in a few minutes.')
  reading += 1
  try {
    const reply = await agentExec(
      binding.source === 'codex' ? null : binding,
      ['python3', '-c', READ_FILE, target, projectFolder ?? ''],
      undefined,
      Math.ceil((FILE_LIMIT * 4) / 3) + 16384,
    ).catch(() => {
      throw new Error('Couldn’t read this file on the agent’s computer.')
    })
    if (!reply || typeof reply !== 'object') throw new Error('The file snapshot could not be read.')
    const { name, data } = reply as { name?: unknown; data?: unknown }
    if (typeof name !== 'string' || typeof data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(data))
      throw new Error('Invalid file snapshot.')
    const original = Buffer.from(data, 'base64')
    if (original.length > FILE_LIMIT) throw new Error('This file is too large.')
    const comparison = await comparisonBytes(original)
    const bytes = comparison ?? original
    const used = [...snapshots.values()].reduce((sum, value) => sum + value.bytes.length, 0)
    if (snapshots.size >= MAX_SNAPSHOTS || used + bytes.length > CACHE_LIMIT)
      throw new Error('Too many files are open. Try again in a few minutes.')
    const id = randomBytes(32).toString('hex')
    let text = false
    if (!comparison && (TEXT_FILE.test(name) || TEXT_NAME.test(name)) && !bytes.includes(0)) {
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        text = true
      } catch {}
    }
    snapshots.set(id, { bytes, name, text, comparison: comparison !== null, expires: performance.now() + TTL })
    return `/api/artifacts/${id}`
  } finally {
    reading -= 1
  }
}

export function artifactResponse(id: string): Response {
  prune()
  const value = /^[a-f0-9]{64}$/.test(id) ? snapshots.get(id) : undefined
  if (!value)
    return new Response('This file link expired. Open it again from its Inbox row.', {
      status: 404,
      headers: { 'cache-control': 'no-store' },
    })
  const headers: Record<string, string> = {
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'content-type': value.comparison
      ? 'text/html; charset=utf-8'
      : value.text
        ? 'text/plain; charset=utf-8'
        : 'application/octet-stream',
    'content-disposition': `${value.comparison || value.text ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(value.name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`,
    'content-security-policy': "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'",
  }
  if (value.comparison) {
    const script = value.bytes.toString('utf8').match(/<script>([\s\S]*?)<\/script>/)?.[1]
    const hash = createHash('sha256')
      .update(script ?? '')
      .digest('base64')
    headers['content-security-policy'] =
      `sandbox allow-scripts; default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`
  }
  return new Response(new Uint8Array(value.bytes), { headers })
}
