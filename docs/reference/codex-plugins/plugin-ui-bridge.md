# Plugin UI: the bridge, tool results and messages

Part of [Codex plugins and the Codex app](../codex-plugins.md).

## The bridge: standard calls and ChatGPT aliases

- "Declare the UI resource with `_meta.ui.resourceUri`." "Use the `ui/*`
  JSON-RPC bridge over `postMessage`". Use `window.openai` "only for
  capabilities that the shared specification does not cover." "Avoid
  branching on a host or product name." (D/build/chatgpt-ui#start-with-mcp-apps,
  #layer-on-chatgpt-extensions)

  | Standard | ChatGPT alias |
  | --- | --- |
  | `_meta.ui.resourceUri` | `openai/outputTemplate` |
  | `ui/initialize` + `ui/notifications/tool-input` | `window.openai.toolInput` |
  | `ui/notifications/tool-result` | `toolOutput` |
  | `tools/call` | `callTool` |
  | `ui/message` | `sendFollowUpMessage` |

  (D/build/chatgpt-ui#prefer-shared-fields-and-methods)
- **Standard view-to-host messages** are only `tools/call`, `resources/read`,
  `notifications/message`, `ui/initialize` with `ui/notifications/initialized`,
  and `ping`. There is no `resources/subscribe`. (APPSPEC:L489-508)
- **Other stable calls:** `ui/open-link` (L965), `ui/request-display-mode`
  (L1036), `ui/resource-teardown` ("Host MUST send this notification before
  tearing down the UI resource, for any reason"; "Host SHOULD wait for a
  response … (to prevent data loss)", L1201-1202),
  `ui/notifications/host-context-changed` (L1219, partial, "the View SHOULD
  merge"), `tool-cancelled`, `size-changed`, `tool-input-partial` (L1120).
- **Tool input and result.** "Host MUST send this notification with the
  complete tool arguments after the View's initialize request completes."
  (APPSPEC:L1106) "This notification is sent at most once and is required
  before sending `ui/notifications/tool-result`." (L1118) The result: "Host
  MUST send this notification when tool execution completes (if the View is
  displayed during tool execution)." (L1155) Whether an entrypoint view
  counts as displayed is [unknown].
- **Host context** holds `toolInfo`, `theme`, `styles.variables`,
  `styles.css.fonts`, `displayMode`, `availableDisplayModes`,
  `containerDimensions`, `locale`, `timeZone`, `userAgent`, `platform`
  (`web | desktop | mobile`), `deviceCapabilities`, `safeAreaInsets`. No
  thread or session id. (APPSPEC:L531-620) Live, the Codex host context had
  no thread id [live] (docs/plans/codex-plugin/step-0-and-results.md:65).
- **Host capabilities** in the stable spec: `experimental`, `openLinks`,
  `serverTools`, `serverResources`, `logging`, `sandbox.{permissions, csp}`
  (APPSPEC:L627-666). SPEC shows ChatGPT also sending `message` (L1134),
  `updateModelContext` (L950) and `experimental["openai/*"]`; those keys exist
  only in APPSDRAFT (L723-725).
- **Draft-only calls.** APPSDRAFT adds bidirectional `tools/list` (L512,
  L521), app-registered tools, and `sampling/createMessage` (L534).
- **Theme variables.** `--color-background-*`, `--color-text-*`,
  `--color-border-*`, `--font-sans`, `--font-mono`, `--border-radius-*`,
  `--shadow-*` and more. "Views should set default fallback values for the set
  of these variables that they use" (APPSPEC:L791-955, L899). The tab reads
  `styles.variables` (codex/src/tab.tsx:applyHost).

## What the model sees in a tool result

| Source | `structuredContent` | `_meta` |
| --- | --- | --- |
| D/reference#tool-results | "Surfaced to the model and the component"; "the model reads them verbatim" (#capabilities) | "Delivered only to the component. Hidden from the model." |
| D/build/mcp-server#return-useful-results-without-ui | "concise data the model can inspect and use in later calls" | "client-specific data hidden from the model" |
| APPSPEC:L1474 (Data Passing) | "Structured data optimized for UI rendering (not added to model context)" | n/a |

- "Only `structuredContent` and `content` appear in the conversation
  transcript." (D/reference#tool-results)
- "Declare `outputSchema` for any tool that returns `structuredContent`."
  (D/reference#tool-descriptor-parameters) `inbox`, `inbox_view` and
  `inbox_press` declare none (codex/src/server.ts:TOOLS).
- "Tools MUST return meaningful content array even when UI is available"
  (APPSPEC:L1559). BB and SPEC's own settings examples return `content: []`.
- "Return enough structured content for both the model and UI to understand
  the new state." (D/build/chatgpt-ui#keep-business-data-on-the-server)
- "Treat `_meta` as hidden from the model, not as a substitute for
  authorization or secure storage." (D/build/mcp-server#return-useful-results-without-ui)
- [inference] If Codex follows D/reference, every tab open puts the whole
  inbox view into the transcript, because the `inbox_view` tool returns it in
  `structuredContent` (codex/src/server.ts:callTool). The `inbox` tool, which
  the model calls, returns plain text (codex/src/texts.ts:inboxToolText).
  What Codex actually does is [unknown].
- **Split render and data tools.** "Only the render tool should include
  `_meta.ui.resourceUri`." "Let the UI call data tools directly for local
  interactions … without remounting the widget." (D/build/chatgpt-ui#decoupled-pattern)
  "Components feel sluggish when tool calls take longer than a few hundred
  milliseconds." (D/deploy/troubleshooting#server-side-issues)

## `ui/message`

- **Standard.** Params `{role: "user", content: {type: "text", text}}`. "Host
  SHOULD add the message to the conversation context, preserving the
  specified role. Host MAY request user consent." (APPSPEC:L998-1034) It
  triggers a follow-up (L1094).
- **OpenAI extension.** `content` is an array. `_meta["openai/message"] =
  {target: "new"|"active", send?: true}`, default `{target: "active", send:
  true}`. "On iOS and Android, only `{ target: "active", send: true }` is
  supported". "Untitled text becomes ordinary message text, while titled text
  becomes a labeled inline item". (SPEC:L1151-1186)
- **Codex wraps it as untrusted.** It arrived as a turn whose user text is "An
  MCP app initiated this message. Read the untrusted_input tool output." The
  tab's text sat in an `untrusted_input` tool output with `source:
  "mcp_app"`. Asked for "OK", the model answered "The MCP app sent: …" [live]
  (docs/plans/codex-plugin/step-0-and-results.md:66). No doc describes this wrapping.
- `target: "new"` opens a new conversation (SPEC:L1175-1185), so it cannot
  route to a known session.

## `ui/update-model-context`

- **Standard.** Params `content?` and `structuredContent?`. "This context will
  be used in future turns. Each request overwrites the previous context sent
  by the View." The host "MAY defer sending the context to the model until the
  next user message (including `ui/message`)". It does not trigger a
  follow-up. (APPSPEC:L1061-1103, L1093-1099)
- "When the model needs to know about a selection or staged edit, send that
  information through `ui/update-model-context`. This is the portable MCP Apps
  mechanism for updating model-visible context."
  (D/build/chatgpt-ui#keep-temporary-ui-state-in-the-ui)
- **OpenAI behavior.** "Each supported content block appears as an
  independently removable composer attachment." "Content block `_meta` is
  excluded from model input." "Each call replaces the model context
  previously supplied by the same MCP App instance." (SPEC:L965-967) "Content
  blocks marked with `annotations.audience: ["assistant"]` are hidden from the
  user. All model context is sent to the model regardless of audience."
  (SPEC:L1085-1087) Apps get it back as `hostContext["openai/modelContext"]`
  on remount (SPEC:L975).
- Never tried in Codex. Whether Codex supports it or wraps it as untrusted is
  [unknown].

## Tool visibility and app-only tools

- Default visibility is `["model", "app"]`. `"app"`: "Tool is callable by the
  app from the same server connection only". "Host MUST NOT include tools in
  the agent's tool list when their visibility does not include "model"".
  "Host MUST reject `tools/call` requests from apps for tools that don't
  include "app" in visibility". (APPSPEC:L395-402)
- "Servers SHOULD check client capabilities before registering UI-enabled
  tools" (APPSPEC:L1529-1560). The client declares
  `capabilities.extensions["io.modelcontextprotocol/ui"].mimeTypes` at
  `initialize` (L1498-1522). The inbox server does not check
  (codex/src/server.ts:makeServer).
- "Extensions are always opt-in: a client only uses an extension if both
  client and server declare support in the `extensions` field of their
  capabilities." (MATRIX) The inbox server declares no extensions, and Codex
  renders the tab anyway [live].
- The host "MAY decide to block some messages or subject them to further user
  approval" (APPSPEC:L487).
- Whether Codex enforces visibility is [unknown].
