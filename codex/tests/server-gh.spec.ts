import assert from 'node:assert/strict'
import { test } from 'node:test'

import { TIMED_OUT_CODE, UNSTARTABLE_CODE } from '../../hooks/gh'
import { feedbackOf, feedbackText } from '../../hooks/view'
import { GH_TIMED_OUT_TEXT } from '../../hooks/pr-fetch'
import { readState } from '../src/state'
import { run } from '../src/run'
import { ghAnswer, PRS_STALE_MS, prServer, viewAfterFetch } from './server-fixtures'

test('a view starts a fetch of the session’s PRs through gh in its folder, and the next view shows them', async () => {
  const { dir, calls, call } = await prServer(ghAnswer)
  const first = await call('inbox_view', {})
  assert.equal(first.result.structuredContent.isFetchingPrs, true)
  assert.deepEqual(first.result.structuredContent.prs.drawn, [])
  await new Promise(resolve => setTimeout(resolve, 50))
  const next = await call('inbox_view', {})
  const { prs, isFetchingPrs } = next.result.structuredContent
  assert.equal(isFetchingPrs, false)
  assert.deepEqual(
    prs.drawn.map(d => [d.pr.ref, d.pr.threads.length]),
    [['acme/app#7', 1]],
  )
  assert.equal(prs.count, 1)
  assert.ok(calls.some(c => c[0] === 'gh' && c[1] === 'pr'))
  assert.equal((await readState(dir, 's1')).prViews.branchRef, 'acme/app#7')
})

test('a view says gh was not found when no gh can start', async () => {
  const { call } = await prServer(() => ({ code: -1, stdout: '', stderr: '' }))
  await call('inbox_view', {})
  await new Promise(resolve => setTimeout(resolve, 50))
  const next = await call('inbox_view', {})
  assert.equal(next.result.structuredContent.isGhMissing, true)
  assert.deepEqual(next.result.structuredContent.prs.drawn, [])
})

test('gh is found in the Homebrew folder when it is not on the PATH', async () => {
  const { calls, call } = await prServer(args =>
    args[0] === 'gh' ? { code: -1, stdout: '', stderr: '' } : ghAnswer(['gh', ...args.slice(1)]),
  )
  await call('inbox_view', {})
  await new Promise(resolve => setTimeout(resolve, 50))
  const next = await call('inbox_view', {})
  assert.equal(next.result.structuredContent.isGhMissing, false)
  assert.equal(next.result.structuredContent.prs.drawn.length, 1)
  assert.ok(calls.some(c => c[0] === '/opt/homebrew/bin/gh' && c[1] === 'pr'))
})

test('a view says gh was not found when gh worked once and then stops starting', async () => {
  let at = 100
  let isGone = false
  const { call } = await prServer(
    args => (isGone && args[0] !== 'codex' ? { code: -1, stdout: '', stderr: '' } : ghAnswer(args)),
    () => at,
  )
  const first = await viewAfterFetch(call)
  assert.equal(first.result.structuredContent.isGhMissing, false)
  assert.equal(first.result.structuredContent.prs.drawn.length, 1)
  isGone = true
  at += PRS_STALE_MS
  const next = await viewAfterFetch(call)
  assert.equal(next.result.structuredContent.isGhMissing, true)
  assert.equal(next.result.structuredContent.prs.drawn.length, 1)
  assert.equal(next.result.structuredContent.prs.drawn[0]?.pr.error ?? null, null)
})

test('a view keeps the PR with a failed refresh, and does not say gh was not found, when gh worked once and then times out', async () => {
  let at = 100
  let isSlow = false
  const { call } = await prServer(
    args => (isSlow && args[0] !== 'codex' ? { code: TIMED_OUT_CODE, stdout: '', stderr: '' } : ghAnswer(args)),
    () => at,
  )
  await viewAfterFetch(call)
  isSlow = true
  at += PRS_STALE_MS
  const next = await viewAfterFetch(call)
  assert.equal(next.result.structuredContent.isGhMissing, false)
  assert.equal(next.result.structuredContent.prs.drawn.length, 1)
  assert.equal(next.result.structuredContent.prs.drawn[0]?.pr.error, GH_TIMED_OUT_TEXT)
})

