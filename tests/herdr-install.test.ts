import { describe, expect, test } from 'claude-code/testing'
import type { Run } from '../hooks/gh'
import { herdrTarget } from '../hooks/herdr'
import { answerHerdrMod, builtAtLine, keepHerdrModCurrent } from '../hooks/herdr-install'
import type { ModFiles } from '../hooks/herdr-install'
import { startInHerdrApp } from '../hooks/herdr-start'
import { labelledSessions, sweepModTemporaries, sweepPublished, SWEEP_AFTER_MS } from '../hooks/herdr-sweep'
import type { SweepFiles } from '../hooks/herdr-sweep'

const BANNER = '// Built by herdr/build.ts with Bun 1.4.4 from herdr/src and hooks/. Do not edit.'
const build = (builtAt: string | null, code = 'draw()') =>
  [BANNER, ...(builtAt ? [builtAtLine(builtAt, code.length)] : []), code].join('\n')
const OLD = '2026-11-01T00:00:00.000Z'
const NEW = '2026-11-10T00:00:00.000Z'
const MOD_JSON = '{"place":"none"}\n'

function disk(initial: Record<string, string> = {}, links: string[] = []) {
  const files = new Map(Object.entries(initial))
  const folders = new Set<string>()
  const moves: string[] = []
  let failMove: { name: string; before?: () => void } | null = null
  const under = (folder: string) => [...files.keys()].filter(p => p.startsWith(`${folder}/`))
  const kind: ModFiles['kind'] = async path => {
    if (links.includes(path)) return 'link'
    if (files.has(path)) return 'file'
    return folders.has(path) || under(path).length > 0 ? 'folder' : null
  }
  const calls: ModFiles & SweepFiles = {
    kind,
    read: async path => {
      const text = files.get(path)
      if (text === undefined) throw new Error(`ENOENT ${path}`)
      return text
    },
    write: async (path, text) => void files.set(path, text),
    makeFolder: async path => void folders.add(path),
    move: async (from, to) => {
      if (failMove && to.endsWith(failMove.name)) {
        failMove.before?.()
        throw new Error(failMove.before ? 'ENOTEMPTY' : 'EACCES')
      }
      moves.push(to)
      if (files.has(from)) {
        files.set(to, files.get(from)!)
        files.delete(from)
        return
      }
      const inside = under(from)
      if (inside.length === 0) throw new Error(`ENOENT ${from}`)
      const into = (await kind(to)) === 'folder' ? `${to}/${from.split('/').pop()}` : to
      for (const p of inside) {
        files.set(`${into}${p.slice(from.length)}`, files.get(p)!)
        files.delete(p)
      }
    },
    remove: async path => void files.delete(path),
    removeFolder: async path => {
      for (const p of under(path)) files.delete(p)
      folders.delete(path)
    },
    list: async folder => [...new Set(under(folder).map(p => p.slice(folder.length + 1).split('/')[0]!))],
  }

  return { calls, files, moves, failMoveTo: (name: string, before?: () => void) => void (failMove = { name, before }) }
}

const BUNDLED = { '/plugin/mod/main.js': build(NEW), '/plugin/mod/mod.json': MOD_JSON }
const answer = (text: string) => JSON.stringify({ format: 1, answer: text, at: 1 })

