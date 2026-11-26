import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { closeSync, openSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Result } from '../app.contract'

export async function startFixture(options: { protocol?: '1' | '2' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'inbox-client-fixture-'))
  let child: ReturnType<typeof Bun.spawn> | null = null
  const stop = async () => {
    child?.kill()
    if (child) await child.exited
    await rm(root, { recursive: true, force: true })
  }
  try {
    const reserved = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('') })
    const port = reserved.port
    reserved.stop(true)
    const origin = `http://127.0.0.1:${port}`
    const log = openSync(join(root, 'server.log'), 'w')
    try {
      child = Bun.spawn([process.execPath, resolve(import.meta.dir, '../tools/fixture.ts')], {
        cwd: resolve(import.meta.dir, '../../..'),
        env: {
          PATH: process.env.PATH ?? '/usr/bin:/bin',
          INBOX_FIXTURE_ROOT: root,
          INBOX_EXPERIMENTAL_PROTOCOL: options.protocol ?? '2',
          INBOX_PORT: String(port),
          INBOX_DIST: join(root, 'unused-dist'),
        },
        stdout: log,
        stderr: log,
      })
    } finally {
      closeSync(log)
    }
    let session = ''
    for (let attempt = 0; attempt < 200; attempt++) {
      const response = await fetch(origin + '/api/sessions').catch(() => null)
      if (response?.ok) {
        const data = (await response.json()) as { defaultId: string }
        if (data.defaultId) {
          session = data.defaultId
          break
        }
      }
      if (child.exitCode !== null) throw new Error(await readFile(join(root, 'server.log'), 'utf8'))
      await Bun.sleep(25)
    }
    if (!session) throw new Error('The isolated fixture did not start.')
    const view = (await (await fetch(origin + '/api/view?schema=2&session=' + session)).json()) as Result<'loadInbox'>
    return { root, origin, session, view, stop }
  } catch (error) {
    await stop()
    throw error
  }
}
