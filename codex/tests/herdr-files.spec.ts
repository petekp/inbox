import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { startFiles } from '../src/server-herdr'

test(`Codex's file calls read a link, a dangling link and a folder as their own kinds, and a move onto a mod leaves it whole`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'inbox-herdr-files-'))
  await mkdir(join(root, 'folder'))
  await writeFile(join(root, 'file'), 'x')
  await symlink(join(root, 'folder'), join(root, 'link'))
  await symlink(join(root, 'nowhere'), join(root, 'dangling'))

  assert.equal(await startFiles.kind(join(root, 'link')), 'link')
  assert.equal(await startFiles.kind(join(root, 'dangling')), 'link')
  assert.equal(await startFiles.kind(join(root, 'folder')), 'folder')
  assert.equal(await startFiles.kind(join(root, 'file')), 'file')
  assert.equal(await startFiles.kind(join(root, 'missing')), null)
  assert.equal(await startFiles.kind(`${join(root, 'link')}/.`), 'folder')

  const mod = join(root, 'mods', 'inbox')
  await startFiles.write(join(mod, 'main.js'), 'old()')
  await startFiles.write(join(root, 'new', 'main.js'), 'new()')
  await startFiles.move(join(root, 'new'), mod).catch(() => undefined)

  assert.equal(await readFile(join(mod, 'main.js'), 'utf8'), 'old()')
  await startFiles.removeFolder(root)
})
