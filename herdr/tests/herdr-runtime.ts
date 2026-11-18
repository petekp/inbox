import { readFileSync } from 'node:fs'
import vm from 'node:vm'

export const HERDR_GLOBALS = [
  'AggregateError',
  'Array',
  'ArrayBuffer',
  'AsyncDisposableStack',
  'Atomics',
  'BigInt',
  'BigInt64Array',
  'BigUint64Array',
  'Blob',
  'Boolean',
  'Buffer',
  'Crypto',
  'CryptoKey',
  'DOMException',
  'DataView',
  'Date',
  'DisposableStack',
  'Error',
  'EvalError',
  'File',
  'FinalizationRegistry',
  'Float16Array',
  'Float32Array',
  'Float64Array',
  'Function',
  'Infinity',
  'Int16Array',
  'Int32Array',
  'Int8Array',
  'InternalError',
  'Iterator',
  'JSON',
  'Map',
  'Math',
  'NaN',
  'Number',
  'Object',
  'Promise',
  'Proxy',
  'RangeError',
  'ReferenceError',
  'Reflect',
  'RegExp',
  'Set',
  'SharedArrayBuffer',
  'String',
  'SubtleCrypto',
  'SuppressedError',
  'Symbol',
  'SyntaxError',
  'TypeError',
  'URIError',
  'URL',
  'URLSearchParams',
  'Uint16Array',
  'Uint32Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'WeakMap',
  'WeakRef',
  'WeakSet',
  'atob',
  'btoa',
  'clearInterval',
  'clearTimeout',
  'console',
  'crypto',
  'decodeURI',
  'decodeURIComponent',
  'encodeURI',
  'encodeURIComponent',
  'escape',
  'fetch',
  'globalThis',
  'isFinite',
  'isNaN',
  'localStorage',
  'parseFloat',
  'parseInt',
  'performance',
  'process',
  'queueMicrotask',
  'require',
  'sessionStorage',
  'setInterval',
  'setTimeout',
  'undefined',
  'unescape',
  'window',
]

const notInShell = (name: string, instead: string) => () => {
  throw new TypeError(`\`${name}\` is not available in the shell: ${instead}`)
}

function storage() {
  const values = new Map<string, string>()

  return {
    get length() {
      return values.size
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, String(value)),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
  }
}

function hostGlobals(window: object): Record<string, unknown> {
  const localStorage = storage()
  const sessionStorage = storage()

  return {
    Blob,
    Buffer,
    Crypto,
    CryptoKey,
    DOMException,
    File,
    InternalError: class InternalError extends Error {},
    SubtleCrypto,
    URL,
    URLSearchParams,
    atob,
    btoa,
    clearInterval: notInShell('clearInterval', 'cancel the handle returned by cx.timer.every'),
    clearTimeout: notInShell('clearTimeout', 'cancel the handle returned by cx.timer.after'),
    console,
    crypto,
    fetch: () => Promise.reject(new TypeError('The load spec has no network')),
    localStorage,
    performance: { now: () => performance.now(), timeOrigin: performance.timeOrigin },
    process: {
      run: () => Promise.reject(new TypeError('The load spec runs no programs')),
      nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => queueMicrotask(() => callback(...args)),
      exit: notInShell('process.exit', 'the load spec cannot exit'),
      platform: process.platform,
      arch: process.arch,
    },
    queueMicrotask,
    require: notInShell('require', 'this runtime uses ES modules; use `import`'),
    sessionStorage,
    setInterval: notInShell('setInterval', 'use cx.timer.every(ms, callback)'),
    setTimeout: notInShell('setTimeout', 'use cx.timer.after(ms, callback)'),
    window: { ...window, localStorage, sessionStorage },
  }
}

export function herdrContext(window: object): vm.Context {
  const context = vm.createContext({})
  const builtIn = vm.runInContext('Object.getOwnPropertyNames(globalThis)', context) as string[]
  for (const name of builtIn)
    if (!HERDR_GLOBALS.includes(name)) vm.runInContext(`delete globalThis[${JSON.stringify(name)}]`, context)
  const host = hostGlobals(window)
  for (const name of HERDR_GLOBALS) {
    if (builtIn.includes(name)) continue
    if (!(name in host)) throw new Error(`The load spec has no stand-in for Herdr's global ${name}`)
    context[name] = host[name]
  }

  return context
}

export const globalsOf = (context: vm.Context) =>
  (vm.runInContext('Object.getOwnPropertyNames(globalThis)', context) as string[]).toSorted()

export async function loadBuiltMod(path: string, context: vm.Context, appModules: Record<string, object>) {
  const modules = new Map<string, vm.Module>()
  for (const [name, exports] of Object.entries(appModules)) {
    const names = Object.keys(exports)
    const values = exports as Record<string, unknown>
    modules.set(
      name,
      new vm.SyntheticModule(
        names,
        function (this: vm.SyntheticModule) {
          for (const n of names) this.setExport(n, values[n])
        },
        { context, identifier: name },
      ),
    )
  }
  const mod = new vm.SourceTextModule(readFileSync(path, 'utf8'), { context, identifier: path })
  await mod.link(specifier => {
    const found = modules.get(specifier)
    if (found === undefined) throw new Error(`Herdr's mod runtime has no module ${specifier}`)
    return found
  })
  await mod.evaluate()

  return (mod.namespace as { default: unknown }).default
}
