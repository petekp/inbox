import { expect, test } from 'claude-code/testing'

import type { Run } from '../hooks/gh'
import { openTarget } from '../hooks/open-targets'
import type { PathProbe } from '../hooks/open-targets'

const NO_FILES: PathProbe = { stat: async () => null, isExecutable: async () => false }

test('openTarget opens http and https links, and reads any other target as a path', async () => {
  const ran: string[][] = []
  const run: Run = async args => {
    ran.push(args)
    return { code: 0, stdout: '', stderr: '' }
  }

  expect(await openTarget(run, NO_FILES, 'http://localhost:3000/app', '/repo', '/home')).toBeNull()
  expect(await openTarget(run, NO_FILES, 'https://github.com/acme/greet/pull/12', '/repo', '/home')).toBeNull()
  expect(await openTarget(run, NO_FILES, 'vscode://file/repo/a.ts', '/repo', '/home')).toBe('it no longer exists')
  expect(ran).toEqual([
    ['open', 'http://localhost:3000/app'],
    ['open', 'https://github.com/acme/greet/pull/12'],
  ])
})
