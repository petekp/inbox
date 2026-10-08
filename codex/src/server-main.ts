// The MCP server's entry point, bundled as dist/server.mjs. One JSON-RPC
// message per line on stdin and stdout.

import { dirname } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

import { makeServer } from './server'
import { dataDir } from './state'
import TAB_HTML from './tab.html'
import { run } from './tree'

/** The codex binary that started this server, which is the desktop app's when the app runs it. */
async function parentCli(): Promise<string> {
  const r = await run(['ps', '-o', 'comm=', '-p', String(process.ppid)], { cwd: '/', timeoutMs: 5000 })
  const path = r.stdout.trim()

  return r.code === 0 && /(^|\/)codex$/.test(path) ? path : 'codex'
}

const handle = makeServer({
  dir: dataDir(process.env, dirname(dirname(fileURLToPath(import.meta.url)))),
  now: Date.now,
  exec: run,
  tabHtml: TAB_HTML,
  fallbackCli: parentCli,
})

createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', line => {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  void handle(message).then(reply => {
    if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`)
  })
})
