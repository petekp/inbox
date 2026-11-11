import { describe, expect, test } from 'claude-code/testing'
import { UNSTARTABLE_CODE } from '../hooks/gh'
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

type Answer = { code: number; stdout?: string }

function herdrApp(answers: Record<string, Answer>) {
  const ran: string[][] = []
  const run: Run = async argv => {
    ran.push(argv)
    const answer = answers[argv.slice(0, 3).join(' ')] ?? answers[argv.slice(0, 2).join(' ')] ?? { code: 0 }

    return { code: answer.code, stdout: answer.stdout ?? '', stderr: '' }
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
    expect(app.ran.at(-1)).toEqual(['herdr-app', 'do', 'pane.split', '{"direction":"right","pane":"p1","mod":"inbox"}'])

    expect(await open(app, TARGET)).toEqual({ isShown: true, text: 'The inbox is already open in Herdr. Focused it.' })
    expect(app.ran.at(-1)).toEqual(['herdr-app', 'do', 'pane.focus', '{"pane":"p9"}'])

    app.answers['herdr-app do pane.focus'] = { code: 1, stdout: '{"error":"no pane p9"}' }
    expect((await open(app, TARGET)).text).toBe('Opened the inbox in Herdr, to the right of this terminal.')
    expect(app.ran.at(-1)?.[2]).toBe('pane.split')
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
    expect(local.ran.at(-1)?.[0]).toBe(LOCAL)
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
