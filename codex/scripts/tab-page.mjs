import http from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const HOST_COLORS = {
  light: {
    '--color-background-primary': 'rgb(255 255 255)',
    '--color-text-primary': 'rgb(26 28 31)',
    '--color-text-secondary': 'rgb(26 28 31 / 49.4%)',
  },
  dark: {
    '--color-background-primary': 'rgb(24 24 24)',
    '--color-text-primary': 'rgb(255 255 255)',
    '--color-text-secondary': 'rgb(255 255 255 / 65%)',
  },
}

const [handlerPath, dataDir, port] = process.argv.slice(2)
const { createHandler } = await import(pathToFileURL(resolve(handlerPath)).href)
const handle = createHandler(dataDir)
let nextId = 1

const hostPage = `<!doctype html><html><head><style>
html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}
</style></head><body><iframe id="tab" src="/tab"></iframe><script>
const params = new URLSearchParams(location.search)
const theme = params.get('theme') === 'dark' ? 'dark' : 'light'
const variables = params.get('colors') === 'fallback' ? {} : ${JSON.stringify(HOST_COLORS)}[theme]
const thread = params.get('thread') || 'demo-1'
const frame = document.getElementById('tab')
addEventListener('message', async e => {
  const m = e.data
  if (!m || typeof m !== 'object' || !m.method || m.id == null) return
  const reply = result => frame.contentWindow.postMessage({ jsonrpc: '2.0', id: m.id, result }, '*')
  if (m.method === 'ui/initialize') return reply({ hostContext: { theme, styles: { variables } } })
  if (m.method === 'tools/call') {
    const r = await fetch('/rpc?thread=' + thread, { method: 'POST', body: JSON.stringify(m.params), cache: 'no-store' })
    return reply(await r.json())
  }
  reply({})
})
</script></body></html>`

const send = (res, type, body) => {
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(body)
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    if (url.pathname === '/') return send(res, 'text/html', hostPage)
    if (url.pathname === '/tab') {
      const r = await handle({
        jsonrpc: '2.0',
        id: nextId++,
        method: 'resources/read',
        params: { uri: 'ui://inbox/tab' },
      })
      return send(res, 'text/html', r.result.contents[0].text)
    }
    if (url.pathname === '/rpc') {
      let body = ''
      for await (const chunk of req) body += chunk
      const params = JSON.parse(body)
      if (params.name === 'inbox_view' || params.name === 'inbox_press')
        params.arguments = { ...(params.arguments ?? {}), demo: true }
      params._meta = { thread_id: url.searchParams.get('thread') }
      const r = await handle({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params })
      return send(res, 'application/json', JSON.stringify(r?.result ?? r?.error ?? null))
    }
    res.writeHead(404)
    res.end()
  })
  .listen(Number(port), '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/?theme=light`))
