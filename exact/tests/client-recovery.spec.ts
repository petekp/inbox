import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  prepareSubmission,
  readPending,
  settlePending,
  storeDrafts,
  loadSavedDrafts,
  discardSavedDraft,
} from '../client-recovery'
import { submissionId, legacySubmissionId } from '../submission-id'
import type { Storage } from '../app.contract'

function diskStorage(root: string): Storage {
  const path = (uri: string) => {
    if (!uri.startsWith('app:/data/') || uri.includes('..')) throw new Error('Unexpected storage path')
    return join(root, uri.slice('app:/data/'.length))
  }
  return {
    fs: {
      mkdir: (uri: string) => mkdir(path(uri)),
      readdir: (uri: string) => readdir(path(uri)),
      readFile: async (uri: string) => new Uint8Array(await readFile(path(uri))).buffer,
      atomicWriteFile: (uri: string, bytes: Uint8Array) => writeFile(path(uri), bytes),
      rm: (uri: string) => rm(path(uri)),
    },
  } as unknown as Storage
}

test('submission identities retain the helper’s published UTF-8 hash contract', async () => {
  const expected = (first: string, second: string) =>
    createHash('sha256').update(first).update('\0').update(second).digest('hex')
  expect(await submissionId('a'.repeat(64), 'b'.repeat(32))).toBe(expected('a'.repeat(64), 'b'.repeat(32)))
  expect(await legacySubmissionId('old-key', 'Reply 🌙')).toBe(expected('old-key', 'Reply 🌙'))
})

