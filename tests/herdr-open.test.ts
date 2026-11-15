import { describe, expect, test } from 'claude-code/testing'
import { TIMED_OUT_CODE, UNSTARTABLE_CODE } from '../hooks/gh'
import type { Run } from '../hooks/gh'
import { herdrTarget } from '../hooks/herdr'
import { herdrPanelOpener } from '../hooks/herdr-open'

const TARGET = herdrTarget({ HC_TERMINAL_ID: 't1', HERDR_APP_HOME: '/app', HOME: '/home/person' }) as Extract<
  ReturnType<typeof herdrTarget>,
  { kind: 'terminal' }
>
const LOCAL = '/home/person/.local/bin/herdr-app'

const LS = JSON.stringify({
  spaces: [
    { machine: 'mini', tabs: [{ terminals: [{ terminal: 't1', pane: 'p-remote' }] }] },
    {
      machine: null,
      tabs: [{ terminals: [{ terminal: 't2', pane: 'p2' }] }, { terminals: [{ terminal: 't1', pane: 'p1' }] }],
    },
  ],
})

type Answer = { code: number; stdout?: string; stderr?: string }

function herdrApp(answers: Record<string, Answer>) {
  const ran: string[][] = []
  const run: Run = async argv => {
    ran.push(argv)
    const answer = answers[argv.slice(0, 3).join(' ')] ?? answers[argv.slice(0, 2).join(' ')] ?? { code: 0 }

    return { code: answer.code, stdout: answer.stdout ?? '', stderr: answer.stderr ?? '' }
  }

  return { run, ran, answers, isFile: async (path: string) => path === '/app/mods/inbox/main.js' }
}

