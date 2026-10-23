import assert from 'node:assert/strict'
import { test } from 'node:test'

import { trustOfHooks } from '../src/hook-trust'

test('the inbox’s hooks read modified when any changed, untrusted when any was never trusted, and trusted when all are', () => {
  const hook = (pluginId: string | null, trustStatus: string) => ({ pluginId, trustStatus })

  assert.equal(trustOfHooks([hook('inbox@inbox', 'trusted'), hook('inbox@inbox', 'trusted')]), 'trusted')
  assert.equal(trustOfHooks([hook('inbox@inbox', 'trusted'), hook('inbox@inbox', 'untrusted')]), 'untrusted')
  assert.equal(trustOfHooks([hook('inbox@inbox', 'untrusted'), hook('inbox@inbox', 'modified')]), 'modified')
  assert.equal(trustOfHooks([hook('inbox@mine', 'modified')]), 'modified')
  assert.equal(trustOfHooks([hook('other@inbox', 'modified'), hook(null, 'untrusted')]), null)
  assert.equal(trustOfHooks([]), null)
})