test('run ends a command killed at its timeout with the timed-out code, and one that cannot start with the unstartable code', async () => {
  const slow = await run(['sleep', '5'], { cwd: '/', timeoutMs: 100 })
  const missing = await run(['/no/such/gh', '--version'], { cwd: '/', timeoutMs: 100 })
  assert.equal(slow.code, TIMED_OUT_CODE)
  assert.equal(missing.code, UNSTARTABLE_CODE)
})

test('a view says gh is not signed in once GitHub refuses its token, keeps the PR as it was, and clears when gh answers again', async () => {
  let at = 100
  let isRefused = false
  const { call } = await prServer(
    args =>
      isRefused && args[0] === 'gh' && args[1] !== '--version'
        ? { code: 1, stdout: '', stderr: 'HTTP 401: Bad credentials (https://api.github.com/graphql)' }
        : ghAnswer(args),
    () => at,
  )
  const first = await viewAfterFetch(call)
  assert.equal(first.result.structuredContent.prs.isGhSignedOut, false)
  isRefused = true
  at += PRS_STALE_MS
  const refused = await viewAfterFetch(call)
  assert.equal(refused.result.structuredContent.prs.isGhSignedOut, true)
  assert.equal(refused.result.structuredContent.isGhMissing, false)
  assert.equal(refused.result.structuredContent.prs.drawn.length, 1)
  assert.equal(refused.result.structuredContent.prs.drawn[0]?.pr.error ?? null, null)
  isRefused = false
  at += PRS_STALE_MS
  const answered = await viewAfterFetch(call)
  assert.equal(answered.result.structuredContent.prs.isGhSignedOut, false)
})

test('gh is found again at another path after the first one stops starting', async () => {
  let at = 100
  let hasMoved = false
  const { calls, call } = await prServer(
    args => (hasMoved && args[0] === 'gh' ? { code: -1, stdout: '', stderr: '' } : ghAnswer(['gh', ...args.slice(1)])),
    () => at,
  )
  await viewAfterFetch(call)
  hasMoved = true
  at += PRS_STALE_MS
  const next = await viewAfterFetch(call)
  assert.equal(next.result.structuredContent.isGhMissing, false)
  assert.equal(next.result.structuredContent.prs.drawn.length, 1)
  assert.equal(next.result.structuredContent.prs.drawn[0]?.pr.error ?? null, null)
  assert.ok(calls.some(c => c[0] === '/opt/homebrew/bin/gh' && c[1] === 'pr'))
})

test('Refresh PRs under a failed refresh fetches again inside the refresh window, and its row reads Refreshed', async () => {
  let at = 100
  let isFailing = false
  const { dir, calls, call } = await prServer(
    args =>
      isFailing && args[0] === 'gh' && args[1] === 'pr' ? { code: 1, stdout: '', stderr: 'HTTP 502' } : ghAnswer(args),
    () => at,
  )
  await viewAfterFetch(call)
  isFailing = true
  at += PRS_STALE_MS
  const failed = await viewAfterFetch(call)
  const pr = failed.result.structuredContent.prs.drawn[0]!.pr
  assert.equal(pr.error, 'HTTP 502')
  isFailing = false
  at += 1_000
  const lookups = () => calls.filter(c => c[0] === 'gh' && c[1] === 'pr').length
  const before = lookups()
  const r = await call('inbox_press', { press: { action: 'pr-refresh', ref: pr.ref }, thread: 's1' })
  assert.equal(r.result.structuredContent.error, null)
  assert.equal(lookups(), before + 1)
  const s = await readState(dir, 's1')
  assert.equal(s.prViews.views[pr.ref]?.error, null)
  assert.equal(
    feedbackText(feedbackOf(`pr:${pr.ref}`, s.lastActions[`pr:${pr.ref}`], undefined, s.presence, at)!, 'codex'),
    '✓ Refreshed PRs',
  )
})
