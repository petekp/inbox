import { spawn } from 'node:child_process'

/** Why Codex does not run the inbox's hooks: it never trusted them, or it trusted them before an update changed the plugin. */
export type HooksTrust = 'untrusted' | 'modified'

type ListedHook = { pluginId?: string | null; trustStatus?: string }

/**
 * What the inbox's hooks need, from the hooks Codex lists. Null when none of them is the inbox's. `modified` wins over
 * `untrusted`, since an update is the likelier cause and its text says what to do.
 */
export function trustOfHooks(hooks: ListedHook[]): HooksTrust | 'trusted' | null {
  const own = hooks.filter(h => h.pluginId?.split('@')[0] === 'inbox')
  if (own.length === 0) return null
  if (own.some(h => h.trustStatus === 'modified')) return 'modified'
  if (own.some(h => h.trustStatus === 'untrusted')) return 'untrusted'

  return 'trusted'
}

/**
 * Asks a short-lived `codex app-server` for the hooks Codex lists for `cwd`, over stdio. `hooks/list` is a stable
 * app-server method. Null when the call cannot be made or answered in time.
 */
export function listHooksTrust(cli: string, cwd: string, timeoutMs = 10_000): Promise<HooksTrust | 'trusted' | null> {
  return new Promise(resolve => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(cli, ['app-server'], { cwd, stdio: ['pipe', 'pipe', 'ignore'] })
    } catch {
      resolve(null)
      return
    }
    let buffer = ''
    let isDone = false
    const finish = (result: HooksTrust | 'trusted' | null) => {
      if (isDone) return
      isDone = true
      clearTimeout(timer)
      child.kill()
      resolve(result)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    child.on('error', () => finish(null))
    child.on('exit', () => finish(null))
    child.stdout?.on('data', chunk => {
      buffer += String(chunk)
      for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
        const line = buffer.slice(0, end)
        buffer = buffer.slice(end + 1)
        let message: { id?: number; result?: { data?: { hooks?: ListedHook[] }[] } }
        try {
          message = JSON.parse(line)
        } catch {
          continue
        }
        if (message.id === 1) {
          child.stdin?.write(`${JSON.stringify({ method: 'initialized' })}\n`)
          child.stdin?.write(`${JSON.stringify({ id: 2, method: 'hooks/list', params: { cwds: [cwd] } })}\n`)
        } else if (message.id === 2) {
          finish(trustOfHooks(message.result?.data?.flatMap(d => d.hooks ?? []) ?? []))
        }
      }
    })
    child.stdin?.on('error', () => finish(null))
    child.stdin?.write(
      `${JSON.stringify({ id: 1, method: 'initialize', params: { clientInfo: { name: 'inbox', version: '0' } } })}\n`,
    )
  })
}
