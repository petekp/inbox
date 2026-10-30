# Plugin UI: hosts, entrypoints and display modes

Part of [Codex plugins and the Codex app](../codex-plugins.md).

MCP Apps is an MCP extension. A tool names a `ui://` HTML resource, and the
host renders it in a sandboxed iframe that talks to the host over JSON-RPC on
`postMessage`. OpenAI adds "entrypoints", which let a person open an app
without the model calling it. The Inbox tab is a thread entrypoint.

## Which product the docs say renders UI

- **developers.openai.com scopes UI to ChatGPT.** "Components run inside an
  iframe in ChatGPT, communicate with the host through the MCP Apps bridge
  (JSON-RPC over `postMessage`)". "Keep the MCP tools useful without a
  component so ChatGPT and Codex can complete the workflow without UI."
  (D/build/chatgpt-ui#overview) The docs index says "Build an MCP server for
  ChatGPT and Codex, with optional UI in ChatGPT." (D/llms.txt)
  Troubleshooting: "UI, widget state, and client-authentication checks on
  this page describe ChatGPT behavior." (D/deploy/troubleshooting#how-to-triage-issues)
- **The extensions spec names ChatGPT surfaces only.** SPEC:L3 lists "ChatGPT,
  including ChatGPT Work, ChatGPT Desktop, and ChatGPT mobile apps". Codex
  appears only in the desktop deep-link scheme: "`codex` on desktop. `chatgpt`
  on mobile." (SPEC:L141)
- **The sample plugin is a Codex plugin.** BB's README calls it "a
  kitchen-sink example of the core MCP extensions available in Codex", says
  "Open the Parts Library from the Codex sidebar", and ships
  `.codex-plugin/plugin.json` with a stdio server (`node ./dist/server.js`,
  `StdioServerTransport`). Its marketplace is "OpenAI MCP Extensions (Early
  Access)".
- **Live:** a thread tab opened from the local inbox plugin in the desktop
  app [live] (docs/plans/codex-plugin.md:54, :332).