describe('keepHerdrModCurrent', () => {
  test('asks before the first install, and writes nothing into the Herdr app', async () => {
    const d = disk(BUNDLED)

    expect(await keepHerdrModCurrent(d.calls, '/app', '/plugin/mod', 5)).toEqual({ is: 'ask' })
    expect([...d.files.keys()].filter(p => p.startsWith('/app'))).toEqual([])
  })

  test('installs the bundled mod after a yes, and does not put it back once the person removes it', async () => {
    const d = disk(BUNDLED)

    expect(await answerHerdrMod(d.calls, '/app', '/plugin/mod', true, 5)).toEqual({ is: 'installed' })
    expect(d.files.get('/app/mods/inbox/main.js')).toBe(build(NEW))
    expect(d.files.get('/app/mods/inbox/mod.json')).toBe(MOD_JSON)
    expect([...d.files.keys()].filter(p => p.endsWith('.tmp') || p.includes('.tmp/'))).toEqual([])

    await d.calls.removeFolder('/app/mods/inbox')
    expect(await keepHerdrModCurrent(d.calls, '/app', '/plugin/mod', 9)).toEqual({ is: 'current' })
    expect(d.files.has('/app/mods/inbox/main.js')).toBe(false)
  })

  test('remembers a no, so no host asks again on its own', async () => {
    const d = disk(BUNDLED)

    expect(await answerHerdrMod(d.calls, '/app', '/plugin/mod', false, 5)).toEqual({ is: 'current' })
    expect(await keepHerdrModCurrent(d.calls, '/app', '/plugin/mod', 9)).toEqual({ is: 'current' })
    expect(d.files.has('/app/mods/inbox/main.js')).toBe(false)
  })

  test('leaves a linked mods/inbox, and a mod that is not the inbox build, as they are', async () => {
    const linked = disk({ ...BUNDLED, '/app/mods/inbox/main.js': build(OLD) }, ['/app/mods/inbox'])
    const other = disk({ ...BUNDLED, '/app/mods/inbox/main.js': 'export default 1' })

    expect(await keepHerdrModCurrent(linked.calls, '/app', '/plugin/mod', 5)).toEqual({ is: 'current' })
    expect(await keepHerdrModCurrent(other.calls, '/app', '/plugin/mod', 5)).toEqual({ is: 'current' })
    expect(linked.files.get('/app/mods/inbox/main.js')).toBe(build(OLD))
    expect(other.files.get('/app/mods/inbox/main.js')).toBe('export default 1')
  })

  test('replaces an older inbox build, one that names no build time, or one cut off, without asking', async () => {
    for (const installed of [build(OLD, 'old()'), build(null, 'old()'), build(NEW, 'old()').slice(0, -1)]) {
      const d = disk({ ...BUNDLED, '/app/mods/inbox/main.js': installed, '/app/mods/inbox/mod.json': MOD_JSON })

      expect(await keepHerdrModCurrent(d.calls, '/app', '/plugin/mod', 5)).toEqual({ is: 'updated' })
      expect(d.files.get('/app/mods/inbox/main.js')).toBe(build(NEW))
      expect(d.moves).toEqual(['/app/mods/inbox/main.js'])
    }
  })

  test('keeps an installed build as new as its own', async () => {
    const newer = '2026-11-20T00:00:00.000Z'
    for (const at of [NEW, newer]) {
      const d = disk({
        ...BUNDLED,
        '/app/mods/inbox/main.js': build(at, 'kept()'),
        '/app/mods/inbox/mod.json': MOD_JSON,
      })

      expect(await keepHerdrModCurrent(d.calls, '/app', '/plugin/mod', 5)).toEqual({ is: 'current' })
      expect(d.files.get('/app/mods/inbox/main.js')).toBe(build(at, 'kept()'))
    }
  })

  test('says why an update failed, and leaves the old mod whole', async () => {
    const d = disk({ ...BUNDLED, '/app/mods/inbox/main.js': build(OLD, 'old()'), '/app/mods/inbox/mod.json': MOD_JSON })
    d.failMoveTo('main.js')

    expect(await keepHerdrModCurrent(d.calls, '/app', '/plugin/mod', 5)).toEqual({
      is: 'failed',
      text: 'Could not update the inbox mod in Herdr. EACCES',
    })
    expect(d.files.get('/app/mods/inbox/main.js')).toBe(build(OLD, 'old()'))
    expect([...d.files.keys()].filter(p => p.endsWith('.tmp') || p.includes('.tmp/'))).toEqual([])
  })

  test('installs after a yes another host saved, and leaves no folder inside a mod another host installed first', async () => {
    const d = disk({ ...BUNDLED, '/app/inbox/herdr-mod.json': answer('yes') })

    expect(await keepHerdrModCurrent(d.calls, '/app', '/plugin/mod', 5)).toEqual({ is: 'installed' })
    expect(JSON.parse(d.files.get('/app/inbox/herdr-mod.json')!).answer).toBe('installed')
    expect([...d.files.keys()].filter(p => p.startsWith('/app/mods/inbox/')).sort()).toEqual([
      '/app/mods/inbox/main.js',
      '/app/mods/inbox/mod.json',
    ])
  })

  test('reports installed when another host installs between the check and the move, and the move then fails', async () => {
    const d = disk({ ...BUNDLED, '/app/inbox/herdr-mod.json': answer('yes') })
    d.failMoveTo('/app/mods/inbox', () => d.files.set('/app/mods/inbox/main.js', build(NEW)))

    expect(await keepHerdrModCurrent(d.calls, '/app', '/plugin/mod', 5)).toEqual({ is: 'installed' })
    expect([...d.files.keys()].filter(p => p.endsWith('.tmp') || p.includes('.tmp/'))).toEqual([])
  })
})

const envelope = (sessionId: string, writtenAt: number, format = 1, terminal = 't9') =>
  JSON.stringify({ format, host: 'codex', agent: 'Codex', sessionId, terminal, writtenAt, session: {} })

