# Plugin UI: resources, ChatGPT extensions and live updates

Part of [Codex plugins and the Codex app](../codex-plugins.md).

## Resource metadata, CSP and sandbox

- URI MUST use `ui://`; MIME type `text/html;profile=mcp-app`; `_meta.ui`
  takes `csp`, `permissions`, `domain`, `prefersBorder`. (APPSPEC:L55-290)
- With no `csp`, the host MUST use `default-src 'none'; script-src 'self'
  'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
  media-src 'self' data:; connect-src 'none'`. "Host MAY further restrict but
  MUST NOT allow undeclared domains". (APPSPEC:L276-286)
- Permissions (`camera`, `microphone`, `geolocation`, `clipboardWrite`) are
  requests: "Hosts MAY honor these … Apps SHOULD NOT assume permissions are
  granted; use JS feature detection as fallback." (APPSPEC:L169-171)
- "Treat the resource URI as a cache key. When you make a breaking change to
  the HTML, JavaScript, or CSS, publish a new URI". (D/build/chatgpt-ui#embed-the-component-in-the-server-response)
- **Live, Codex keeps a tab's page by its URI across server restarts**
  [live 2026-10-10]. A test build ran in the server Codex started for a new
  chat, and that chat's tab drew the old page. Under a new URI, a new chat's
  tab drew the test build.
