import { describe, expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { EMPTY_STATUS_TEXT, emptyTab, prsEmptyHint } from '../core/view/empty-tab'
import { GH_MISSING_TEXT, GH_SIGNED_OUT_TEXT } from '../core/view/pr-rows'
import { emptySession } from '../core/view/session-files'
import { sessionView } from '../core/view/session-view'
import type { SessionView } from '../core/view/session-view'
import type { GhSync, LedgerSync } from '../core/view/sync-state'
import { goalKeyPlan } from '../core/view/status-keys'

const VIEW = sessionView(emptySession(), 1000, 0)
const ASKS = { tab: 'needsYou', agent: 'Claude', drawn: 0, hasBlocker: false } as const
const PRS = { tab: 'prs', place: 'session', drawn: 0, isFetchingPrs: false } as const
const REFRESH = { text: 'PR #4 could not be read.', actions: [], showsPress: false }

const withLedger = (v: SessionView, ledger: LedgerSync): SessionView => ({ ...v, sync: { ...v.sync, ledger } })
const withGh = (v: SessionView, gh: GhSync): SessionView => ({ ...v, prs: { ...v.prs, gh } })

describe('emptyTab', () => {
  test('an Asks tab with nothing drawn reads Nothing needed, with the agent named in its hint', () => {
    expect(emptyTab(VIEW, ASKS)).toEqual({
      title: 'Nothing needed',
      hint: "Claude's questions and the tasks only you can do show up here.",
      under: null,
      titleMark: { isRunning: false },
    })
  })

  test('a Finds tab with nothing drawn reads No findings yet', () => {
    expect(emptyTab(VIEW, { ...ASKS, tab: 'findings', agent: 'Codex' })).toEqual({
      title: 'No findings yet',
      hint: 'Codex flags issues and opportunities it spots beyond your task.',
      under: null,
      titleMark: { isRunning: false },
    })
  })

  test('a row tab is not empty while it draws a row or a blocker such as a stop', () => {
    expect(emptyTab(VIEW, { ...ASKS, drawn: 1 })).toBeNull()
    expect(emptyTab(VIEW, { ...ASKS, hasBlocker: true })).toBeNull()
    expect(emptyTab(VIEW, { ...ASKS, tab: 'findings', drawn: 2 })).toBeNull()
  })

  test('a row tab that may be missing rows says so in its title and keeps its hint', () => {
    expect(emptyTab(withLedger(VIEW, { is: 'stale', since: null, why: 'failed' }), ASKS)?.title).toBe(
      'May be out of date',
    )
    expect(
      emptyTab(withLedger(VIEW, { is: 'unavailable', why: 'read-failed' }), { ...ASKS, tab: 'findings' }),
    ).toMatchObject({
      title: 'May be out of date',
      hint: 'Claude flags issues and opportunities it spots beyond your task.',
    })
  })

  test('a row tab keeps Nothing needed while the inbox checks, with a running mark after it', () => {
    expect(emptyTab(withLedger(VIEW, { is: 'checking' }), ASKS)).toMatchObject({
      title: 'Nothing needed',
      titleMark: { isRunning: true },
    })
  })

  test('the host’s own Asks text takes the place of the shared one, and not the Finds tab’s', () => {
    const hostText = { title: 'The inbox starts with your next message.', hint: null }
    expect(emptyTab(VIEW, { ...ASKS, hostText })).toEqual({ ...hostText, under: null, titleMark: null })
    expect(emptyTab(VIEW, { ...ASKS, tab: 'findings', hostText })?.title).toBe('No findings yet')
  })

  test('while the agent’s own dialog waits, an empty Asks tab says so in place of the host’s text, and Finds does not', () => {
    const hostText = { title: 'The inbox starts with your next message.', hint: null }
    expect(emptyTab(VIEW, { ...ASKS, openDialog: 'question', hostText })).toEqual({
      title: 'Claude is waiting for your answer',
      hint: "Answer the question in Claude's dialog.",
      under: null,
      titleMark: null,
    })
    expect(emptyTab(VIEW, { ...ASKS, agent: 'omp', openDialog: 'permission' })).toMatchObject({
      title: 'omp is waiting for your permission',
      hint: "Allow or deny it in omp's dialog.",
    })
    expect(emptyTab(VIEW, { ...ASKS, tab: 'findings', openDialog: 'question' })?.title).toBe('No findings yet')
    expect(emptyTab(VIEW, { ...ASKS, drawn: 1, openDialog: 'question' })).toBeNull()
  })

  test('a PRs tab with no PR drawn reads No PRs, or Checking for PRs… while a fetch runs, with the host’s word in its hint', () => {
    expect(emptyTab(VIEW, PRS)).toEqual({
      title: 'No PRs',
      hint: prsEmptyHint('session'),
      under: null,
      titleMark: null,
    })
    expect(emptyTab(VIEW, { ...PRS, place: 'chat', isFetchingPrs: true })).toEqual({
      title: 'Checking for PRs…',
      hint: 'Your PRs show here when this chat opens or links one, or when your branch has one.',
      under: null,
      titleMark: null,
    })
    expect(emptyTab(VIEW, { ...PRS, drawn: 1 })).toBeNull()
  })

  test('an empty PRs tab gives why gh cannot read the PRs as its hint', () => {
    expect(emptyTab(withGh(VIEW, { is: 'unavailable', why: 'gh-missing' }), PRS)?.hint).toBe(GH_MISSING_TEXT)
    expect(emptyTab(withGh(VIEW, { is: 'unavailable', why: 'gh-signed-out' }), PRS)?.hint).toBe(GH_SIGNED_OUT_TEXT)
  })

  test('an empty PRs tab puts Refresh PRs under its text while a PR could not be read', () => {
    const view = { ...VIEW, prs: { ...VIEW.prs, refresh: REFRESH } }
    expect(emptyTab(view, PRS)?.under).toEqual({ is: 'pr-refresh', refresh: REFRESH })
  })

  test('an empty Status page reads its name and hint, with the goal’s buttons or its open field under them', () => {
    const keys = goalKeyPlan(VIEW.statusPage)
    expect(VIEW.statusPage.isEmpty).toBe(true)
    expect(emptyTab(VIEW, { tab: 'overview', isGoalFieldOpen: false })).toEqual({
      ...EMPTY_STATUS_TEXT,
      under: { is: 'set-goal', keys, offerKeys: [], isFieldOpen: false, suggestion: null },
      titleMark: null,
    })
    expect(emptyTab(VIEW, { tab: 'overview', isGoalFieldOpen: true })?.under).toEqual({
      is: 'set-goal',
      keys,
      offerKeys: [],
      isFieldOpen: true,
      suggestion: null,
    })
    expect(EMPTY_STATUS_TEXT.title).toBe('Status')
  })

  test('a Status page with something on it is not empty', () => {
    const page = { ...VIEW.statusPage, isEmpty: false }
    expect(emptyTab({ ...VIEW, statusPage: page }, { tab: 'overview', isGoalFieldOpen: false })).toBeNull()
  })
})
