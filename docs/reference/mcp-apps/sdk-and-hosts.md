# The SDK, and which hosts support it

Part of [MCP Apps](../mcp-apps.md).

## The SDK

### Package

- `@modelcontextprotocol/ext-apps` 2.0.3 needs Node `>=20` ([SDK] `package.json#L8`, `#L12-L14`).
- Exports: `.` (the view's `App`), `./app-with-deps`, `./react`, `./react-with-deps`, `./app-bridge`, `./server`, `./schema.json` (`#L16-L42`).
- Peer dependencies: `@modelcontextprotocol/client ^2.0.0`, `@modelcontextprotocol/core ^2.0.0`, `zod ^4.2.0`. Optional: `@modelcontextprotocol/server`, `react`, `react-dom` (`#L116-L134`).
- The `*-with-deps` bundles "bundle client, core and zod (about 25% larger than the 1.x bundles)" ([SDK] `docs/migrate-to-2.md#L35`).
- **1.x to 2.x.** "The `ui/*` messages exchanged over the iframe channel are byte-identical to 1.x. A 2.x View runs in a 1.x host and a 2.x host renders 1.x Views." ([SDK] `docs/migrate-to-2.md#L14-L18`). Breaking changes are on the server side: the SDK split, zod 3 dropped, handler context and error types (`#L44-L98`).
- Starter templates: React, Vue, Svelte, Preact, Solid and vanilla JS ([SDK] `README.md#L198-L203`). The Preact starter uses `App` directly ([SDK] `examples/basic-server-preact/src/mcp-app.tsx#L22-L168`).
- "There's no _supported_ host implementation in this repo (beyond the examples/basic-host example)" ([SDK] `README.md#L170-L176`).

### `App` (the view side)

- Constructor: `new App(appInfo, appCapabilities = {}, options = { autoResize: true })` ([SDK] `src/app.ts#L543-L547`). The `autoResize` default exists only when `options` is omitted entirely, and `connect` checks `this.options?.autoResize` (`#L546`, `#L2047`). [inference] `new App(info, caps, { strict: true })` turns auto-resize off.
- `connect()` sends `ui/initialize`, stores the host's reply, sends `initialized`, then starts auto-resize ([SDK] `src/app.ts#L1967-L2055`).
- **Register handlers before `connect()`.** Tool input and result are sent once, shortly after the handshake. A late first handler warns, or throws under `strict` (`#L424-L463`). The skill says "Register ALL handlers BEFORE calling `app.connect()`" ([SDK] `plugins/mcp-apps/skills/create-mcp-app/SKILL.md#L135-L158`).
- **`on*` notification setters are deprecated** in favor of `addEventListener` (`#L848`, `#L900`, `#L941`, `#L980`, `#L1027`). `onteardown`, `oncalltool` and `onlisttools` are request handlers and are not deprecated.
- **Timeout.** Requests use the base SDK's 60 s default (`DEFAULT_REQUEST_TIMEOUT_MSEC = 6e4` in `@modelcontextprotocol/client` 2.0.0 and 2.3.1). Timeouts reject with `SdkError "REQUEST_TIMEOUT"`. `callServerTool` sets `resetTimeoutOnProgress: true` ([SDK] `src/app.ts#L1320-L1325`).
- **The SDK does not check host capabilities before sending.** `Protocol.request` calls `assertCapabilityForMethod` only when `enforceStrictCapabilities === true`, which "Currently ... defaults to `false`" (`@modelcontextprotocol/client@2.3.1` `dist/index-B-4n9P0J.d.mts:1813-1820`). So `sendMessage`, `downloadFile` and `createSamplingMessage` go out and the host decides. The view must check `getHostCapabilities()` itself.
- **Built-ins.** It answers `ping` with `{}` (`#L558-L561`). `allowUnsafeEval` defaults to false and sets zod `jitless`, because "Views typically run under a strict CSP without `unsafe-eval`" (`#L153-L166`).
- Methods: `callServerTool`, `readServerResource`, `listServerResources`, `sendMessage`, `sendLog` ("Logs are not added to the conversation"), `updateModelContext`, `openLink` ("The host may deny this request"), `requestDisplayMode`, `sendSizeChanged`, plus draft-only `downloadFile`, `requestTeardown` and `createSamplingMessage` (`#L1285-L1965`).
- `onteardown`: "The host will wait for the returned promise to resolve before proceeding with teardown" (`#L1044-L1101`, source only).

### `AppBridge` (the host side)

- One bridge per view. It answers `ui/initialize` and `ping`, and its default display-mode handler returns the current mode or `inline` ([SDK] `src/app-bridge.ts#L530-L571`, `#L1623-L1652`).
- `connect(transport)` forwards `tools/call`, `resources/*` and `prompts/list` to the server based on server capabilities. **It does not check tool visibility** (`#L2000-L2075`; `tools/call` at `#L2015-L2021`).
- `sendToolInput` is "sent exactly once and is required before `sendToolResult`" (`#L1724-L1751`). `teardownResource` "MUST send ... SHOULD wait for the response before unmounting" (`#L1879-L1915`).

### Server helpers

- `registerAppTool` requires `_meta`, mirrors `resourceUri` to the legacy flat key, then calls `server.registerTool`. That is all it adds ([SDK] `src/server/index.ts#L170-L310`).
- `registerAppResource` defaults `mimeType` to `RESOURCE_MIME_TYPE` (`#L324-L454`).
- The Claude `domain` example computes `sha256(mcpServerUrl).slice(0,32) + ".claudemcpcontent.com"` (`#L387-L431`).
- [inference] claude.com's claim that these helpers "generate each host's metadata for you" (MA [getting-started](https://claude.com/docs/connectors/building/mcp-apps/getting-started) #register-tools-and-resources-once-for-every-host) is overstated. The code writes no `openai/*` keys and no Claude `domain`.

### Test hosts

- **basic-host** ([SDK] `examples/basic-host/`):
  - A double iframe: host on port 8080, sandbox proxy on 8081, then the inner view iframe (`README.md#L27-L43`). The README says the inner iframe uses `srcdoc`. The code writes the HTML with `document.write` and falls back to `srcdoc` only when the document is not accessible (`src/sandbox.ts#L97-L108`).
  - Inner sandbox `allow-scripts allow-same-origin allow-forms`, with no `allow-downloads` or `allow-popups` (`src/sandbox.ts#L46`).
  - Host capabilities `{openLinks, serverTools, serverResources, updateModelContext:{text:{}}}`. It handles `ui/message` without declaring `message` (`src/implementation.ts#L280-L343`).
  - Host context: `platform:"web"`, `containerDimensions:{maxHeight:6000}`, `availableDisplayModes:["inline","fullscreen"]`.
  - Its CSP is looser than the spec default: `'unsafe-eval'`, `blob:`, `data:`, `connect-src 'self'`, `base-uri 'none'` (`serve.ts#L57-L128`). A view that passes here can fail a strict host.
  - Connects with Streamable HTTP, then SSE. **No stdio** (`src/implementation.ts#L56-L70`).
- **MCP Inspector** ([recipes](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/recipes.md) L63-127): `--app-info --advertise-apps` probes a tool's UI metadata without calling it. The web Inspector's Apps screen serves the view from port 6275, or 6278 for `_meta.ui.domain` (L151). It spawns stdio servers (L9-13), but its Apps examples are HTTP only.

## Which hosts support it

| Host | Renders MCP Apps? | Evidence |
| --- | --- | --- |
| Claude on the web | Yes, remote connectors only | [doc] MA quickstart; [connectors getting-started](https://claude.com/docs/connectors/getting-started) #where-connectors-work |
| Claude desktop, Claude mode (Chat/Cowork) | Yes, inline, including from a local `claude_desktop_config.json` server. The page names no mode. | [doc] MA getting-started #try-an-example-mcp-app-in-claude-desktop |
| Claude desktop, Code tab | Unverified. The third-party (3P) changelog says the Code tab gained "interactive MCP app widgets in the conversation", a feature "already available in the standard app". code.claude.com says nothing. | [doc] [cowork changelog](https://claude.com/docs/cowork/changelog) v1.37937.0 |
| Claude Code in the terminal | No. "Claude Code calls the tool as text and doesn't render the UI." | [doc] MA quickstart |
| Claude mobile (iOS, Android) | Yes, in a native WebView, for connectors added on web or desktop | [doc] MA design-guidelines #mobile-guidelines |
| Codex in the ChatGPT desktop app | Yes, including a thread tab from a local stdio plugin server | Verified live in this repo, `docs/plans/codex-plugin/what-codex-allows.md:21-22` |
| Codex CLI | No. The `enable_mcp_apps` flag is off. | Verified live in this repo, `docs/plans/codex-plugin/what-codex-allows.md:21` |
| ChatGPT (web, desktop, mobile) | Yes. ChatGPT supports "the open MCP Apps UI standard". | [doc] [OpenAI plugin architecture](https://developers.openai.com/plugins/concepts/plugins), "Optional UI" |
| Others ticked in the matrix | VS Code GitHub Copilot, Microsoft 365 Copilot, Goose, Postman, MCPJam, Cursor, Archestra.AI, PostHog Code | [doc] client matrix L30-45 ("maintained by the community", L15-17) |

Neither Claude Code nor Codex appears in the client matrix or in [apps/overview](https://modelcontextprotocol.io/extensions/apps/overview.md) #client-support (L176-179).