describe('herdrPanelOpener', () => {
  test("splits the terminal's own pane to the right with the inbox mod, focuses that panel next, and opens it again once it is closed", async () => {
    const app = herdrApp({
      'herdr-app ls': { code: 0, stdout: LS },
      'herdr-app do pane.split': { code: 0, stdout: '{"pane":"p9","terminal":null}' },
    })
    const open = herdrPanelOpener()

    expect(await open(app, TARGET)).toEqual({
      isShown: true,
      text: 'Opened the inbox in Herdr, to the right of this terminal.',
    })
    expect(app.ran.at(-2)).toEqual(['herdr-app', 'do', 'pane.split', '{"direction":"right","pane":"p1","mod":"inbox"}'])
    expect(app.ran.at(-1)).toEqual(['hc', 'label', 't1', 'inbox.panel=p9'])

    expect(await open(app, TARGET)).toEqual({ isShown: true, text: 'The inbox is already open in Herdr. Focused it.' })
    expect(app.ran.at(-1)).toEqual(['herdr-app', 'do', 'pane.focus', '{"pane":"p9"}'])

    app.answers['herdr-app do pane.focus'] = { code: 1, stdout: '{"error":"no such pane"}' }
    app.answers['herdr-app do pane.split'] = { code: 0, stdout: '{"pane":"p10"}' }
    expect((await open(app, TARGET)).text).toBe('Opened the inbox in Herdr, to the right of this terminal.')
    expect(app.ran.slice(-3).map(argv => argv.slice(1).join(' '))).toEqual([
      'label t1 inbox.panel=',
      'do pane.split {"direction":"right","pane":"p1","mod":"inbox"}',
      'label t1 inbox.panel=p10',
    ])
  })

  test('a fresh opener focuses the panel the terminal label names, and a focus that fails for another reason leaves that panel and splits nothing', async () => {
    const app = herdrApp({
      'herdr-app ls': { code: 0, stdout: LS },
      'hc get t1': { code: 0, stdout: JSON.stringify({ labels: { 'inbox.panel': 'p7', 'herdr.tab': 'tb1' } }) },
    })

    expect(await herdrPanelOpener()(app, TARGET)).toEqual({
      isShown: true,
      text: 'The inbox is already open in Herdr. Focused it.',
    })
    expect(app.ran.at(-1)).toEqual(['herdr-app', 'do', 'pane.focus', '{"pane":"p7"}'])

    app.answers['herdr-app do pane.focus'] = { code: 1, stdout: '{"error":"pane is not focusable"}' }
    expect(await herdrPanelOpener()(app, TARGET)).toEqual({
      isShown: true,
      text: 'The inbox is already open in Herdr, to the right of this terminal.',
    })
    expect(app.ran.some(argv => argv[2] === 'pane.split')).toBe(false)
  })

  test('two opens at once split one panel and both report it', async () => {
    const app = herdrApp({
      'herdr-app ls': { code: 0, stdout: LS },
      'herdr-app do pane.split': { code: 0, stdout: '{"pane":"p9"}' },
    })
    const open = herdrPanelOpener()

    expect((await Promise.all([open(app, TARGET), open(app, TARGET)])).map(o => o.text)).toEqual([
      'Opened the inbox in Herdr, to the right of this terminal.',
      'Opened the inbox in Herdr, to the right of this terminal.',
    ])
    expect(app.ran.filter(argv => argv[2] === 'pane.split')).toHaveLength(1)
  })

  test('a split that names no pane or does not answer may have opened one, and says so in one line', async () => {
    const textOf = async (split: Answer) =>
      (
        await herdrPanelOpener()(
          herdrApp({ 'herdr-app ls': { code: 0, stdout: LS }, 'herdr-app do pane.split': split }),
          TARGET,
        )
      ).text

    expect(await textOf({ code: 0, stdout: '{}' })).toBe(
      "Opened the inbox here. Herdr's split may also have opened it to the right of this terminal, but it named no new pane.",
    )
    expect(await textOf({ code: TIMED_OUT_CODE })).toBe(
      "Opened the inbox here. Herdr's split may also have opened it to the right of this terminal, but it did not answer within 5 s.",
    )
    expect(await textOf({ code: 2, stderr: 'error: bad argument\n  at line 1\n  at line 2' })).toBe(
      'Opened the inbox here, since Herdr did not split the pane: error: bad argument.',
    )
  })

  test('each reason the panel cannot open is named, and herdr-app on PATH gives way to the one in ~/.local/bin', async () => {
    const textOf = async (app: ReturnType<typeof herdrApp>, target = TARGET) => {
      const opened = await herdrPanelOpener()(app, target)
      return opened.isShown ? 'shown' : opened.text
    }

    expect(await textOf(herdrApp({}), { ...TARGET, appHome: '/elsewhere' })).toBe(
      'Opened the inbox here, since the Herdr app has no inbox mod in /elsewhere/mods.',
    )
    expect(
      await textOf(
        herdrApp({ 'herdr-app ls': { code: UNSTARTABLE_CODE }, [`${LOCAL} ls`]: { code: UNSTARTABLE_CODE } }),
      ),
    ).toBe(`Opened the inbox here, since no herdr-app started. Tried herdr-app, then ${LOCAL}.`)
    const local = herdrApp({
      'herdr-app ls': { code: UNSTARTABLE_CODE },
      [`${LOCAL} ls`]: { code: 0, stdout: LS },
      [`${LOCAL} do pane.split`]: { code: 0, stdout: '{"pane":"p9"}' },
    })
    expect(await textOf(local)).toBe('shown')
    expect(local.ran.find(argv => argv[2] === 'pane.split')?.[0]).toBe(LOCAL)
    expect(await textOf(herdrApp({ 'herdr-app ls': { code: 0, stdout: LS } }), { ...TARGET, terminal: 't3' })).toBe(
      'Opened the inbox here, since herdr-app ls lists no pane for terminal t3.',
    )
    expect(
      await textOf(
        herdrApp({
          'herdr-app ls': { code: 0, stdout: LS },
          'herdr-app do pane.split': { code: 1, stdout: '{"error":"unknown mod inbox"}' },
        }),
      ),
    ).toBe('Opened the inbox here, since Herdr did not split the pane: unknown mod inbox.')
  })
})