test('retrying an unresolved reply retains its intent despite a changed row action key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'inbox-client-recovery-'))
  try {
    const storage = diskStorage(root)
    const input = {
      session: 'a'.repeat(64),
      key: 'b'.repeat(64),
      text: 'Can you explain?',
      row: 'i1',
      draft: 'draft-i1',
      viewer: 'viewer-original',
    }
    await expect(prepareSubmission(storage, { ...input, text: 'x'.repeat(8001) })).rejects.toThrow('8,000')
    expect(await readPending(storage)).toEqual([])
    const first = await prepareSubmission(storage, input)
    if (first.kind !== 'send') throw new Error('A new action did not produce an intent')
    const original = await readFile(join(root, 'pending', first.action.journal + '.json'), 'utf8')
    expect(first.action.id).toBe(await submissionId(input.session, first.action.journal))
    const retry = await prepareSubmission(storage, { ...input, key: 'c'.repeat(64), viewer: 'viewer-reconnected' })
    expect(retry).toEqual(first)
    expect(await readFile(join(root, 'pending', first.action.journal + '.json'), 'utf8')).toBe(original)
    expect(await readPending(storage)).toEqual([first.action])
    await expect(prepareSubmission(storage, { ...input, key: 'c'.repeat(64), draft: '', text: '' })).rejects.toThrow(
      'awaiting confirmation',
    )
    expect(await readPending(storage)).toEqual([first.action])
    await settlePending(storage, first.action.id, true)
    await storeDrafts(storage, [])
    expect(await readPending(storage)).toEqual([])
    const late = await prepareSubmission(storage, { ...input, key: 'c'.repeat(64), previousId: first.action.id })
    expect(late).toEqual({ kind: 'receipt', id: first.action.id })
    expect(await readPending(storage)).toEqual([])
    const next = await prepareSubmission(storage, { ...input, key: 'c'.repeat(64) })
    if (next.kind !== 'send') throw new Error('A new deliberate send did not produce an intent')
    expect(next.action.id).not.toBe(first.action.id)
    expect(next.action.key).toBe('c'.repeat(64))
    await expect(
      prepareSubmission(storage, { ...input, session: 'd'.repeat(64), previousId: next.action.id }),
    ).rejects.toThrow('another reply')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('an uncertain PR action blocks a replacement action after its view changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'inbox-pr-recovery-'))
  try {
    const storage = diskStorage(root)
    const input = { session: 'a'.repeat(64), key: 'b'.repeat(64), row: 'acme/app#12 check', draft: '', text: '' }
    const first = await prepareSubmission(storage, input)
    if (first.kind !== 'send') throw new Error('Missing intent')
    await expect(prepareSubmission(storage, { ...input, key: 'c'.repeat(64) })).rejects.toThrow('awaiting confirmation')
    expect(await prepareSubmission(storage, input)).toEqual(first)
    expect((await readPending(storage)).length).toBe(1)
    await settlePending(storage, first.action.id, true)
    const next = await prepareSubmission(storage, { ...input, key: 'c'.repeat(64) })
    if (next.kind !== 'send') throw new Error('Missing new intent')
    expect(next.action.id).not.toBe(first.action.id)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Undo can cancel an unresolved action without allowing another ordinary action', async () => {
  const root = await mkdtemp(join(tmpdir(), 'inbox-undo-recovery-'))
  try {
    const storage = diskStorage(root)
    const input = { session: 'a'.repeat(64), key: 'b'.repeat(64), row: 'i1', draft: '', text: '' }
    const original = await prepareSubmission(storage, input)
    const undo = await prepareSubmission(storage, { ...input, key: 'c'.repeat(64), undo: true })
    if (original.kind !== 'send' || undo.kind !== 'send') throw new Error('Missing intent')
    expect(undo.action.id).not.toBe(original.action.id)
    expect(await prepareSubmission(storage, { ...input, key: 'd'.repeat(64), undo: true })).toEqual(undo)
    await expect(prepareSubmission(storage, { ...input, key: 'e'.repeat(64) })).rejects.toThrow('awaiting confirmation')
    expect((await readPending(storage)).length).toBe(2)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('legacy drafts retry after directory failure without overwriting a newer save', async () => {
  const root = await mkdtemp(join(tmpdir(), 'inbox-draft-projection-'))
  try {
    const storage = diskStorage(root)
    const old = { id: 'legacy:i1', session: 'legacy', row: 'i1', key: 'key', title: 'Question', text: 'Earlier text' }
    await storeDrafts(storage, [old])
    await expect(
      loadSavedDrafts(storage, async () => {
        throw new Error('offline')
      }),
    ).rejects.toThrow('offline')
    for (const directory of [
      { entries: [], defaultId: '', error: 'Host unavailable' },
      { entries: [], defaultId: '', error: '' },
    ]) {
      await expect(loadSavedDrafts(storage, async () => directory)).rejects.toThrow()
    }
    expect(JSON.parse(await readFile(join(root, 'drafts.json'), 'utf8'))).toEqual([old])
    let started!: () => void
    let release!: (value: unknown) => void
    const waiting = new Promise<void>(resolve => {
      started = resolve
    })
    const reading = loadSavedDrafts(storage, () => {
      started()
      return new Promise(resolve => {
        release = resolve
      })
    })
    await waiting
    const newer = { ...old, text: 'Newer text' }
    await storeDrafts(storage, [newer])
    const session = 'a'.repeat(64)
    release({ defaultId: session, entries: [{ id: session, session: 'legacy' }] })
    expect(await reading).toEqual([{ ...old, session, id: session + ':i1' }])
    expect(JSON.parse(await readFile(join(root, 'drafts.json'), 'utf8'))).toEqual([newer])
    await rm(join(root, 'drafts.json'))
    await prepareSubmission(storage, {
      session: 'legacy',
      key: 'key',
      row: 'i1',
      draft: 'legacy:i1',
      text: 'Pending reply',
    })
    await expect(
      loadSavedDrafts(storage, async () => ({ entries: [], defaultId: '', error: 'offline' })),
    ).rejects.toThrow('offline')
    const restored = await loadSavedDrafts(storage, async () => ({
      defaultId: session,
      entries: [{ id: session, session: 'legacy' }],
    }))
    expect(restored).toHaveLength(1)
    expect(restored[0]).toMatchObject({ session, id: session + ':i1', text: 'Pending reply' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('discarded pending text stays discarded after reload and final refusal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'inbox-discard-recovery-'))
  try {
    const storage = diskStorage(root)
    const draft = {
      id: 'draft-i1',
      row: 'i1',
      session: 'a'.repeat(64),
      title: 'Question',
      key: 'b'.repeat(64),
      text: 'Discard this pending reply',
    }
    await storeDrafts(storage, [draft])
    const intent = await prepareSubmission(storage, {
      session: draft.session,
      key: draft.key,
      row: draft.row,
      text: draft.text,
      draft: draft.id,
    })
    if (intent.kind !== 'send') throw new Error('Missing intent')
    await discardSavedDraft(storage, draft.id, [])
    const restarted = diskStorage(root)
    expect(await loadSavedDrafts(restarted, async () => ({ entries: [] }))).toEqual([])
    await settlePending(restarted, intent.action.id, false)
    expect(await loadSavedDrafts(restarted, async () => ({ entries: [] }))).toEqual([])
    await storeDrafts(restarted, [])
    expect(await readPending(restarted)).toEqual([])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
