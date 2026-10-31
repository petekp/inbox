import type { Finding, SubjectStatus } from '../types'
import type { ClosedState } from './ledger-close'
import type { ToneName } from './tones'
import type { Look } from './rows'
import { shownTabs, isRowTab } from './tabs'
import type { ShownTab } from './tabs'

export const FINDING_GROUPS: Record<Finding['kind'], { title: string; mark: string; tone: 'issue' | 'done' }> = {
  issue: { title: 'Issues', mark: '▲', tone: 'issue' },
  opportunity: { title: 'Opportunities', mark: '✦', tone: 'done' },
}

/** A mark's tone on the Status. Null draws it muted. */
export type StatusTone = 'needsYou' | 'done' | null

export const SUBJECT_MARKS: Record<SubjectStatus, { mark: string; tone: StatusTone }> = {
  working: { mark: '●', tone: null },
  queued: { mark: '○', tone: null },
  'waits-on-other': { mark: '◌', tone: null },
  done: { mark: '✓', tone: 'done' },
  dropped: { mark: '✗', tone: null },
}
/** The mark of an open subject that an open ask holds up, in place of its status's mark, and of a delegate that waits for the person. */
export const HELD_MARK: { mark: string; tone: 'needsYou' } = { mark: '◆', tone: 'needsYou' }

/** The marks a running row cycles through in the text looks, one each `RUNNING_FRAME_MS`. */
export const RUNNING_FRAMES = ['●', '◉', '◎', '◉'] as const

/** The running mark's first frame, which the Codex tab fades instead of cycling the frames. */
export const RUNNING_MARK = RUNNING_FRAMES[0]

/** The mark of a working subject while no turn runs and no child under it works. */
export const IDLE_MARK: { mark: string; tone: StatusTone } = { mark: '◐', tone: null }

export const CLOSED_MARKS: Record<ClosedState, string> = {
  handled: SUBJECT_MARKS.done.mark,
  dismissed: '✕',
  lapsed: SUBJECT_MARKS.dropped.mark,
}

/** A PR row's mark: a review thread that waits on the person, one sent to the agent, and a failing check. */
export const PR_MARKS = {
  waiting: { text: HELD_MARK.mark, tone: 'needsYou' },
  sent: { text: SUBJECT_MARKS.done.mark, tone: 'done' },
  failing: { text: FINDING_GROUPS.issue.mark, tone: 'error' },
} as const

/** One mark the legend explains. `isRunning` draws it as the running mark. */
export type LegendEntry = { mark: string; tone: ToneName | null; isRunning: boolean; words: string }

/** Every mark a look draws on a row or a group title, once each, with what it means wherever it appears. */
export const MARK_LEGEND: readonly LegendEntry[] = [
  {
    mark: RUNNING_MARK,
    tone: null,
    isRunning: true,
    words: 'Working. It moves while the work runs or your message is on its way.',
  },
  { mark: IDLE_MARK.mark, tone: null, isRunning: false, words: 'Working, with nothing running right now' },
  { mark: SUBJECT_MARKS.queued.mark, tone: null, isRunning: false, words: 'Queued: not started yet' },
  {
    mark: SUBJECT_MARKS['waits-on-other'].mark,
    tone: null,
    isRunning: false,
    words: 'Waits on something other than you, such as a build or a review',
  },
  { mark: HELD_MARK.mark, tone: HELD_MARK.tone, isRunning: false, words: 'Waits on you' },
  { mark: SUBJECT_MARKS.done.mark, tone: 'done', isRunning: false, words: 'Done, or handed to the agent' },
  { mark: SUBJECT_MARKS.dropped.mark, tone: null, isRunning: false, words: 'Dropped before it was done' },
  { mark: CLOSED_MARKS.dismissed, tone: null, isRunning: false, words: 'Dismissed by you' },
  {
    mark: FINDING_GROUPS.issue.mark,
    tone: FINDING_GROUPS.issue.tone,
    isRunning: false,
    words: 'Something is wrong: an issue or a failing check',
  },
  {
    mark: FINDING_GROUPS.opportunity.mark,
    tone: FINDING_GROUPS.opportunity.tone,
    isRunning: false,
    words: 'Opportunity: something that could be better',
  },
]

export const HELP_COPY = { open: 'Help', close: '✕ Close help', keys: 'Keys', marks: 'Marks' } as const

export type HelpKey = { keys: string; does: string }

/** The PRs tab's own keys, which `hooks/pr-order.ts:prOrderActions` and `hooks/pr-tab.ts:prTabActions` bind from any row of the tab. */
const PR_TAB_HELP_KEYS: HelpKey[] = [
  { keys: 'g', does: 'Rank the PRs again, once a ranked PR changed' },
  { keys: 'm', does: 'Dismiss the merged PRs' },
]

/**
 * The keys a look's Help lists, for the tab Help opened over. `hasStatusButtons` says the Status has a row with a
 * button, which the terminal and omp select with j and k. Desktop takes no keys, so its Help lists marks only. Each
 * look binds these keys in its own adapter.
 */
export function helpKeys(look: Look, isNextBuild: boolean, tab: ShownTab, hasStatusButtons: boolean): HelpKey[] {
  const tabKeys = shownTabs(isNextBuild)
    .map(t => t.hotkey)
    .join(' ')
  const hasRows = isRowTab(tab)
  const selectsStatusRows = tab === 'overview' && hasStatusButtons
  const switchTabs = { keys: tabKeys, does: 'Switch tabs' }
  const prTabKeys = tab === 'prs' ? PR_TAB_HELP_KEYS : []
  switch (look) {
    case 'desktop':
      return []
    case 'terminal':
      return [
        switchTabs,
        ...(hasRows || selectsStatusRows ? [{ keys: 'j k', does: 'Select the next or previous row' }] : []),
        ...prTabKeys,
        { keys: 'ctrl+x tab', does: 'Move focus to the line above the prompt, then the pane, then the prompt' },
      ]
    case 'codex':
      return [
        switchTabs,
        ...(hasRows ? [{ keys: 'j k ↑ ↓', does: 'Select the next or previous row' }] : []),
        ...prTabKeys,
        { keys: '?', does: 'Open or close help' },
        { keys: 'esc', does: 'Close help, or leave a reply field' },
      ]
    case 'omp':
      return [
        { keys: `tab ${tabKeys}`, does: 'Switch tabs' },
        ...(hasRows
          ? [
              { keys: '↑ ↓ j k', does: 'Move between rows' },
              { keys: '← →', does: 'Pick a button' },
              { keys: '↵', does: 'Press the picked button' },
              { keys: 'r', does: 'Reply to the selected row' },
              { keys: 'u', does: 'Undo the last close' },
              ...prTabKeys,
            ]
          : [
              ...(selectsStatusRows
                ? [
                    { keys: 'j k', does: 'Select the next or previous row with a button' },
                    { keys: '↵', does: "Press the selected row's button" },
                  ]
                : []),
              { keys: '↑ ↓', does: 'Scroll the page' },
            ]),
        { keys: '?', does: 'Open or close help' },
        { keys: 'esc', does: 'Close help, then the panel' },
      ]
  }
}