describe('sweepPublished', () => {
  const now = 10 * SWEEP_AFTER_MS
  const old = now - SWEEP_AFTER_MS - 1

  test('removes a session no terminal names and written over a day ago, with its presses, and keeps the rest, with those its own terminal published', async () => {
    const d = disk({
      '/app/inbox/sessions/gone.json': envelope('gone', old),
      '/app/inbox/presses/gone/p1.json': '{}',
      '/app/inbox/sessions/shown.json': envelope('shown', old),
      '/app/inbox/sessions/young.json': envelope('young', now - 1000),
      '/app/inbox/sessions/newer.json': envelope('newer', old, 2),
      '/app/inbox/sessions/renamed.json': envelope('other', old),
      '/app/inbox/sessions/broken.json': '{"format":1,',
      '/app/inbox/sessions/gone.json.5-ab.tmp': envelope('gone', old),
      '/app/inbox/sessions/here.json': envelope('here', old, 1, 't1'),
    })

    expect(await sweepPublished(d.calls, '/app', new Set(['shown']), 't1', now)).toEqual(['gone'])
    expect([...d.files.keys()].sort()).toEqual([
      '/app/inbox/sessions/broken.json',
      '/app/inbox/sessions/gone.json.5-ab.tmp',
      '/app/inbox/sessions/here.json',
      '/app/inbox/sessions/newer.json',
      '/app/inbox/sessions/renamed.json',
      '/app/inbox/sessions/shown.json',
      '/app/inbox/sessions/young.json',
    ])
  })
  test('removes only session files, press folders and old mod temporaries inside the inbox folder, whatever the names hold', async () => {
    const fresh = `herdr-mod.${now - 1000}-cd.tmp`
    const names = [
      ...['../../../etc.json', '..json', '.json', 'a/../../b.json', '/etc.json', 'x\n.json', '..', '.', '', 'ok.json'],
      ...['../herdr-mod.1-ab.tmp', 'herdr-mod.1-ab.tmp/../..', ' herdr-mod.1-ab.tmp', 'herdr-mod.1-ab.tmp\0'],
      ...['herdr-mod.1-ab.tmp', 'herdr-mod.json.1-ab.tmp', fresh],
    ]
    const removed: string[] = []
    const files: SweepFiles = {
      list: async () => names,
      read: async path =>
        envelope(
          path
            .split('/')
            .pop()!
            .replace(/\.json$/, ''),
          0,
        ),
      remove: async path => void removed.push(path),
      removeFolder: async path => void removed.push(path),
    }

    await sweepPublished(files, '/app', new Set(), 't1', now)
    await sweepModTemporaries(files, '/app', now)

    expect(removed.sort()).toEqual([
      '/app/inbox/herdr-mod.1-ab.tmp',
      '/app/inbox/herdr-mod.json.1-ab.tmp',
      '/app/inbox/presses/ok',
      '/app/inbox/sessions/ok.json',
    ])
  })
})

describe('labelledSessions', () => {
  const listed = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: {
      terminals: [
        { address: 't1', labels: { 'inbox.session': 's1', 'inbox.status': 'x' } },
        { address: 't2', labels: { 'inbox.session': '' } },
        { address: 't3', labels: {} },
        { address: 'mini/t1', labels: { 'inbox.session': 's9' } },
      ],
    },
  })

  test('reads the session labels of every terminal from one terminal.list call, trying each hc in turn', async () => {
    const ran: string[] = []
    const run: Run = async argv => {
      ran.push(argv[3]!)
      return argv[3] === 'hc'
        ? { code: 127, stdout: '', stderr: 'hc: not found' }
        : { code: 0, stdout: `${listed}\n`, stderr: '' }
    }

    expect(await labelledSessions(run, ['hc', '/home/person/.local/bin/hc'])).toEqual(new Set(['s1', 's9']))
    expect(ran).toEqual(['hc', '/home/person/.local/bin/hc'])
  })

  test('answers null when no hc lists the terminals, and a start then leaves every session file in place', async () => {
    const run: Run = async () => ({ code: 0, stdout: '{"jsonrpc":"2.0","id":1,"error":{"message":"x"}}', stderr: '' })
    const d = disk({ ...BUNDLED, '/app/inbox/sessions/gone.json': envelope('gone', 0) })
    const logged: string[] = []
    const target = herdrTarget({ HC_TERMINAL_ID: 't1', HERDR_APP_HOME: '/app' }) as Extract<
      ReturnType<typeof herdrTarget>,
      { kind: 'terminal' }
    >

    expect(await labelledSessions(run, ['hc'])).toBe(null)
    expect(
      await startInHerdrApp(run, d.calls, target, '/plugin/mod', 10 * SWEEP_AFTER_MS, t => logged.push(t)),
    ).toEqual({ is: 'ask' })
    expect(d.files.has('/app/inbox/sessions/gone.json')).toBe(true)
    expect(logged).toEqual(["Left old inbox session files in place: no hc listed Herdr's terminals. Tried hc."])
  })
})
