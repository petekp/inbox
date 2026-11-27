import { record, strings } from './client-view'
import type { Result, Storage } from './app.contract'

const NAVIGATION = 'app:/data/navigation-v2.json'
const LEGACY_NAVIGATION = 'app:/data/navigation.json'

const isPrRowId = (id: string) => /^.+#[0-9]+ (thread|check) /.test(id)
const legacyPrSelection = (value: unknown): string =>
  Array.isArray(value) ? (value.findLast((id: unknown) => typeof id === 'string' && isPrRowId(id)) ?? '') : ''

export async function loadSavedNavigation(storage: Storage): Promise<Result<'loadNavigation'>> {
  try {
    const value: unknown = JSON.parse(
      new TextDecoder().decode(
        await storage.fs.readFile(NAVIGATION).catch(error => {
          if ((error as { code?: string }).code !== 'ENOENT') throw error
          return storage.fs.readFile(LEGACY_NAVIGATION)
        }),
      ),
    )
    if (
      !record(value) ||
      !strings(value, ['selected', 'search']) ||
      !Array.isArray(value.places) ||
      !value.places.every(
        p =>
          record(p) &&
          strings(p, ['id', 'name', 'tab', 'asksExpanded', 'findsExpanded', 'reply']) &&
          (p.prsExpanded === undefined || typeof p.prsExpanded === 'string') &&
          ['asksTop', 'findsTop', 'statusTop'].every(k => typeof p[k] === 'number' && Number.isFinite(p[k])) &&
          (p.collapses === undefined ||
            (Array.isArray(p.collapses) &&
              p.collapses.every(entry => record(entry) && strings(entry, ['id', 'value'])))),
      )
    )
      throw new Error('Saved navigation could not be read.')
    const realPlaces = value.places.filter(p => p.sample !== true)
    const oldSelection = value.places.find(p => p.id === value.selected)
    const returnPlace =
      oldSelection?.sample === true ? realPlaces.find(p => p.id === oldSelection.returnSession) : undefined
    const selected = oldSelection?.sample === true ? (returnPlace?.id ?? '') : value.selected
    return {
      selected,
      search: value.search,
      places: realPlaces.map(p => ({
        id: p.id,
        name: p.name,
        tab: p.tab,
        asksExpanded: p.asksExpanded,
        findsExpanded: p.findsExpanded,
        prsExpanded: p.prsExpanded ?? (legacyPrSelection(p.folds) || legacyPrSelection(p.collapsed)),
        asksTop: p.asksTop,
        findsTop: p.findsTop,
        statusTop: p.statusTop,
        prsTop: typeof p.prsTop === 'number' && Number.isFinite(p.prsTop) ? p.prsTop : 0,
        reply: p.reply,
        collapses: (p.collapses ?? []).map((entry: { id: string; value: string }) => ({
          id: entry.id,
          value: entry.value,
        })),
        ...Object.fromEntries(
          ['options', 'folds', 'earlier', 'collapsed'].map(key => {
            const items = p[key] ?? []
            if (!Array.isArray(items) || !items.every(item => typeof item === 'string'))
              throw new Error('Saved navigation could not be read.')
            return [key, key === 'folds' ? items.filter(id => !isPrRowId(id)) : items]
          }),
        ),
      })),
      listTop: typeof value.listTop === 'number' && Number.isFinite(value.listTop) ? value.listTop : 0,
      tab:
        selected === '' ? 'sessions' : (returnPlace?.tab ?? (typeof value.tab === 'string' ? value.tab : 'sessions')),
    } as Result<'loadNavigation'>
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT')
      return { selected: '', search: '', places: [], tab: 'sessions', listTop: 0 }
    throw error
  }
}

export async function storeNavigation(storage: Storage, value: Result<'loadNavigation'>): Promise<void> {
  await storage.fs.atomicWriteFile(NAVIGATION, new TextEncoder().encode(JSON.stringify(value)))
}
