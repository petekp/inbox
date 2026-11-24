import { expect, mock } from 'claude-code/testing'
import type { Mounted } from 'claude-code/testing'
import type { TabsProps } from '../hooks/pane/tabs-client'
import { test } from '../tests/test-with-timeout'
import { w, world } from '../tests/hooks-world'
import { PANE } from '../tests/hooks-helpers'
import type { ModCase } from './mod-case'

type ModFailure = { rule: string; detail: string }

const START = Date.UTC(2026, 10, 10, 12)
const BAD_TEXT = /NaN|undefined|\[object Object\]/
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/
const TITLE_START = 8
const ALL_ROWS = 2000
const ESCAPE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)?/g
const wordsOf = (s: string) => s.replace(ESCAPE, '').replace(/[^\p{L}\p{N}]/gu, '')

const titleOf = (args: Record<string, unknown>) =>
  wordsOf(String(args.ask ?? args.title ?? '').split('\n')[0] ?? '').slice(0, TITLE_START)

const tabOf = (args: Record<string, unknown>) => (args.kind === 'finding' ? 'findings' : 'needsYou')

type Pane = Pick<Mounted<'desktop', 'Pane'>, 'find' | 'findAll' | 'press' | 'pointer'>

declare const console: { log(...args: unknown[]): void }

const stringsOf = (v: unknown): string[] =>
  typeof v === 'string'
    ? [v]
    : Array.isArray(v)
      ? v.flatMap(stringsOf)
      : v !== null && typeof v === 'object'
        ? Object.values(v).flatMap(stringsOf)
        : []

async function drawnTexts(pane: Pane): Promise<string[]> {
  const nodes = [...(await pane.findAll({ type: 'Text' })), ...(await pane.findAll({ type: 'Button' }))]
  const clients = (await pane.findAll({ type: 'Client' })).flatMap(c => stringsOf(c.props.props))
  return [...nodes.map(n => n.text ?? ''), ...clients]
}

async function showTab(pane: Pane, look: ModCase['look'], tab: string): Promise<void> {
  if (look === 'terminal') {
    if (await pane.find({ key: `tab-${tab}` })) await pane.press({ key: `tab-${tab}` })
    return
  }
  const bar = (await pane.find({ key: 'tabs' }))?.props.props as TabsProps | undefined
  if (!bar) return
  const at = bar.tabs.findIndex(t => t.id === tab)
  const x = bar.tabs.slice(0, Math.max(0, at)).reduce((sum, t) => sum + t.width + bar.gap, 0)
  await pane.pointer({ type: 'down', x, y: 1, button: 'left', in: 'tabs' })
}

/** Registers one test per case. Each logs `FUZZ <name> <failures as JSON>` for the runner, then fails if a rule broke. */
export function fuzzMod(cases: { name: string; c: ModCase }[]): void {
  for (const { name, c } of cases)
    test(name, async ($, on) => {
      const clock = mock.clock(on, { now: START })
      world($, on, [])
      await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
      const accepted: Record<string, unknown>[] = []
      for (const args of c.records) {
        const { result } = await $.tool.call({ tool: 'mcp__inbox__record', ...args } as never)
        if (String(result).startsWith('Recorded')) accepted.push(args)
        await clock.settle()
      }
      w.paneState = { isShown: true, isFocused: true }
      const props = { ...PANE.props, bodyColumns: c.columns, scroll: { offset: 0, bodyRows: ALL_ROWS } }
      const pane: Pane =
        c.look === 'terminal'
          ? ((await $.ui.mount({ ...PANE, props })) as unknown as Pane)
          : await $.ui.mount({ ...PANE, surface: 'desktop', props })
      await clock.settle()
      const failures: ModFailure[] = []
      for (const tab of ['needsYou', 'findings']) {
        await showTab(pane, c.look, tab)
        await clock.settle()
        const texts = await drawnTexts(pane)
        const isDrawn =
          c.look === 'terminal'
            ? (await pane.findAll({ type: 'Box' })).some(b => (b.key ?? '').startsWith('tab-block-'))
            : (await pane.find({ key: 'tabs' })) !== undefined
        const shown = texts.join(' | ')
        if (!isDrawn)
          failures.push({
            rule: 'drawn',
            detail:
              shown === ''
                ? `${tab}: the pane drew nothing`
                : `${tab}: the pane drew no tabs, only ${JSON.stringify(shown.slice(0, 160))}`,
          })
        for (const t of texts.filter(t => BAD_TEXT.test(t)))
          failures.push({ rule: 'bad-text', detail: `${tab} draws ${JSON.stringify(t.slice(0, 80))}` })
        for (const t of texts.filter(t => CONTROL.test(t)))
          failures.push({
            rule: 'raw-escape',
            detail: `${tab} draws a control character in ${JSON.stringify(t.slice(0, 80))}`,
          })
        const missing = accepted
          .filter(a => tabOf(a) === tab)
          .map(titleOf)
          .filter(title => title.length >= 4 && !wordsOf(texts.join('')).includes(title))
        for (const title of isDrawn ? missing : [])
          failures.push({
            rule: 'title',
            detail: `${tab} draws no row titled ${JSON.stringify(title)}; its text is ${JSON.stringify(shown.slice(0, 600))}`,
          })
      }
      console.log(`FUZZ ${name} ${JSON.stringify(failures)}`)
      expect(failures).toEqual([])
    })
}
