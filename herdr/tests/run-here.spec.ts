import { expect, test } from 'bun:test'

import { pendingResult } from '../../core/view/pressed'
import { isRunHere, runHere } from '../src/run-here'
import type { HereIo } from '../src/run-here'
import { NOW } from './fixtures'

test('a relative open runs in the look against the session’s project folder, and goes to the host without one', async () => {
  const open = [{ kind: 'open', target: 'docs/plan.md', name: 'plan.md' }] as const
  expect(isRunHere([...open], null)).toBe(false)
  expect(isRunHere([...open], '/work/app')).toBe(true)
  expect(isRunHere([{ kind: 'open', target: 'https://example.com', name: 'example.com' }], null)).toBe(true)
  const ran: string[][] = []
  const io: HereIo = {
    run: async argv => {
      ran.push(argv)
      return { code: 0, stdout: '', stderr: '' }
    },
    probe: { stat: async () => ({ isFile: () => true }), isExecutable: async () => false },
    home: '/home/me',
    projectFolder: '/work/app',
    copy: () => undefined,
  }
  expect((await runHere([...open], pendingResult([...open], NOW), io)).state).toBe('done')
  expect(ran.flat()).toContain('/work/app/docs/plan.md')
})
