# Codex, the Codex tab against the spec, and a Claude-mode view

Part of [MCP Apps](../mcp-apps.md).

## Codex and the ChatGPT Apps SDK

- **Codex renders standard MCP Apps plus its own placement key.** The inbox's `inbox_view` tool sets `_meta.ui.resourceUri` and `'openai/ui': { entrypoints: [{ type: 'thread' }] }` (`codex/src/server-tools.ts:TOOLS`). `thread` opens the app as a tab in a thread; `global` as a sidebar entry. Only `thread` is verified (verified live in this repo, `docs/plans/codex-plugin/what-codex-allows.md:22`).
- **Codex renders the tab without the server declaring the extension.** The server's `initialize` reply is `capabilities: { tools: {}, resources: {} }` (`codex/src/server.ts:makeServer`). [inference] Codex does not enforce the both-sides rule in the client matrix L13.
- **`ui/message` becomes untrusted input** (verified live in this repo, `docs/plans/codex-plugin/what-codex-allows.md:23`, `:333`). The spec's "SHOULD ... preserving the specified role" ([S] L1033) expects a user message. This is a SHOULD deviation, not a violation.
- **Resource subscriptions did not work from a thread tab** (verified live in this repo, `docs/plans/codex-plugin/what-codex-allows.md:24`). The tab polls instead.
- **Plugins with MCP servers are "Desktop only".** "Any imported plugin that declares MCP servers in `mcp.json` or `.mcp.json` is marked Desktop only and works only in the ChatGPT desktop app" ([plugin-management](https://learn.chatgpt.com/docs/enterprise/plugin-management) #desktop-only-plugins).
- **Public listing expects mobile support.** "Plugins must function reliably in ChatGPT on both desktop and mobile, including any UI components" ([plugin-guidelines](https://developers.openai.com/plugins/plugin-guidelines) #testing).
- **Headless use must work.** "Keep tools useful without the component so the model can complete headless workflows" (OpenAI plugin architecture, "Optional UI").
- **Domain format.** OpenAI's example is `www-example-com.oaiusercontent.com` ([S] L205-217).
- **Migration.** ext-apps ships a migrate-oai-app skill ([SDK] `docs/agent-skills.md#L11-L47`). The only hosted migration guide found is at the capitalized path `Migrate_OpenAI_App.html`, which serves the old v1.1.2 build. No current-build copy was located (curl check, 2026-10-08).

## The inbox's Codex tab against the spec

**Current reload behavior, checked on 2026-10-16.** The tab preserves the host
Document and body when loading a new page. A candidate initializes against a
detached root before it replaces the working UI. Failed startup keeps the old
page and offers Retry. Active presses defer activation; disposal removes only
that instance's timers, listeners and animations. Browser checks retain host hooks and the
exact draft, initialize the new page once, and stop old polls. Numeric request
IDs advance across replacements. Initialization has a nine-second timeout and
a retry. The repaired native page retains its attachment, focus and exact draft
across two page replacements in one tab. Show demo, Hide demo and Dismiss/Undo
also pass. [The implementation record](../../plans/platform-architecture-audit.md)
separates this native sample check from controlled transport tests.

The table below is the historical comparison at `55ab122`. Its polling and
request-timeout descriptions do not describe the current tab. Current reads
and presses have timeouts, and page replacement retires the old instance.

| Area | What the code does | What the spec or SDK expects | Effect |
| --- | --- | --- | --- |
| Protocol era | Answers `initialize`, echoes the client's version or `2025-06-18` (`codex/src/server.ts:makeServer`). No `server/discover`; unknown methods get `-32601`. Answers `ping`. | `2026-07-28` removes `initialize` and `ping` and requires `server/discover`. | Works with legacy and dual-era clients. Fails with modern-only clients (versioning L169-171). |
| Extension declaration | No `extensions` in the reply (`codex/src/server.ts:makeServer`). Does not read the client's `extensions`. | Both sides declare (client matrix L13). Servers SHOULD check the client ([S] L1531). | Codex renders anyway. A stricter host might not [inference]. |
| Resource `_meta.ui` | `resources/list` and `resources/read` carry no `_meta` (`codex/src/server.ts:makeServer`). | Set `prefersBorder` explicitly ([S] L222). Declare `csp` and `permissions` as needed. | Default CSP applies. No `clipboardWrite`, no `assets.claude.ai` font origin. |
| Legacy key | Only nested `_meta.ui.resourceUri` (`codex/src/server.ts:TOOLS`). | `registerAppTool` also writes `ui/resourceUri` for older hosts. | Unknown whether any target host needs it. |
| App capabilities | `appCapabilities: { tools: {} }` and no `availableDisplayModes` (`codex/src/tab.tsx:initialize`). | Declaring `tools` requires `tools/list` and `tools/call` handlers ([D] L1281, L1324). Declaring display modes is a MUST ([S] L781). | Drop `tools` or implement it. Add `availableDisplayModes`. |
| Host requests | Answers every host request with `result: {}` (`codex/src/tab.tsx:window.addEventListener('message')`). | `ListToolsResult` needs `tools`; `CallToolResult` needs `content`. | Correct for `ping` and `ui/resource-teardown`. Malformed for `tools/*`. |
| Message source | Accepts JSON-RPC from any window (`codex/src/tab.tsx:window.addEventListener('message')`). | `PostMessageTransport` checks `event.source` ([SDK] `src/message-transport.ts#L76`). | [inference] Any frame able to post into the tab could answer its requests. |
| Size reports | Never sends `ui/notifications/size-changed`. | Hosts with flexible dimensions depend on it ([S] L718). | [inference] May collapse or clip inline in Claude. |
| Polling | `inbox_view` every 3 s (`codex/src/settle.ts:POLL_MS`, `codex/src/tab.tsx:poll`), started after `initialized` (`codex/src/tab.tsx:startConnected`). Stops when a replacing page calls `codex/src/tab.tsx:dispose`, which sets `isDisposed`. No teardown handler stops it. | Stop polling in `onteardown` ([SDK] `docs/patterns.md#L40-L80`). | [inference] Polls until the iframe is destroyed. |
| Request timeout | None. | SDK default 60 s. | A lost reply hangs a press forever [inference]. |
| Theme | `applyHost` uses `theme` and `styles.variables` only (`codex/src/tab.tsx:applyHost`). `color-scheme` is set in CSS on `:root`, in its `prefers-color-scheme: dark` rule, and on `:root[data-theme='dark']` (`codex/src/tab.html`). The `body` paints `var(--bg)`. | Claude: transparent background, `<meta name="color-scheme">`, `styles.css.fonts`. | Opaque card and fallback font in Claude [inference]. |
| Clipboard | Falls back to manual copy because "The tab's frame may not get the clipboard" (`codex/src/tab.tsx:copy`). | `permissions.clipboardWrite`, which hosts "MAY honor". | Declare it and keep the fallback. |
| Session key | `sessionOf` reads Codex's `_meta["x-codex-turn-metadata"].session_id`, `thread_id` or `threadId` (`codex/src/server.ts:sessionOf`). A call without one fails (`codex/src/server.ts:callTool`). | The spec defines no conversation key. Claude sends none. | Every call fails in Claude as written. |
| Visibility | `APP_ONLY = { ui: { visibility: ['app'] } }` on `inbox_press` and `inbox_tab_page`. `inbox_view` sets `visibility: ['app']` in its own `_meta.ui` (`codex/src/server.ts:TOOLS`). | Hiding depends on the host. | |

## What this means for an inbox view in Claude mode

All of this is inference from the facts above, unless a source is given.

- **Route.** A local stdio server in `claude_desktop_config.json` or a `.mcpb`. Not the plugin, which Chat ignores, and not a URL connector, which runs from Anthropic's cloud.
- **Session.** The server must mint its own key. With no conversation id, the view cannot be tied to a Claude Code session. It is either one global view or a new kind of session.
- **Placement.** A full-screen view fits the inbox's tabs, long lists and many actions. An inline card can carry only a summary with at most 2 actions. Claude's guidance pairs the two: "The inline card might show a summary, and fullscreen mode can offer the detailed view." No mode keeps a view beside the conversation.
- **Copies.** Every `inbox` call by the model leaves a live copy. Only the newest should act, or presses must carry a target that the server checks (`applied`, `gone`, `changed`).
- **Updates.** Poll with an app-only tool. No push and no sampling are documented for Claude.
- **Per-reply update.** Claude mode has no documented hook or model call for the server. Items would come from tools the model calls, or from the server's own model access.
- **Talking to the model.** `updateModelContext` is the documented way to tell Claude what waits on the person, at the next turn. `ui/message` can send text, but its treatment in Claude is unknown, and Codex treats it as untrusted.
- **Links.** Every `ui/open-link` from a local server shows a confirmation modal.
- **Guarding presses.** `inbox_press` cannot rely on host visibility. A server-minted per-view handle, checked on each press, is the control the inbox owns. Core `2026-07-28` endorses "server-minted handles passed as ordinary tool arguments".
- **State.** Keep it on the server or in the mod's store. The view's origin and storage are per conversation, and the host can tear the view down at any time.
- **Look.** Use the standard variable names with fallbacks, a transparent background, the color-scheme meta tag and `prefersBorder: false`.
