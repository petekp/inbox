import { describe, expect, test } from 'claude-code/testing'

import { resolveInboxFeedPath } from '../hooks/feed-path'
import type { Run } from '../hooks/gh'

const home = '/home/example'
const identity = { paneId: 'w1:p1' }

function herdr(name: string): Run {
  return async () => ({
    code: 0,
    stdout: JSON.stringify({ result: { agent: { name } } }),
    stderr: '',
  })
}

describe('inbox feed path', () => {
  test('uses the default directory when the Herdr agent is meta', async () => {
    await expect(resolveInboxFeedPath(undefined, home, identity, herdr('meta'))).resolves.toBe(
      '/home/example/.local/state/inbox/feeds',
    )
  })

  test('does not select a default directory for another Herdr agent', async () => {
    await expect(resolveInboxFeedPath(undefined, home, identity, herdr('worker'))).resolves.toBeUndefined()
  })

  test('keeps an explicit feed path without querying Herdr', async () => {
    let queried = false
    const run: Run = async () => {
      queried = true
      return { code: 1, stdout: '', stderr: '' }
    }

    await expect(resolveInboxFeedPath('/custom/feed', home, identity, run)).resolves.toBe('/custom/feed')
    expect(queried).toBe(false)
  })

  test('keeps an explicitly empty feed disabled without querying Herdr', async () => {
    let queried = false
    const run: Run = async () => {
      queried = true
      return { code: 0, stdout: JSON.stringify({ result: { agent: { name: 'meta' } } }), stderr: '' }
    }

    await expect(resolveInboxFeedPath('', home, identity, run)).resolves.toBe('')
    expect(queried).toBe(false)
  })
})
