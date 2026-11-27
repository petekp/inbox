import { record, strings } from './client-view'
import { submissionId, legacySubmissionId, MAX_REPLY_LENGTH } from './submission-id'
import type { Storage, Result } from './app.contract.d.ts'

const DRAFTS = 'app:/data/drafts.json'
const PENDING = 'app:/data/pending'
type Pending = {
  protocol?: 2
  undo?: boolean
  keepDraft?: boolean
  settled?: 'confirmed' | 'failed'
  viewer?: string
  journal: string
  session: string
  key: string
  row: string
  draft: string
  text: string
  id: string
}

async function readAll(storage: Storage): Promise<Pending[]> {
  const names: string[] = await storage.fs.readdir(PENDING).catch(error => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const pending: Pending[] = []
  for (const name of names) {
    if (!/^[a-f0-9]{32}\.json$/.test(name)) continue
    let bytes: ArrayBuffer
    try {
      bytes = await storage.fs.readFile(`${PENDING}/${name}`)
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') continue
      throw error
    }
    const value = JSON.parse(new TextDecoder().decode(bytes))
    if (
      !value ||
      typeof value !== 'object' ||
      !['journal', 'session', 'key', 'row', 'draft', 'text', 'id'].every(k => typeof value[k] === 'string') ||
      `${value.journal}.json` !== name
    )
      throw new Error('Saved actions could not be read.')
    if (value.protocol !== undefined && value.protocol !== 2)
      throw new Error('Saved actions need a newer Inbox version.')
    const id = await (value.protocol === 2
      ? submissionId(value.session, value.journal)
      : legacySubmissionId(value.key, value.text))
    if (value.id && value.id !== id) throw new Error('A saved action’s identity could not be verified.')
    pending.push({ ...value, id, ...(names.includes(`${value.journal}.discarded`) ? { keepDraft: false } : {}) })
  }
  return pending
}

async function keepPending(storage: Storage, value: Omit<Pending, 'journal'> & { journal?: string }): Promise<Pending> {
  const journal =
    value.journal ??
    Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('')
  const id =
    value.id ||
    (await (value.protocol === 2 ? submissionId(value.session, journal) : legacySubmissionId(value.key, value.text)))
  const pending = { ...value, journal, id }
  await storage.fs.mkdir(PENDING).catch(error => {
    if (error.code !== 'EEXIST') throw error
  })
  await storage.fs.atomicWriteFile(`${PENDING}/${journal}.json`, new TextEncoder().encode(JSON.stringify(pending)))
  return pending
}

const seenSettled = new Set<string>()

export async function readPending(storage: Storage): Promise<Pending[]> {
  return (await readAll(storage)).filter(p => !p.settled)
}

export async function settlePending(storage: Storage, id: string, confirmed: boolean) {
  for (const action of (await readAll(storage)).filter(p => p.id === id)) {
    await keepPending(storage, { ...action, settled: confirmed ? 'confirmed' : 'failed' })
    seenSettled.add(action.journal)
  }
}

async function recoverDrafts(storage: Storage, saved: Result<'loadDrafts'>): Promise<Result<'loadDrafts'>> {
  let drafts = saved
  for (const action of await readAll(storage)) {
    if (action.settled) seenSettled.add(action.journal)
    if (!action.draft || !action.text || action.keepDraft === false) continue
    if (action.settled === 'confirmed') {
      drafts = drafts.filter(d => d.id !== action.draft || d.text !== action.text)
    } else if (!drafts.some(d => d.id === action.draft && d.text !== '')) {
      drafts = drafts
        .filter(d => d.id !== action.draft)
        .concat([
          {
            id: action.draft,
            session: action.session,
            row: action.row,
            title: 'Saved reply',
            key: action.key,
            text: action.text,
          },
        ])
    }
  }
  return drafts
}

export async function storeDrafts(storage: Storage, drafts: Result<'loadDrafts'>) {
  const eligible = new Set(seenSettled)
  await storage.fs.atomicWriteFile(DRAFTS, new TextEncoder().encode(JSON.stringify(drafts)))
  for (const action of await readAll(storage)) {
    if (!action.settled || !eligible.has(action.journal)) continue
    const saved = drafts.find(d => d.id === action.draft)
    const represented =
      !action.draft ||
      (action.keepDraft === false
        ? !saved
        : action.settled === 'confirmed'
          ? saved?.text !== action.text
          : !!saved?.text)
    if (!represented) continue
    for (const suffix of ['json', 'discarded'])
      await storage.fs.rm(`${PENDING}/${action.journal}.${suffix}`).catch(error => {
        if (error.code !== 'ENOENT') throw error
      })
    seenSettled.delete(action.journal)
  }
}

export async function discardSavedDraft(storage: Storage, draft: string, drafts: Result<'loadDrafts'>) {
  for (const action of await readAll(storage)) {
    if (action.draft === draft)
      await storage.fs.atomicWriteFile(`${PENDING}/${action.journal}.discarded`, new Uint8Array())
  }
  await storeDrafts(storage, drafts)
}

export class SubmissionRefusedError extends Error {}

type SubmissionInput = Pick<Pending, 'session' | 'key' | 'text' | 'row' | 'draft' | 'viewer' | 'undo'> & {
  previousId?: string
}

export async function prepareSubmission(
  storage: Storage,
  input: SubmissionInput,
): Promise<{ kind: 'send'; action: Pending } | { kind: 'receipt'; id: string }> {
  if (input.text.length > MAX_REPLY_LENGTH) throw new SubmissionRefusedError('Reply must be at most 8,000 characters.')
  const all = await readAll(storage)
  if (input.previousId) {
    const previous = all.find(action => action.id === input.previousId)
    if (!previous) return { kind: 'receipt', id: input.previousId }
    const sameIntent =
      previous.session === input.session &&
      previous.row === input.row &&
      previous.text === input.text &&
      previous.draft === input.draft
    if (!sameIntent) throw new Error('The previous request belongs to another reply.')
    if (previous.settled) return { kind: 'receipt', id: input.previousId }
    return { kind: 'send', action: previous }
  }
  const existing = all.find(
    action =>
      !action.settled &&
      action.session === input.session &&
      action.text === input.text &&
      (action.key === input.key ||
        (input.draft !== '' && action.draft === input.draft && action.row === input.row) ||
        (input.undo === true && action.undo === true && action.row === input.row)),
  )
  if (existing) return { kind: 'send', action: existing }
  const rowPending = all.some(action => !action.settled && action.session === input.session && action.row === input.row)
  if (rowPending && !input.undo)
    throw new SubmissionRefusedError('An earlier action on this row is awaiting confirmation. Refresh to check it.')
  const { previousId: _previousId, ...fields } = input
  return { kind: 'send', action: await keepPending(storage, { ...fields, protocol: 2, id: '' }) }
}

export async function loadSavedDrafts(
  storage: Storage,
  directory: () => Promise<unknown>,
): Promise<Result<'loadDrafts'>> {
  let value: unknown = []
  try {
    const bytes = await storage.fs.readFile(DRAFTS)
    value = JSON.parse(new TextDecoder().decode(bytes))
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error
  }
  if (
    !Array.isArray(value) ||
    !value.every(d => record(d) && strings(d, ['id', 'row', 'session', 'title', 'key', 'text']))
  )
    throw new Error('Saved replies could not be read.')
  const drafts = await recoverDrafts(storage, value as Result<'loadDrafts'>)
  const legacy = drafts.filter(d => !/^[a-f0-9]{64}$/.test(d.session))
  if (!legacy.length) return drafts
  const sessions = await directory()
  if (!record(sessions) || !Array.isArray(sessions.entries))
    throw new Error('Saved replies need a valid session directory.')
  if (typeof sessions.error === 'string' && sessions.error) throw new Error(sessions.error)
  const entries = sessions.entries
  const upgraded = drafts.map(d => {
    if (/^[a-f0-9]{64}$/.test(d.session)) return d
    const matches = entries.filter((e: unknown) => record(e) && e.session === d.session && e.id === sessions.defaultId)
    if (matches.length !== 1 || typeof matches[0].id !== 'string')
      throw new Error('Saved replies could not be matched to their original session.')
    return { ...d, session: matches[0].id, id: `${matches[0].id}:${d.row}` }
  })
  return upgraded
}
