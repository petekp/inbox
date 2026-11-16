import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { taskTreeFromStatus } from '../../hooks/task-tree'
import { readState, statePath } from '../src/state'
import { tempDir } from './helpers'
import { savedTaskSession } from '../../tests/task-tree-fixtures'

test('Codex reads both a legacy session and a migrated task tree', async t => {
  const dir = tempDir()
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(join(dir, 'sessions'), { recursive: true })
  const oldSave = savedTaskSession()
  writeFileSync(statePath(dir, 's1'), JSON.stringify(oldSave))

  const migrated = await readState(dir, 's1')
  assert.deepEqual(migrated.taskTree, taskTreeFromStatus(oldSave.ledger.overview))
  writeFileSync(statePath(dir, 's1'), JSON.stringify(migrated))

  const loadedMigrated = await readState(dir, 's1')
  assert.deepEqual(loadedMigrated.taskTree, migrated.taskTree)
})
