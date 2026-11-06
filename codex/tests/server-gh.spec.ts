import assert from 'node:assert/strict'
import { test } from 'node:test'

import { TIMED_OUT_CODE, UNSTARTABLE_CODE } from '../../hooks/gh'
import { feedbackOf, feedbackText } from '../../hooks/feedback'
import { GH_TIMED_OUT_TEXT } from '../../hooks/pr-fetch'
import { ghNoticeOf, PR_REFRESH_ID } from '../../hooks/pr-rows'
import type { LastAction, Session } from '../../types'
import { readState } from '../src/state'
import { run } from '../src/run'
import { ghAnswer, PRS_STALE_MS, prServer, viewAfterFetch } from './server-fixtures'
import { PRS_HIDDEN_REFRESH_MS } from '../../hooks/host-prs'

test('a view starts a fetch of the session’s PRs through gh in its folder, and the next view shows them', async () => {
  const { dir, calls, call } = await prServer(ghAnswer)
  const first = await call('inbox_view', { tab: 'prs' })
  assert.equal(first.result.structuredContent.isFetchingPrs, true)
  assert.deepEqual(first.result.structuredContent.prs.drawn, [])
  await new Promise(resolve => setTimeout(resolve, 50))
  const next = await call('inbox_view', { tab: 'prs' })
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
  await call('inbox_view', { tab: 'prs' })
  await new Promise(resolve => setTimeout(resolve, 50))
  const next = await call('inbox_view', { tab: 'prs' })
  assert.equal(next.result.structuredContent.isGhMissing, true)
  assert.deepEqual(next.result.structuredContent.prs.drawn, [])
})

test('gh is found in the Homebrew folder when it is not on the PATH', async () => {
  const { calls, call } = await prServer(args =>
    args[0] === 'gh' ? { code: -1, stdout: '', stderr: '' } : ghAnswer(['gh', ...args.slice(1)]),
  )
  await call('inbox_view', { tab: 'prs' })
  await new Promise(resolve => setTimeout(resolve, 50))
  const next = await call('inbox_view', { tab: 'prs' })
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

test('a view keeps the PR, says once at the top that gh timed out, and does not say gh was not found, when gh worked once and then times out', async () => {
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
  assert.equal(next.result.structuredContent.prs.drawn[0]?.pr.error ?? null, null)
  assert.deepEqual(next.result.structuredContent.prs.failure, { kind: 'timed-out', at })
  assert.equal(
    ghNoticeOf({ isGhMissing: false, isGhSignedOut: false, failure: next.result.structuredContent.prs.failure })?.text,
    `${GH_TIMED_OUT_TEXT}. The PRs show as last read.`,
  )
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

test('a fetch GitHub answers with an error keeps the PRs, says so once at the top with Refresh PRs, whose press reads why it could not refresh, then Refreshed once it could', async () => {
  let at = 100
  let isFailing = false
  const { dir, calls, call } = await prServer(
    args =>
      isFailing && args[0] === 'gh' && args[2] === 'graphql'
        ? { code: 1, stdout: '', stderr: 'gh: HTTP 502: Bad gateway (https://api.github.com/graphql)' }
        : ghAnswer(args),
    () => at,
  )
  await viewAfterFetch(call)
  isFailing = true
  at += PRS_STALE_MS
  const failed = await viewAfterFetch(call)
  const { prs } = failed.result.structuredContent
  const pr = prs.drawn[0]!.pr
  assert.equal(pr.error ?? null, null)
  assert.deepEqual(prs.failure, { kind: 'error', at, text: 'HTTP 502: Bad gateway' })
  assert.deepEqual(prs.refresh?.text, null)
  assert.deepEqual(
    prs.refresh?.actions.map(a => a.label),
    ['Refresh PRs'],
  )
  const feedback = (s: { lastActions: Record<string, LastAction>; presence: Session['presence'] }) =>
    feedbackText(feedbackOf(PR_REFRESH_ID, s.lastActions[PR_REFRESH_ID], undefined, s.presence, at)!, 'codex')
  at += 1_000
  const queries = () => calls.filter(c => c[0] === 'gh' && c[2] === 'graphql').length
  const before = queries()
  const still = await call('inbox_press', { press: { action: 'pr-refresh' }, thread: 's1' })
  assert.equal(still.result.structuredContent.error, null)
  assert.equal(queries(), before + 1)
  assert.equal(feedback(await readState(dir, 's1')), 'Could not refresh PRs: HTTP 502: Bad gateway')
  isFailing = false
  const r = await call('inbox_press', { press: { action: 'pr-refresh' }, thread: 's1' })
  assert.equal(r.result.structuredContent.error, null)
  assert.equal(queries(), before + 2)
  const s = await readState(dir, 's1')
  assert.equal(s.prViews.failure ?? null, null)
  assert.equal(feedback(s), '✓ Refreshed PRs')
  assert.equal(r.result.structuredContent.view.prs.refresh, null)
})

test('a view polls the PRs again after 2 minutes while the PRs tab is shown, and after 10 minutes while another tab is', async () => {
  let at = 100
  const { call, calls } = await prServer(ghAnswer, () => at)
  const queries = () => calls.filter(c => c[0] === 'gh' && c[2] === 'graphql').length
  await viewAfterFetch(call)
  assert.equal(queries(), 1)
  at += PRS_STALE_MS
  await call('inbox_view', { tab: 'needsYou' })
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(queries(), 1)
  at += PRS_HIDDEN_REFRESH_MS - PRS_STALE_MS
  await call('inbox_view', { tab: 'needsYou' })
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(queries(), 2)
  at += PRS_STALE_MS
  await viewAfterFetch(call)
  assert.equal(queries(), 3)
})
