import { afterEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { taskTreeFromStatus } from '../../hooks/task-tree'
import { readState, statePath } from '../src/state'
import { savedTaskSession } from '../../tests/task-tree-fixtures'

const dirs: string[] = []
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'inbox-omp-tree-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

test('omp reads both a legacy session and a migrated task tree', async () => {
  const dir = tempDir()
  mkdirSync(join(dir, 'sessions'), { recursive: true })
  const oldSave = savedTaskSession()
  writeFileSync(statePath(dir, 's1'), JSON.stringify(oldSave))

  const migrated = await readState(dir, 's1')
  expect(migrated.taskTree).toEqual(taskTreeFromStatus(oldSave.ledger.overview))
  writeFileSync(statePath(dir, 's1'), JSON.stringify(migrated))

  const loadedMigrated = await readState(dir, 's1')
  expect(loadedMigrated.taskTree).toEqual(migrated.taskTree)
})
