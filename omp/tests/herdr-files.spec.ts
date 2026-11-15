import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { startFiles } from '../src/host-presses'

test(`omp's file calls read a link, a dangling link and a folder as their own kinds, and a move onto a mod leaves it whole`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'inbox-herdr-files-'))
  await mkdir(join(root, 'folder'))
  await writeFile(join(root, 'file'), 'x')
  await symlink(join(root, 'folder'), join(root, 'link'))
  await symlink(join(root, 'nowhere'), join(root, 'dangling'))

  expect(await startFiles.kind(join(root, 'link'))).toBe('link')
  expect(await startFiles.kind(join(root, 'dangling'))).toBe('link')
  expect(await startFiles.kind(join(root, 'folder'))).toBe('folder')
  expect(await startFiles.kind(join(root, 'file'))).toBe('file')
  expect(await startFiles.kind(join(root, 'missing'))).toBe(null)
  expect(await startFiles.kind(`${join(root, 'link')}/.`)).toBe('folder')

  const mod = join(root, 'mods', 'inbox')
  await startFiles.write(join(mod, 'main.js'), 'old()')
  await startFiles.write(join(root, 'new', 'main.js'), 'new()')
  await startFiles.move(join(root, 'new'), mod).catch(() => undefined)

  expect(await readFile(join(mod, 'main.js'), 'utf8')).toBe('old()')
  await startFiles.removeFolder(root)
})