- **Live, Codex removes an open tab when a later tool list names another URI
  for its entrypoint** [live 2026-10-25, ChatGPT 26.1021.31345]. After a
  reinstall whose server handler changed, a later thread change, not always
  the first, started a new server process and loaded the MCP server catalog.
  A reinstall that changed only the hook bundle, or changed nothing, started
  none. Every open Inbox frame whose `inbox_view` URI the
  new list no longer named was torn down ("Revoked app sandbox registration
  … shouldRemoveFrame=true") and showed "Couldn't display Inbox"; Try again
  failed the same way. With the URI unchanged across builds, the frame
  stayed and swapped to the new page. So the inbox lists one fixed URI,
  `ui://inbox/view` (`TAB_ADDRESS`, codex/src/server.ts), and names each
  build's page separately (`pageName`).
- **Live, so a new tab after an update starts on an earlier build's saved
  page** [live 2026-10-25, ChatGPT 26.1021.31345]. An Inbox tab opened after
  an update, in a thread that had none, drew Codex's saved copy of an earlier
  build and swapped to the new page about 0.3 s later. In that run, one update
  in, the saved copy was the build just before. When Codex refreshes its saved
  copy under the fixed address is unknown, so after several updates it could
  be older. Reopening the tab in a thread that already had one drew the new
  page directly. So every new tab after an update relies on `swapPage`
  (codex/src/tab.tsx). If the swap fails, the tab stays on the earlier build
  and says "Could not load the inbox update."
- **Historical document-replacement probe** [live 2026-10-10]. A tab that
  fetched a page through `tools/call` and ran `document.open`, `write` and
  `close` drew the new page. Its script sent `ui/initialize` again, Codex
  answered, and the new page's polls worked. This probe did not check whether
  host timers or event listeners survived.
- **Current Inbox reload ownership** [source, browser and native checks 2026-10-16].
  `codex/src/tab.tsx:swapPage` preserves the host document and replaces only
  Inbox's root, style and script. It first initializes a candidate against a
  detached root and waits for active presses. Failed startup keeps the working
  page; disposal removes only the retired instance's timers, listeners and
  animations. Browser checks
  preserve host hooks and drafts while stopping old polls. Initialization uses
  numeric request IDs, a timeout and a retry. The repaired native page retains
  attachment, focus and the exact draft across two replacements in one tab.
  Show demo, Hide demo and Dismiss/Undo also pass. See
  [the implementation record](../../plans/platform-architecture-audit.md).
- "Bundle or inline the CSS in your app's HTML. The default iframe CSP can
  block external stylesheets." (TSR:L96)
- The inbox resource sets no `_meta.ui` (codex/src/server.ts:makeServer), so the
  default CSP applies. All data goes through `tools/call` and the bundle is
  inline, so that is fine today.

## ChatGPT-only `window.openai` and client `_meta`

- **`window.openai` extras:** `widgetState`/`setWidgetState`, `requestModal`,
  `requestClose`, `requestDisplayMode`, `notifyIntrinsicHeight`,
  `openExternal`, `uploadFile`, `selectFiles`, `getFileDownloadUrl`,
  `requestCheckout` (private beta), globals such as `theme` and `displayMode`.
  (D/build/chatgpt-ui#layer-on-chatgpt-extensions, D/reference#capabilities)
  "Widget state belongs to one rendered UI instance. Do not use it as the
  source of truth". "Avoid `localStorage` for core state."
  (D/build/chatgpt-ui#keep-temporary-ui-state-in-the-ui,
  #store-cross-session-state-on-your-server)
- **What ChatGPT sends the server** in `_meta`: `openai/locale`,
  `openai/userAgent`, `openai/userLocation`, `openai/subject` ("Anonymized user
  id"), `openai/session` ("Anonymized conversation id for correlating tool
  calls within the same ChatGPT session"), `openai/organization`. "Treat
  `_meta["openai/userAgent"]` as optional, best-effort metadata".
  (D/reference#_meta-fields-the-client-provides) Whether Codex sends any of
  these is [unknown].
- **`openai/widgetSessionId`** is "Host-provided tool result metadata" in the
  tool result `_meta` the widget receives: "Stable ID for the currently
  mounted widget instance". It is not in `tools/call` params.
  (D/reference#tool-results)
- No page in this group mentions Codex's `_meta.thread_id` or
  `x-codex-turn-metadata`.

## Live updates

- **Subscriptions are documented only for file viewers.** "MCP Apps MAY
  subscribe to changes to their `resourceUri` with `resources/subscribe`"
  (SPEC:L425-429), in the file-entrypoint section, where the host handles the
  calls (SPEC:L292). BB subscribes only to the opened file
  (BB `src/app/controller.ts:369`).
- **Live:** a thread tab's `resources/subscribe` never reached the server, and
  no update arrived in two minutes. Polling a tool every 5 s worked [live]
  (docs/plans/codex-plugin/step-0-and-results.md:65). The tab now polls every 3 s
  (codex/src/settle.ts:POLL_MS).
- **MCP Events cannot replace polling.** "MCP Events is available in Work
  chats on ChatGPT web, in Work chats in the desktop app with **Cloud**
  selected, and with dots." It "requires MCP 2.0 (protocol version
  `2026-07-28`)" and POSTs signed events to a public HTTPS callback.
  "Polling, streaming, and the draft's `gap` and `terminated` control
  notifications are not supported by this integration." (D/build/mcp-events#before-you-start)
- **Undocumented app-server streaming.** `mcpServer/event/stream/start`,
  `stop` and the notification `mcpServer/event/stream/notification`
  (`{ subscriptionId, notification }`) exist, all `#[experimental]` [source]
  (GH/codex-rs/app-server-protocol/src/protocol/common.rs:1263-1274,
  :2009-2010). Whether the desktop uses them for MCP Apps is [unknown].
- The MCP Apps overview says a monitoring app "maintains a persistent
  connection, updating the display as data changes" (APPS#when-to-use-mcp-apps).
  No standard view message delivers that.

## Other OpenAI extensions

- **Structured settings.** `capabilities.extensions["openai/settings"]` with
  `{readTool, updateTool}`; settings render as native controls on the plugin
  page; "MCP Servers are responsible for persisting settings." (SPEC#structured-settings)
- **Deep links** go only to global entrypoints:
  `codex://plugins/{pluginId}@{marketplace}/app/{toolName}?path=…`
  (SPEC#deep-links).
- **Opening local files.** `openai/files/open {path}` when
  `hostCapabilities.experimental["openai/files"]` is present
  (SPEC#opening-local-files).
- **Forms.** `openai/elicitation/create` with resource pickers and
  suggestions. "Forms containing unsupported input types are reported as
  unsupported." (SPEC#openai-form-elicitation, SPEC:L1387)

## UI guidelines

- Inline cards: at most two primary actions; "No deep navigation or multiple
  views within a card"; "No nested scrolling". (D/concepts/ui-guidelines#inline-card)
- Fullscreen: "Design your UX to work with the system composer".
  (#fullscreen)
- "Don't use custom fonts, even in full screen modes". Icons "monochromatic
  and outlined". WCAG AA contrast. (#visual-design-guidelines)
- [inference] A three-tab pane fits a side panel, not an inline card. A
  cross-host design needs a compact and a full layout chosen from
  `hostContext.displayMode` and `containerDimensions`.

## Which hosts support MCP Apps

- APPS#client-support lists Claude, Claude Desktop, VS Code GitHub Copilot,
  Microsoft 365 Copilot, Goose, Postman, MCPJam and Archestra.AI.
- MATRIX adds ChatGPT, Cursor and PostHog Code. "This list is maintained by
  the community."
- Neither lists Codex or Claude Code. Whether Claude Code or the Claude
  desktop app's Code mode renders MCP Apps is not answered here.
- [inference] Of the inbox's MCP surface, only `_meta["openai/ui"].entrypoints`
  is OpenAI-specific (codex/src/server-tools.ts:TOOLS). The same `ui://inbox/view`
  resource could render in other MCP Apps hosts, opened by the model and
  inline.
