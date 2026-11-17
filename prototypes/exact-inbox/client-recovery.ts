import type { Storage, Result } from './app.contract.d.ts'

const PENDING = 'app:/data/pending'
type Pending = {
  protocol?: 2
  keepDraft?: boolean
  settled?: 'confirmed' | 'failed'
  viewer?: string
  journal: string
  receipt?: { ok: boolean; id: string; state: string; error: string }
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
    pending.push({ ...value, ...(names.includes(`${value.journal}.discarded`) ? { keepDraft: false } : {}) })
  }
  return pending
}

export async function keepPending(
  storage: Storage,
  value: Omit<Pending, 'journal'> & { journal?: string },
): Promise<Pending> {
  const journal =
    value.journal ??
    Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('')
  const pending = { ...value, journal }
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

export async function recoverDrafts(storage: Storage, saved: Result<'loadDrafts'>): Promise<Result<'loadDrafts'>> {
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
  await storage.fs.atomicWriteFile('app:/data/drafts.json', new TextEncoder().encode(JSON.stringify(drafts)))
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

export async function discardPendingDraft(storage: Storage, draft: string) {
  for (const action of await readAll(storage)) {
    if (action.draft === draft)
      await storage.fs.atomicWriteFile(`${PENDING}/${action.journal}.discarded`, new Uint8Array())
  }
}
