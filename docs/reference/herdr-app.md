# The Herdr app

Facts about the Herdr app that the inbox relies on, with how each was checked. The Herdr look's plan in [docs/plans/herdr-look.md](../plans/herdr-look.md) holds the facts its spike found.

## `terminal.list` through `hc connect`

Checked live on 2026-11-11 by sending the request `hooks/herdr-sweep.ts:labelledSessions` sends, `{"jsonrpc":"2.0","id":1,"method":"terminal.list","params":{}}` and a newline, to `hc connect` on its standard input.

- `hc connect` answered and exited 0 at the end of its input. It does not stay open.
- The answer is one line: `{"id": …, "jsonrpc": "2.0", "result": {"hidden_finished": …, "terminals": [...]}}`.
- Each entry in `terminals` has a `labels` object, empty when the terminal has no labels. A terminal's id, the value of `HC_TERMINAL_ID` in it, is the entry's `address`, such as `t3`.
- The terminal the request came from was in the list.
- Every entry had `state: "live"`. Finished terminals are left out of the list, and `hidden_finished` counts them.

The sweep relies on the last three facts. It removes nothing unless the list holds its own terminal's `address` and every entry has a `labels` object.

## The globals a mod gets

Herdr's mod runtime is gpui-shell 0.7.1, built into the Herdr app. It runs a mod on QuickJS, through the `rquickjs` crate. The app's binary names its engine files under `vendor/gpui-kit/crates/shell/src/engine/quickjs/`. The source of the app and of gpui-kit is not on this Mac, so this list was not read from source. `~/Code/herdr`, at `70389c38`, is `herdr`, the terminal multiplexer. It holds no gpui-kit or app code.

The list comes from the runtime itself. It was checked on 2026-11-18 with Herdr app 0.1.16, by running `herdr-app check` with a scratch `HERDR_APP_HOME` on a mod whose `main.js` throws `Object.getOwnPropertyNames(globalThis)` in its error. `herdr-app` is a link to the app's binary, `/Applications/Herdr.app/Contents/MacOS/Herdr`, so `herdr-app check` and the window run the same gpui-shell 0.7.1. Whether the window's runtime installs the same globals as `herdr-app check` is unverified.

A mod's global object holds these 89 names. `HERDR_GLOBALS` in `herdr/tests/herdr-runtime.ts` holds the same list.

- The language's own: `AggregateError`, `Array`, `ArrayBuffer`, `AsyncDisposableStack`, `Atomics`, `BigInt`, `BigInt64Array`, `BigUint64Array`, `Boolean`, `DataView`, `Date`, `DisposableStack`, `Error`, `EvalError`, `FinalizationRegistry`, `Float16Array`, `Float32Array`, `Float64Array`, `Function`, `Infinity`, `Int8Array`, `Int16Array`, `Int32Array`, `InternalError`, `Iterator`, `JSON`, `Map`, `Math`, `NaN`, `Number`, `Object`, `Promise`, `Proxy`, `RangeError`, `ReferenceError`, `Reflect`, `RegExp`, `Set`, `SharedArrayBuffer`, `String`, `SuppressedError`, `Symbol`, `SyntaxError`, `TypeError`, `URIError`, `Uint8Array`, `Uint8ClampedArray`, `Uint16Array`, `Uint32Array`, `WeakMap`, `WeakRef`, `WeakSet`, `decodeURI`, `decodeURIComponent`, `encodeURI`, `encodeURIComponent`, `escape`, `globalThis`, `isFinite`, `isNaN`, `parseFloat`, `parseInt`, `undefined` and `unescape`. `InternalError` is QuickJS's own.
- What gpui-shell adds: `Blob`, `Buffer`, `Crypto`, `CryptoKey`, `DOMException`, `File`, `SubtleCrypto`, `URL`, `URLSearchParams`, `atob`, `btoa`, `console`, `crypto`, `fetch`, `localStorage`, `performance`, `process`, `queueMicrotask`, `sessionStorage` and `window`.
- Names that throw a `TypeError` when called: `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval` and `require`. The error says what to use instead, such as "`setTimeout` is not available in the shell: use cx.timer.after(ms, callback)".

The global object also holds 232 names that start with `__`, which gpui-shell's own modules call. A mod has no use for them, and the load spec leaves them out.

A mod has none of the globals Node, Bun or a browser add beyond that list. That includes `Intl`, `eval`, `TextEncoder`, `TextDecoder`, `structuredClone`, `navigator`, `WebAssembly`, `Temporal` and `ShadowRealm`. `window` is an ordinary object, not the global object. Its own keys are the window calls in `gpui-kit.d.ts`, such as `paint_path`, `open_dialog` and `viewport_size`, plus `localStorage` and `sessionStorage`. `process` holds only `run`, `nextTick`, `exit`, `platform` and `arch`. `performance` holds `now` and `timeOrigin`.

The runtime freezes `Object.prototype`, `Array.prototype` and `String.prototype`, so a mod cannot add to them. The global object itself is not frozen. Whether the other built-in prototypes are frozen is unverified.

With no `Intl`, QuickJS formats dates and numbers its own way and ignores the options. `toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })` gives `08:33:05 PM`, with seconds. `(1234.5).toLocaleString()` gives `1234.5`. The load spec runs on Bun's formatting, so it cannot catch a difference in this output.

`herdr/tests/mod-load.spec.ts` loads the built `herdr/mod/inbox/main.js` with only these globals. After a Herdr app update, run the probe again and update `HERDR_GLOBALS` to match.