- **CLI:** `enable_mcp_apps` is `Stage::UnderDevelopment` and off
  (GH/codex-rs/features/src/lib.rs:244, 1503-1508; `codex features list`
  [live 2026-10-08]). No learn.chatgpt.com page mentions MCP Apps, `ui://` or
  `enable_mcp_apps`. `features.apps` is "app (connector) integrations", a
  different thing. (L/config-basic#common-feature-flags)
- **Codex advertises the extension.** `MCP_APP_UI_EXTENSION_ID =
  "io.modelcontextprotocol/ui"` is advertised in client capabilities [source]
  (GH/codex-rs/protocol/src/mcp.rs:34, used at :584 and :599).
- **Platform table is a forecast.** "This table describes expected support at
  DevDay launch." (SPEC:L16) It lists thread entrypoints on Desktop, Web, iOS
  and Android. File entrypoints, file opening, file resources and composer
  at-mentions are desktop only.
- **DevDay framing.** Plugin Extensions sit under "Sites & plugins": "Add
  sidebar apps, conversation panels, file viewers and editors, and forms to
  ChatGPT. Composer mentions are available only in the desktop app. Free and
  Go web extensions are coming soon." (L/whats-new/devday-2026#plugin-extensions)

## Entrypoints

- **Declaration.** `_meta["openai/ui"].entrypoints: [{ type: "global" }]`
  beside `_meta.ui.resourceUri`. "Use `{ type: "thread" }` to add an
  entrypoint in a conversation's side panel." (D/build/extensions#sidebar-apps)
  The inbox declares `[{ type: 'thread' }]` (codex/src/server.ts:TOOLS).
- "Normally, MCP Apps can only be invoked via the model. However, it may be
  convenient to allow users to open your MCP App via static entrypoints."
  (SPEC:L36) Up to three per app: global, thread ("Available as a content tab
  within a thread"), file. (SPEC:L40-44)
- **Visibility is ignored.** "`_meta["ui"]["visibility"]` normally controls
  model versus user visibility. This field is ignored when an MCP App is
  invoked as an entrypoint." (SPEC:L49)
- **Render from the first result.** "MCP Apps SHOULD use the initial tool
  result for their first render without calling the tool again." (SPEC:L50)
  "Register `app.ontoolresult` before `app.connect()` to render the initial
  result instead of calling the tool again, which delays rendering and causes
  visible flicker." (TSR:L42) The inbox tab instead calls `poll()` right after
  `ui/initialize` and has no `tool-result` handler (codex/src/tab.tsx:initialize).
- **Thread entrypoint.** "The server receives `{}` as the tool arguments when
  the entrypoint opens." "Every thread will have a different instance of the
  entrypoint." (SPEC:L218-225)
- **Global entrypoint.** The server MUST accept `{}`. "On desktop, global
  entrypoints open with a composer and thread layout, with the app as a
  permanent tab. Requests that target the current thread, such as
  `ui/update-model-context` and `ui/message`, use that thread." (SPEC:L95-97)
  [inference] A global "every session" view would itself live in a thread.
- **Title.** "MCP Servers SHOULD provide a unique title for each thread
  entrypoint that describes the view's contents and differs from the plugin
  name" (SPEC:L38). Title order: `title`, `annotations.title`, `name`
  (SPEC:L82-85). The inbox's tool is titled "Inbox", the plugin name
  (codex/src/server.ts:TOOLS).
- **Icons.** SHOULD be on each entrypoint tool: SVG, monochrome, transparent,
  `currentColor`, 20x20 viewport, 1.33px strokes (SPEC:L56-63). Fallback: the
  tool icon, then the "Local MCP Server icon, or the app logo registered with
  OpenAI for hosted MCP Apps", then a "Generic fallback icon". "Server icons
  come from `_meta["io.modelcontextprotocol/serverInfo"]["icons"]` in
  `server/discover`; servers without `server/discover` use
  `serverInfo["icons"]` in `initialize`." (SPEC:L67-73) The inbox sets no
  icons on the tool or `serverInfo` (codex/src/server.ts:TOOLS, codex/src/server.ts:makeServer).
- **File entrypoints.** `extensions` MUST use the dot form (SPEC:L288). The
  tool gets `{file: {name, resourceUri}}`; `resourceUri` is opaque.
  "`resources/read` and `resources/subscribe` work. However, they will be
  intercepted and handled by ChatGPT instead of the MCP Server."
  (SPEC:L288-293) "ChatGPT will never directly provide raw filesystem paths to
  MCP Apps" (SPEC:L373-377).
- **Undocumented entrypoint types in examples.** TSR:L132-163 and BB use
  `{type: "settings", searchTerms}`, a global `quickAction`, and BB uses
  `"openai/iconStyle": "monochrome"`. None are in SPEC's list.
- **The sample's entrypoint tool matches the inbox pattern.** BB `cad.tray` has
  no `visibility`, returns the full view in `structuredContent` with
  `content: []`, is titled with the plugin name, and has no tool icon
  (BB `src/server/register.ts:36-38`, `:160-189`).

## Display modes

- "ChatGPT currently supports `inline` and `fullscreen`, but not `pip`."
  "ChatGPT uses the `fullscreen` display mode for all entrypoints specified
  above." "by default, all MCP Apps invoked by the model are displayed inline
  first." (SPEC:L857-861)
- Resource metadata `_meta["openai/ui"].availableDisplayModes` and
  `preferredDisplayMode`. Servers that advertise
  `appCapabilities.availableDisplayModes` "SHOULD also set this field". "When
  resource metadata omits both display-mode fields, ChatGPT uses
  `appCapabilities.availableDisplayModes` after initialization."
  (SPEC:L863-871) Declaring modes on the resource lets ChatGPT open "in
  fullscreen immediately, without showing an inline loading state first."
  (D/reference#declare-display-modes-before-the-ui-loads)
- Stable spec: modes are `inline | fullscreen | pip`. A view MUST declare the
  modes it supports (APPSPEC:L781). The host "MUST NOT switch the View to a
  display mode that does not appear in its
  `appCapabilities.availableDisplayModes`, if set" (APPSPEC:L786).
- The inbox tab declares `appCapabilities: { tools: {} }` and no display modes
  (codex/src/tab.tsx:initialize). `appCapabilities.tools` means "App exposes MCP-style
  tools that the host can call" (APPSPEC:L518); the tab serves none.
