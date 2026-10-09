# MCP Apps

MCP Apps is the MCP extension that lets a server show its own HTML view inside a host's conversation. For the inbox, it is the only documented way to draw a view in hosts where the mod cannot run: the Codex app today, and the Claude desktop app's Claude mode as a candidate.

Checked on 2026-10-08 against:

- the stable spec `2026-01-26` and the draft spec in `modelcontextprotocol/ext-apps` (raw `main` on that date);
- the ext-apps SDK at commit `82221c0` (package `@modelcontextprotocol/ext-apps` 2.0.3, committed 2026-09-25);
- core MCP revision `2026-07-28`;
- the claude.com, support.claude.com and code.claude.com pages listed under [Sources](#sources), fetched that day;
- this repo at `55ab122`;
- the Claude desktop app v2.31226.0, which bundles Claude Code 2.1.293 (Cowork changelog), and local engine types whose header says "Written by Claude Code 2.1.293" (`.claude-plugin/types/claude-code/index.d.ts:1`, untracked and rewritten when a mod loads). The Codex app version was not recorded.

## Facts that most constrain the inbox

1. **A view has no persistent place.** The protocol modes are `inline`, `fullscreen` and `pip`, and a view appears where a tool call put it ([S] L740-789; [MA design-guidelines](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines) #display-modes). Codex's thread tab comes from a Codex-only key, not from the standard.
2. **Claude Code in the terminal does not render MCP Apps.** "Claude Code calls the tool as text and doesn't render the UI" ([MA quickstart](https://claude.com/docs/connectors/building/mcp-apps/quickstart.md) #see-the-ui-render-in-claude). Whether the desktop Code tab renders them is not verified (see [Where sources disagree](#where-sources-disagree)).
3. **Claude mode can reach local state only through a local server.** URL connectors are called "from Anthropic's cloud infrastructure, rather than from your local device" ([support 11175166](https://support.claude.com/en/articles/11175166), "Network requirements"). A plugin's local MCP server is "Ignored" in Chat ([platform-support](https://claude.com/docs/plugins/platform-support) #compare-component-support-by-app). The documented local routes are `claude_desktop_config.json` and a `.mcpb` desktop extension.
4. **Claude gives the server no conversation id.** "Neither `hostContext` nor the tool-call arguments include a Claude-provided conversation ID" ([MA instance-supersession](https://claude.com/docs/connectors/building/mcp-apps/instance-supersession.md) #channel-scope-and-ui-domain). The Codex server's `sessionOf` would fail every call (`codex/src/server.ts:73`, `:158`).
5. **Each model tool call in Claude mounts a new live view, and old ones stay.** "No host API unmounts earlier instances when a newer one appears" (MA instance-supersession, intro).
6. **There is no push to a view; it must poll.** A view receives only tool input, tool result, cancel and host-context notifications ([S] L1104-1219). Claude does not support resource subscriptions for remote servers ([BI](https://claude.com/docs/connectors/building/index.md) #decide-what-the-server-exposes). Core `2026-07-28` replaced `resources/subscribe` ([changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog.md) major change 4). In Codex, a thread tab's subscribe never reached the server (verified live in this repo, `docs/plans/codex-plugin.md:56`).
7. **Hiding app-only tools from the model is the host's job, and not every host does it.** The spec MUSTs are at [S] L400-401. The reference `AppBridge` forwards every view `tools/call` with no visibility check ([SDK] `src/app-bridge.ts#L2015-L2021`). claude.com's MCP Apps pages never mention `visibility`.
8. **The extension's capability negotiation is written for `initialize`, which core `2026-07-28` removed.** [S] L1498 versus [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog.md) major change 2.

## How to read this file

Evidence tags:

- **[doc]**: a public page says it.
- **[local]**: SDK source, the local engine types or this repo's code says it.
- **[verified live in this repo]**: a live check recorded in `docs/plans/codex-plugin.md`.
- **[inference]**: worked out from the above, not checked.

Unmarked statements with a source are [doc] or [local] by their source.

Short names:

| Name | Means |
| --- | --- |
| [S] | Stable spec, `https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx` (1768 lines). "L" is the line number. |
| [D] | Draft spec, `https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx` (2654 lines). |
| [SDK] | `https://github.com/modelcontextprotocol/ext-apps/blob/82221c0c8ce7661efa6771c9d461511b1650495f/` plus the path. |
| MA | `https://claude.com/docs/connectors/building/mcp-apps/` plus the page. |
| BI | `https://claude.com/docs/connectors/building/index.md`, written for remote servers. |
| HELP | `https://support.claude.com/en/articles/13454812`, "Use interactive connectors in Claude" (`dateModified` 2026-08-11). |
| Core | `https://modelcontextprotocol.io/specification/2026-07-28/` plus the page. |

Terms:

- **Host**: the app that renders the view, such as Claude or Codex.
- **View** (the spec also says "App"): the HTML page the host renders in a sandboxed iframe.
- **App-only tool**: a server tool with `_meta.ui.visibility: ["app"]`, meant to be called by the view and not by the model.
- **SEP**: Specification Enhancement Proposal, the MCP project's design document.
- **CSP**: Content Security Policy, the browser rule set that limits what a page may load or connect to.
- **Claude mode**: the desktop app's non-Code mode. Public docs still call it Chat and Cowork; see [Where sources disagree](#where-sources-disagree).

## Status and governance

- **Two spec files exist.** [S] is labeled "Status: Stable (2026-01-26)" and "Track: Extensions" ([S] L5, L9). [D] is labeled "Status: Draft" ([D] L7). The ext-apps README tables them as "**2026-01-26** | Stable" and "**draft** | Development" ([SDK] `README.md#L262-L271`).
- **SEP-1865 is the accepted design, frozen.** It is Final, Extensions Track, created 2025-11-21: "This SEP has reached Final status and is preserved as a historical record ... Changes made to the protocol after finalization are not reflected here." (SEP-1865 L19-24). It points to the draft as "the full specification" (L86-87).
- **The extension mechanism is SEP-2133** (Final, Standards Track; `/seps/index.md` L41). Both spec files instead cite SEP-1724 ([S] L15, L1494; [D] L13, L2181). SEP-1724 is not in the SEP index. Issue #1724 is a closed issue titled "SEP-1724: Extensions" (checked with `gh issue view 1724` on 2026-10-08). [inference] SEP-1724 was the earlier issue-numbered form; core adopted "PR-derived numbering" (changelog process change 1, SEP-1850).
- **Extensions change outside core review.** "extensions may be iterated on without further review from the Core Maintainers" (SEP-2133 L115). "Breaking changes MUST use a new identifier, e.g. `...-v2`" (L60). The overview prefers "capability flags or versioning within the extension settings object rather than creating a new extension identifier" ([extensions/overview](https://modelcontextprotocol.io/extensions/overview.md) L109). [inference] Detect features by capability flag. The id `io.modelcontextprotocol/ui` may stay the same through non-breaking changes.
- **SDKs keep extensions off by default.** "Where implemented, extensions MUST be disabled by default and require explicit opt-in" (SEP-2133 L129).
- **Extension data is untrusted.** "Clients and servers SHOULD treat any new fields or data introduced as part of an extension as untrusted" (SEP-2133 L289).
- **The SDK sends `2026-01-26` but also offers draft-only methods.** `LATEST_PROTOCOL_VERSION = "2026-01-26"` ([SDK] `src/spec.types.ts#L29`). `App` also exposes `downloadFile`, `requestTeardown` and `createSamplingMessage`, which exist only in [D] (L1066, L1445, L534). Nothing in the handshake tells a host that a view may use draft methods.

## How a server declares an app

### Identity

| Item | Value | Source |
| --- | --- | --- |
| Extension id | `io.modelcontextprotocol/ui` (reserved) | [S] L40, L1768 |
| MIME type | `text/html;profile=mcp-app` | [S] L51; [SDK] `src/constants.ts` (`RESOURCE_MIME_TYPE`) |
| URI scheme | `ui://`, reserved for MCP Apps. The resource "MUST use the `ui://` URI scheme". | [S] L64, L267, L1767 |

### The UI resource

- **Fields.** Required: `uri`, `name`, `mimeType`. Optional: `description`, `_meta.ui` ([S] L60-112).
- **Content.** `mimeType` "MUST be `text/html;profile=mcp-app`". Content is `text` or base64 `blob`, and "MUST be valid HTML5 document" ([S] L265-270).
- **Fetching.** "Host MUST use `resources/read` to fetch the referenced resource URI" ([S] L391). The host "MAY prefetch and cache" ([S] L392). Servers "MAY omit UI-only resources from `resources/list`" ([S] L393).
- **Where `_meta.ui` goes.** [D] allows it on the `resources/list` entry, the `resources/read` content item, or both. "Hosts MUST check both locations, preferring the content item and falling back to the listing entry" ([D] L270). The SDK calls the listing value "a static default" that the content item overrides ([SDK] `src/server/index.ts#L146-L159`). The create-mcp-app skill calls listing-level placement a mistake ([SDK] `plugins/mcp-apps/skills/create-mcp-app/SKILL.md#L157`). The content item works under both readings.
- **basic-host is strict about content.** It requires exactly one content item with the exact MIME type ([SDK] `examples/basic-host/src/implementation.ts#L95-L248`).

### `_meta.ui` on the resource

| Field | Meaning | Source |
| --- | --- | --- |
| `csp.connectDomains` | Origins for `connect-src`. Empty means no external connections. | [S] L114-230 |
| `csp.resourceDomains` | Origins for img, script, style, font and media sources. In Claude this also adds them to `script-src` and `style-src`. | [S] L114-230; [MA transparent-theming](https://claude.com/docs/connectors/building/mcp-apps/transparent-theming.md) #allow-the-host-font-origin-in-your-csp |
| `csp.frameDomains` | Origins for `frame-src`. Default `'none'`. "Restricted in Claude pending security review." | [S]; MA design-guidelines #content-security-policy |
| `csp.baseUriDomains` | Origins for `base-uri`. Default `'self'`. | [S]; [SDK] `src/spec.types.ts#L643-L654` |
| `permissions` | `camera`, `microphone`, `geolocation`, `clipboardWrite`. "Hosts MAY honor these ... Apps SHOULD NOT assume permissions are granted; use JS feature detection as fallback." | [S] L170-171; [SDK] `src/spec.types.ts#L657-L689` |
| `domain` | A dedicated sandbox origin. Format is host-defined: "Servers MUST consult host-specific documentation". "If omitted, Host uses default sandbox origin (typically per-conversation)." | [S] L205-217, L211 |
| `prefersBorder` | Boolean. "Specifying an explicit value for this is recommended because hosts' defaults may vary." | [S] L222-223 |

`csp` and `permissions` on a tool are typed `never`, because hosts ignore them there ([SDK] `src/spec.types.ts#L764-L796`).

### Tool metadata and visibility

- **Shape.** `_meta.ui.resourceUri?` and `_meta.ui.visibility?: Array<"model" | "app">` ([S] L324-333).
- **Legacy key.** The flat `_meta["ui/resourceUri"]` is "@deprecated ... Will be removed before GA" ([S] L341). `registerAppTool` writes both keys "for compatibility with older hosts" ([SDK] `src/server/index.ts#L170-L310`). "Host developers must check both formats" ([SDK] `src/constants.ts`).
- **Default.** "`visibility` defaults to `["model", "app"]` if omitted" ([S] L397).
- **Rules for hosts:**
  - "`app`: Tool is callable by the app from the same server connection only" ([S] L399).
  - "Host MUST NOT include tools in the agent's tool list when their visibility does not include `"model"`" ([S] L400; [D] L419).
  - "Host MUST reject `tools/call` requests from apps for tools that don't include `"app"` in visibility" ([S] L401; [D] L420).
  - "Cross-server tool calls are always blocked for app-only tools" ([S] L402).
- **Without MCP Apps support** the "tool behaves as standard tool (text-only fallback)" ([S] L389). So a client without support sees app-only tools as ordinary tools [inference].
- **Servers must still return text.** "Tools MUST return meaningful content array even when UI is available" ([S] L1558-1559).
- **What reaches the model is a server best practice, not a host rule.** Under "Best Practices", `content` is for model context, `structuredContent` is "optimized for UI rendering (not added to model context)", and `_meta` is "not intended for model context" ([S] L1471-1475).
- **Claude Code shows `structuredContent` to the model.** "One difference shows up in the `stream-json` output: because the tool now returns `structuredContent`, the `tool_result` Claude receives is that JSON object as a string ... rather than your `content` text" (MA quickstart #check-that-the-server-advertises-the-ui).
- **The spec rejected OpenAI's design.** The rationale rejects OpenAI's two-field `widgetAccessible` plus `visibility` approach in favor of one array ([S] L1662-1666).

## How a server detects host support

### What the ext-apps spec says

- "Clients advertise MCP Apps support in the initialize request using the extension identifier `io.modelcontextprotocol/ui`" ([S] L1498; [D] L2185). The settings object carries `mimeTypes`, which is REQUIRED and "Must include `"text/html;profile=mcp-app"`" ([S] L1522; [SDK] `src/spec.types.ts#L845-L858`).
- "Servers SHOULD check client capabilities before registering UI-enabled tools" ([S] L1531). Servers "MAY register different tool variants based on host capabilities" ([S] L1560).
- The SDK helper is `getUiCapability(clientCapabilities)`, which returns `clientCapabilities.extensions?.["io.modelcontextprotocol/ui"]` ([SDK] `src/server/index.ts#L456-L512`).
- **The server probably has to declare the extension too.** "a client only uses an extension if both client and server declare support in the `extensions` field of their capabilities" ([client matrix](https://modelcontextprotocol.io/extensions/client-matrix.md) L13). SEP-2133 L178-191 shows the server's `initialize` reply with `extensions: {"io.modelcontextprotocol/ui": {}}`.

### What core `2026-07-28` changed

| Change | Source |
| --- | --- |
| The `initialize` / `notifications/initialized` handshake is removed. "Every request now carries its protocol version and client capabilities in `_meta`." | Core changelog, major change 2 |
| Clients advertise extensions in `_meta["io.modelcontextprotocol/clientCapabilities"]` on each request. Servers advertise in the `server/discover` response. | [extensions/overview](https://modelcontextprotocol.io/extensions/overview.md) #negotiation L118-181 |
| Servers "MUST implement" `server/discover`. Clients may use it "as a backward-compatibility probe on STDIO". | Core changelog, major change 3 |
| `extensions` is added to `ClientCapabilities` and `ServerCapabilities`. | Core changelog, minor change 1 |
| `tools/list`, `resources/list`, `resources/read` and other list results need `ttlMs` and `cacheScope` (`"public"` or `"private"`). | Core changelog, minor change 5 (L38) |
| Every result carries `resultType`. A missing one from an older server reads as `"complete"`. | Core changelog, major change 8 |
| `tools/list` "**MUST NOT** vary per-connection or as a side effect of other requests on the connection. The set **MAY** vary by the authorization presented on the request." | [Core server/tools.md](https://modelcontextprotocol.io/specification/2026-07-28/server/tools.md) L62-69 |
| "Servers that need cross-call state use explicit, server-minted handles passed as ordinary tool arguments." | Core changelog, major change 1 (L14) |
| `resources/subscribe` and `resources/unsubscribe` are replaced by `subscriptions/listen`. | Core changelog, major change 4 (L20) |
| `ping`, `logging/setLevel` and `notifications/roots/list_changed` are removed. Roots, Sampling and Logging are deprecated (SEP-2577). Removal is due in the "First revision released on or after 2027-07-28". | Core changelog, major change 5; [deprecated.md](https://modelcontextprotocol.io/specification/2026-07-28/deprecated.md) L28-30 |
| Server-initiated `sampling/createMessage` and `elicitation/create` give way to Multi Round-Trip Requests. | Core changelog, major change 7 |
| Tasks move out of core into the `io.modelcontextprotocol/tasks` extension, which replaces the blocking `tasks/result` method. [D]'s long-running app tools section (L1900) still links the older core Tasks. | Core changelog, major change 6 (L24) |

**Compatibility between eras** ([versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning.md), "Backward Compatibility with Initialization-Based Versions" L128 and `#compatibility-matrix` L161):

- Releases "`2025-11-25` and earlier" are "Legacy".
- "Dual-era | Legacy: Works ... falls back to `initialize`". "Modern | Legacy: Fails".
- A stdio dual-era client probes `server/discover` and falls back "on any error that is not a recognized modern error" (L138-139).
- The supporting side "MUST either revert to core protocol behavior or reject" (SEP-2133 L220; versioning L123-124).

**Unknown:** whether a `2026-07-28` server may vary `tools/list` by the per-request `clientCapabilities`. tools.md covers only connection state and authorization. If a server does filter, `cacheScope: "private"` keeps shared intermediaries from caching the filtered list (changelog minor change 5).

### Claude Code's MCP client

- Claude Code has two MCP runtimes. v2 is built on TS SDK 2.0 and adds protocol `2026-07-28`. It is the default from v2.1.232 where feature flags are fetched, otherwise from v2.1.274 ([code.claude.com mcp.md](https://code.claude.com/docs/en/mcp.md) #mcp-client-runtimes L318-340).
- Which MCP Apps capability Claude Code, Claude desktop or Codex sends to a server is not documented. See [Unknown, and how to check](#unknown-and-how-to-check).

## The view's protocol

### Transport and handshake

- JSON-RPC 2.0 over `postMessage` ([S] L413). "Hosts act as MCP servers (that can proxy the actual MCP server)" ([S] L468). No SDK is required ([S] L426).
- The view sends `ui/initialize` with `appCapabilities`, `appInfo` and `protocolVersion` ([S] L512). The host replies with `protocolVersion`, `hostCapabilities`, `hostInfo` and `hostContext` ([S] L593-619). The view then sends `ui/notifications/initialized`.
- **Web hosts only:** "The Host MUST NOT send any request or notification to the View before it receives an `initialized` notification" ([S] L485, item 6 of the list headed "If the Host is a web page"). For other hosts the only timing rule is that tool input comes "after the View's initialize request completes" ([S] L1106, L1118).

### App capabilities (sent by the view)

| Field | Meaning | Source |
| --- | --- | --- |
| `experimental` | `{}` in stable, `Record<string, object>` in draft | [S] L517; [D] L552 |
| `tools{listChanged}` | "App exposes MCP-style tools that the host can call". The draft says "the host and agent can call". | [S] L519-522; [D] L2289 |
| `availableDisplayModes` | Typed optional, but "View MUST declare all display modes it supports" | [S] L781 |

[D] requires the matching handlers: "Apps MUST implement `oncalltool` handler if they declare `tools` capability" ([D] L1281), and the same for `onlisttools` ([D] L1324). The SDK refuses to register those handlers unless `tools` is declared ([SDK] `src/app.ts#L1245-L1254`).

### Host capabilities (returned to the view)

| Field | Stable | Draft | Source |
| --- | --- | --- | --- |
| `experimental` | yes | yes (`Record<string, object>`) | [S] L628-666; [D] L681 |
| `openLinks` | yes | yes | [S] L628-666 |
| `serverTools{listChanged}` | yes | yes | [S] |
| `serverResources{listChanged}` | yes | yes | [S] |
| `logging` | yes | yes | [S] |
| `sandbox{permissions, csp}` | yes | yes | [S] L646-665 |
| `downloadFile` | no | yes | [D] L684-685 |
| `updateModelContext` (content modalities) | no | yes | [D] L723 |
| `message` (content modalities) | no | yes | [D] L725 |
| `sampling{tools}` | no | yes | [D] L727-730 |

Modalities are text, image, audio, resource, resourceLink and structuredContent ([D] L664-678). The stable spec has no flag for `ui/message` or `ui/update-model-context`, so a view on a stable-only host cannot detect them before calling [inference].

### Host context

Fields ([S] L536-588; [SDK] `src/spec.types.ts#L340-L408`), all optional:

- `toolInfo{id, tool}`: "Metadata of the tool call that instantiated this App". `id` is the "JSON-RPC id of the tools/call request" ([SDK] `src/spec.types.ts#L343-L349`). It is not a conversation id. [inference] A view that no `tools/call` created, such as a Codex thread tab, may get no `toolInfo` at all.
- `theme` (`light` or `dark`), `styles{variables, css.fonts}`.
- `displayMode`, `availableDisplayModes`, `containerDimensions` (`height` or `maxHeight`, `width` or `maxWidth`).
- `locale` (BCP 47), `timeZone` (IANA), `userAgent`, `platform` (`web`, `desktop` or `mobile`), `deviceCapabilities{touch, hover}`, `safeAreaInsets`.
- An index signature allows extra fields.

`ui/notifications/host-context-changed` carries only changed fields ([S] L1219; [SDK] `src/spec.types.ts#L414-L418`). The SDK merges top-level keys only: `{ ...this._hostContext, ...eventParams }` ([SDK] `src/app.ts#L499-L501`). So an update carrying `styles` replaces all of `styles`.

### Theming variables

- [S] L795-888 lists 76 standard CSS variables: color background, text, border and ring; font family, weight, size and line height; border radius; border width; shadows. [SDK] `src/spec.types.ts#L44-L144` has 70 keys. See [Where sources disagree](#where-sources-disagree).
- Spacing is excluded on purpose ([S] L1643). Hosts "should use the CSS `light-dark()` function" ([S] L895). Views "should set default fallback values" ([S] L899). Fonts come through `styles.css.fonts` as `@font-face` or `@import` ([S] L922).

### Methods, view to host

| Method | What it does | Spec | Source |
| --- | --- | --- | --- |
| `ui/initialize`, `ui/notifications/initialized` | Handshake | Stable | [S] L512 |
| `tools/call`, `resources/read`, `notifications/message` | Proxied to the server | Stable | [S] L493-503 |
| `ping` | Liveness | Stable | [S] L508 |
| `ui/open-link` | "Host SHOULD open the URL in the user's default browser or a new tab." | Stable | [S] L965, L996 |
| `ui/message` | Adds a message to the conversation. See below. | Stable | [S] L998-1034 |
| `ui/request-display-mode` | Asks for `inline`, `fullscreen` or `pip`. The host returns the mode it set. | Stable | [S] L1036 |
| `ui/update-model-context` | Sets context for the model's next turn. See below. | Stable | [S] L1061-1102 |
| `ui/notifications/size-changed` | Reports the view's size | Stable | [S] L1204 |
| `tools/list` | Lists server tools | Draft | [D] L518-526 |
| `ui/download-file` | Host-mediated download, since "direct file downloads are blocked (`allow-downloads` is not set)" | Draft | [D] L1066, L1123 |
| `ui/notifications/request-teardown` | Asks to close. "Host MAY defer or ignore the teardown request." | Draft | [D] L1445, L1458 |
| `sampling/createMessage` | Asks the host's model. "Apps MUST check `hostCapabilities.sampling` before sending this request". "The host has full discretion over model selection". | Draft | [D] L534 |

### Methods, host to view

| Method | Rule | Source |
| --- | --- | --- |
| `ui/notifications/tool-input` | Sent "at most once and is required before sending `ui/notifications/tool-result`" | [S] L1106, L1118 |
| `ui/notifications/tool-input-partial` | Zero or more times. "Use partial data only for preview UI". | [S] L1120; [SDK] `docs/patterns.md#L624` |
| `ui/notifications/tool-result` | "Host MUST send this notification when tool execution completes (if the View is displayed during tool execution)." | [S] L1145, L1155 |
| `ui/notifications/tool-cancelled` | "Host MUST send this if tool execution was cancelled for any reason" | [S] L1157; [SDK] `src/spec.types.ts#L306-L317` |
| `ui/notifications/host-context-changed` | Partial update | [S] L1219 |
| `ui/resource-teardown` | A request with an id. "Host MUST send this notification before tearing down ... Host SHOULD wait for a response before tearing down the resource (to prevent data loss)." | [S] L1171, L1201-1202 |
| `tools/call`, `tools/list` into the view | Draft only. Apps "MAY filter tools based on context or permissions". | [D] L1239-1330, L1326 |

### `ui/message`

- Params are `{role: "user", content: {type: "text", text}}` ([S] L998-1034). `role` is "currently only "user"" ([SDK] `src/spec.types.ts#L208-L230`).
- "Host SHOULD add the message to the conversation context, preserving the specified role." "Host MAY request user consent." ([S] L1033-1034). The error example is "Message sending denied".
- These messages "also trigger follow-ups" ([S] L1094).
- `AppBridge.onmessage` guidance: "For security, the host should NOT return conversation content or follow-up results to prevent information leakage" ([SDK] `src/app-bridge.ts#L791-L794`, source only, not on the hosted page).
- **Codex wraps it as untrusted input.** The thread gets a turn whose user text is "An MCP app initiated this message. Read the untrusted_input tool output.", and the model reports the text instead of following it (verified live in this repo, `docs/plans/codex-plugin.md:55`, `:333`).
- **Claude:** the pages say only that widgets push "messages to Claude" (MA instance-supersession, intro). Behavior is unknown.

### `ui/update-model-context`

- Takes `content?` and `structuredContent?` ([S] L1061-1102).
- "Each request overwrites the previous context sent by the View" ([S] L1093). The host-behavior list softens this: the host "MAY overwrite the previous model context with the new update" (L1098) and "MAY dedupe identical ... calls" (L1100).
- The host "SHOULD provide the context to the model in future turns" and "MAY defer sending the context to the model until the next user message (including `ui/message`)". "If multiple updates are received before the next user message, Host SHOULD only send the last update" ([S] L1101).
- SDK wording: "available to the model in future turns, without triggering an immediate model response" ([SDK] `src/app.ts#L1590-L1656`).
- The SDK docs suggest YAML front matter: "Structure the content with YAML frontmatter for easy parsing" ([SDK] `docs/patterns.md#L455`).
- Claude calls it "the data a widget feeds into Claude's context for the next turn" (MA instance-supersession, intro). Codex support is unknown.

### Display modes and sizing

- Modes are `inline` (default), `fullscreen` and `pip` ([S] L740-789). The host "MUST NOT switch the View to a display mode that does not appear" in `availableDisplayModes`, "if set" ([S] L786).
- "When using flexible dimensions ... hosts MUST listen for `ui/notifications/size-changed`" ([S] L718).
- The SDK sends size reports automatically when `autoResize` is on. It measures height with `max-content`, debounces with `requestAnimationFrame`, and sends only on change ([SDK] `src/app.ts#L1861-L1965`).
- A zero height means an invisible app in Claude, for example from `sendSizeChanged({ width, height: 0 })` (MA [troubleshooting](https://claude.com/docs/connectors/building/mcp-apps/troubleshooting.md) #iframe-has-zero-height).

### Lifecycle

- Order: discovery (`tools/list`, `resources/list`), render the iframe, `ui/initialize`, `initialized`, tool input (optionally partial), tool result or cancel, interactive phase, `ui/resource-teardown` ([S] L1272-1383).
- Desktop and native hosts render the iframe directly. Web hosts use a proxy ([S] L1288, L1301-1308).
- "Cleanup may be triggered at any point in the lifecycle following View initialization" ([S] L1383).
- [D] adds: "Views may request teardown by sending `ui/notifications/request-teardown` to the Host. In any case, the Host MUST send `ui/resource-teardown` to allow the View to terminate gracefully" ([D] L1615).
- "State persistence and restoration" and "View-to-View communication" are listed as future work ([S] L1573, L1575).
- Draft rules for tools a view registers: "Hosts MUST NOT persist app tool registrations across sessions." "Calling a tool from a closed app MUST return an error." ([D] L2639-2644). They exist "Only while app is loaded" ([D] L2142). Suggested limits: 50 tools, 30 s timeout, 10 MB result ([D] L2612-2614).
- [D] advises long work through `callServerTool()` "so the host can continue polling the server after teardown" ([D] L1900).
- The SDK docs' pattern for live data is an app-only tool "that the App polls at regular intervals", stopped in `onteardown` ([SDK] `docs/patterns.md#L40-L80`).
- The SDK docs' pattern for view state: `localStorage` keyed by a server-issued `viewUUID` in `CallToolResult._meta`, and "user effort" state saved server-side through app-only tools ([SDK] `docs/patterns.md#L503-L568`).

## Security

- **Iframe sandbox is mandatory.** "All View content MUST be rendered in sandboxed iframes with restricted permissions" ([S] L1698).
- **Default CSP when `ui.csp` is omitted:** "`default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; connect-src 'none';`" ([S] L274-284). [D] adds `object-src 'none'` ([D] L292). [inference] It has no `font-src`, so external fonts fall back to `default-src 'none'`.
- **No loosening.** "Host MAY further restrict but MUST NOT allow undeclared domains" ([S] L286). "Host MUST block connections to undeclared domains" ([S] L1756).
- **Web hosts use a sandbox proxy.** "If the Host is a web page, it MUST wrap the View ... through an intermediate Sandbox proxy." The host and proxy have different origins; the proxy has `allow-scripts allow-same-origin` ([S] L472-487).
- **The host may filter what it forwards.** The host "MAY forward any message from the View ... for any method that doesn't start with `ui/`... MAY decide to block some messages or subject them to further user approval" ([S] L487).
- **Transport source check.** `PostMessageTransport` drops messages whose `event.source` is not the expected window, and its doc calls `eventSource` "required" ([SDK] `src/message-transport.ts#L19-L21`). The check runs only `if (eventSource && ...)` (`#L76`), so a falsy value turns it off. It sends with `postMessage(message, "*")` (`#L118-L131`).
- **What the sandbox blocks** ([apps/overview](https://modelcontextprotocol.io/extensions/apps/overview.md) #security-model L135-148): "accessing the parent window's DOM, reading the host's cookies or local storage".
- **Downloads** are blocked in the iframe; [D]'s `ui/download-file` host "SHOULD show a confirmation dialog" and "MAY reject the download" ([D] L1123, L1128-1131).

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
| Codex in the ChatGPT desktop app | Yes, including a thread tab from a local stdio plugin server | Verified live in this repo, `docs/plans/codex-plugin.md:53-54` |
| Codex CLI | No. The `enable_mcp_apps` flag is off. | Verified live in this repo, `docs/plans/codex-plugin.md:53` |
| ChatGPT (web, desktop, mobile) | Yes. ChatGPT supports "the open MCP Apps UI standard". | [doc] [OpenAI plugin architecture](https://developers.openai.com/plugins/concepts/plugins), "Optional UI" |
| Others ticked in the matrix | VS Code GitHub Copilot, Microsoft 365 Copilot, Goose, Postman, MCPJam, Cursor, Archestra.AI, PostHog Code | [doc] client matrix L30-45 ("maintained by the community", L15-17) |

Neither Claude Code nor Codex appears in the client matrix or in [apps/overview](https://modelcontextprotocol.io/extensions/apps/overview.md) #client-support (L176-179).

## Claude

### Routes into Claude mode

- **URL connectors cannot reach the Mac.** "Claude connects to your remote MCP server from Anthropic's cloud infrastructure, rather than from your local device. This is true across every Claude client, including claude.ai, Claude Desktop, Cowork, and the mobile apps" ([support 11175166](https://support.claude.com/en/articles/11175166), "Network requirements"). "a `localhost` address isn't reachable that way" (MA quickstart #see-the-ui-render-in-claude).
- **`claude_desktop_config.json` is local.** Servers there "are a separate mechanism and do use your local network, but those aren't available in Cowork or claude.ai" (support 11175166). "A server you define in `claude_desktop_config.json` is available in both the Desktop chat surface and local Code tab sessions" ([desktop.md](https://code.claude.com/docs/en/desktop.md) L995-999). The standalone CLI does not read it (L1002).
- **A `.mcpb` desktop extension is local.** It "runs on your computer in the Claude desktop app" ([connectors getting-started](https://claude.com/docs/connectors/getting-started) #where-connectors-work) over stdio ([mcpb](https://claude.com/docs/connectors/building/mcpb)). Directory listings for `.mcpb` "are deprecated".
- **A plugin's local MCP server does not reach Chat.** Chat: "Ignored". Cowork: "Loads when the Cowork session runs on your computer" (platform-support #compare-component-support-by-app).
- **A stdio proxy can bridge.** "To test a remote MCP App locally, connect to it through a proxy such as [mcp-remote]" (MA getting-started #build-your-own-mcp-app). [inference] A config-file proxy can reach an HTTP server on `localhost`.
- [inference] A Claude-mode inbox is desktop-only, because only the desktop app runs a local server.

### Consent and setup

- "Claude asks for permission to display the app. Click **Allow**, or **Always allow** for a server you trust" (MA getting-started #ask-claude-to-use-the-app).
- HELP says instead: "Interactive connectors are default on when you have the relevant connector enabled. No additional setup is needed."
- The connector must be "enabled for your current conversation" (HELP, Troubleshooting).
- Team and Enterprise owners "can disable the specific tool calls that render interactive connectors" (HELP).
- Tool calls themselves can ask for approval, with Allow once or Always allow (connectors getting-started #use-the-connector-in-a-conversation).

### Identity and instances

- No conversation id is given. The suggested key is one the server mints, "such as a UUID minted once per client connection, and return it in `structuredContent`" (MA instance-supersession #channel-scope-and-ui-domain).
- "On claude.ai on the web, `hostContext.toolInfo.id` is the stable tool-use ID". "On Claude iOS, `toolInfo.id` is `undefined` when a stored conversation is rehydrated" (#cache-the-key-across-remounts). Desktop and Android are not covered.
- "Each time Claude calls a tool that renders an MCP App, Claude mounts a separate iframe in the conversation. No host API unmounts earlier instances" (intro). "Each copy independently pushes model-context updates ... and messages to Claude."
- "Client mount time doesn't reflect tool-call order" because stored conversations lazy-mount widgets as they scroll into view (#understand-why-the-key-comes-from-the-server).
- "Tool results are stored in the conversation transcript, so every device and every remount of the widget sees the same key" (#understand-how-supersession-works). [inference] A remount gets the stored result, so live data must come from app-initiated calls.
- The page's pattern: elect the newest copy over a BroadcastChannel, and have superseded copies stop calling `updateModelContext` and `sendMessage` themselves (#gate-host-mutating-calls-on-superseded).
- A hand-written bridge "silently drops requests the host sends ... such as `ping` ... and `ui/resource-teardown`". "claude.ai on the web doesn't send either to widgets, and Claude iOS sends `ui/resource-teardown` only when the user navigates away from the conversation" (#if-you-bypass-the-sdk-app-class). Desktop is not covered.

### Sandbox origin

- "Claude serves all widget iframes from a single connector from the same sandbox origin on `*.claudemcpcontent.com`, and the iframe sandbox includes `allow-same-origin`" (MA instance-supersession #understand-how-supersession-works).
- "Without `ui.domain` ... Claude derives the iframe origin from the conversation and connector". "With a fixed `ui.domain`: the origin is shared across every conversation and tab for your connector" (#channel-scope-and-ui-domain).
- "For Claude, the value is the first 32 hex characters of the SHA-256 of your server URL, followed by `.claudemcpcontent.com`" (MA getting-started #set-ui-domain-for-claude).
- "local connectors have no URL to hash, so `ui.domain` isn't available for them. Remove the field" (MA troubleshooting #ui-domain-validation-fails). [inference] A local inbox view's `localStorage` and BroadcastChannel are per conversation.
- On desktop, the app is "an iframe nested inside another iframe" (MA troubleshooting #claude-desktop).

### Display modes and design guidance

These are guidelines. Whether Claude enforces them is unknown.

| Mode | Guidance | Source |
| --- | --- | --- |
| Inline card | "Height auto-fits to content, with no nested scrolling". "At most 2 actions". "At most 4-5 data points". "No drill-ins, breadcrumbs, or multiple views". "No menus or popovers". | MA design-guidelines #inline-card |
| Inline carousel | 3-8 items, each with image, title, up to 3 lines of metadata and 1 optional CTA | #inline-carousel |
| Full screen | "The composer is always visible". "Your app provides its own fullscreen button, and a close button appears in the native header bar". "No floating panels, so use collapsible sidebars, tabs, or pagination". | #full-screen |
| `pip` | Named as a protocol mode. No Claude behavior described. | #declare-supported-display-modes |

- "The inline card might show a summary, and fullscreen mode can offer the detailed view" (#reveal-complexity-progressively).
- "If the interaction requires language understanding or generates a response from Claude, it goes through chat." "Text entry and freeform input" belongs in chat (#decide-between-app-and-chat-interactions).
- "Apps always fill the container width"; design "from 320px up to fullscreen" (#host-context-for-layout).
- "On mobile touch devices, the conversation view owns vertical scrolling" and "the host also caps inline height and clips content" (#scrolling-and-gestures). Web and desktop height caps are not stated.
- "on web and desktop the composer can overlay the bottom of an inline app"; read `safeAreaInsets` (#safe-areas).
- If `prefersBorder` is unset, content "renders borderless on web and bordered on mobile" (#borderless-inline-content).
- "Closing fullscreen returns to the conversation at the same scroll position" (#transitions).

### Links

- "When your MCP App sends a `ui/open-link` request, Claude shows an Open external link confirmation modal". "Custom connectors and locally configured servers always show it" ([MA external-links](https://claude.com/docs/connectors/building/mcp-apps/external-links.md), intro).
- "If the user confirms, the link opens in a new tab. If they dismiss the modal, the request resolves as cancelled" (#default-link-behavior). What a confirmed request resolves with is not stated.
- Only directory connectors can skip the modal, through an allowlist (#allowlist-link-destinations).

### Theming

- "every frame between your widget and the chat surface already has a transparent background" (MA transparent-theming, intro).
- Set `html, body { background: transparent }`, add `<meta name="color-scheme" content="light dark">`, and set `prefersBorder: false` (#let-the-host-background-show-through). The meta tag "covers the first paint before your script runs and prevents an opaque-backdrop flash" (#read-hostcontext-and-listen-for-changes).
- `styles.css.fonts` carries Anthropic Sans `@font-face` from `https://assets.claude.ai`. Allow it with `resourceDomains`, which "also adds the listed origins to `script-src` and `style-src`" (#allow-the-host-font-origin-in-your-csp).
- The token tables (colors, `font-sans` "Anthropic Sans, sans-serif", `font-mono` "ui-monospace, monospace", radii 4-12px and 9999px, `border-width-regular` 0.5px, four shadows) are in MA design-guidelines #style-variables.

### Limits and unsupported features

- "Claude implements a subset of the MCP specification, with its own callback URL and its own size and timeout limits" (BI #plan-your-server).
- Tool result: "~150,000 characters" on claude.ai and Desktop. Tool call: "240 seconds per tool call" (BI #design-within-the-size-and-timeout-limits).
- Above about 150,000 characters with the code sandbox on, the app gets a file pointer "so it never hydrates" (MA troubleshooting #app-doesnt-render-when-tool-results-are-large).
- "When an MCP App doesn't render or load correctly in Claude, the tool call usually still appears in the conversation" (MA troubleshooting, intro). So a visible tool call does not prove the view rendered.
- "Claude doesn't yet support these MCP features ...: Resource subscriptions, Sampling, Advanced or draft capabilities" (BI #decide-what-the-server-exposes). BI is written for remote servers. Whether a local stdio server gets the same subset is unknown.
- Claude's quickstart was "verified with `@modelcontextprotocol/ext-apps@1.7.5`" and `@modelcontextprotocol/sdk@1.30.1` (MA quickstart #install-the-mcp-apps-sdk).

## Claude Code

- **UI resources are hidden from listings, not from reading.** "They don't appear in the `@` suggestions or in the resource list tool's results, and a server that offers only UI resources shows an empty resource list. Reading a UI resource by its URI still works" ([mcp.md](https://code.claude.com/docs/en/mcp.md) #use-mcp-resources L1430). Added in 2.1.281 ([changelog](https://code.claude.com/docs/en/changelog.md)).
- **SDK hosts can render widgets.** `readMcpResource(serverName, uri)` is "*Alpha.* Reads one MCP Apps `ui://` resource from a connected MCP server so your application can render a tool's widget". It needs TS Agent SDK v0.3.280 or later and the capability `mcp_read_resource_v1`. It strips `_meta` keys under `com.anthropic/`. "The contents are untrusted third-party HTML, so render them in a sandbox" ([agent-sdk/typescript.md](https://code.claude.com/docs/en/agent-sdk/typescript.md) L642, L1052-1056).
- **SDK hosts see a tool's UI metadata.** `_meta` on a tools entry passes through `ui` (`resourceUri`, `visibility`) and the deprecated `ui/resourceUri`, and "withholds every other key" (typescript.md #mcpserverstatus L4836).
- **The desktop app is an SDK host** ("an Agent SDK application or the desktop app", mcp.md L87). The Code tab allowlists `*.claudemcpcontent.com` (desktop.md #network-access-requirements). [inference] The Code tab has what it needs to render MCP Apps. No code.claude.com page says it does.
- "Claude Desktop and claude.ai also render some tool results inside a conversation as interactive widgets, such as the MCP Apps some connectors provide" ([network-config.md](https://code.claude.com/docs/en/network-config.md) #desktop-and-claude-ai L260). No tab is named.
- **Tool search.** "Only tool names and server instructions load at session start". Each tool description and server's instructions is cut at 2,048 characters. `_meta["anthropic/alwaysLoad"]: true` loads a tool upfront (mcp.md L1434-1548).
- **Long calls.** An MCP call still running after two minutes moves to a background task in the main conversation, except for subagents, IDE servers, and non-interactive runs unless `CLAUDE_AUTO_BACKGROUND_TASKS` is set to `1` (mcp.md L430-444).
- **Output caps.** 25,000 tokens by default (`MAX_MCP_OUTPUT_TOKENS`). Text over 50,000 characters is saved to a file (mcp.md L1271-1316).
- **No conversation id.** The docs give an MCP server `CLAUDE_PROJECT_DIR` and `roots/list`, nothing per session [inference from absence].

## Codex and the ChatGPT Apps SDK

- **Codex renders standard MCP Apps plus its own placement key.** The inbox's `inbox` tool sets `_meta.ui.resourceUri` and `'openai/ui': { entrypoints: [{ type: 'thread' }] }` (`codex/src/server.ts:38`). `thread` opens the app as a tab in a thread; `global` as a sidebar entry. Only `thread` is verified (verified live in this repo, `docs/plans/codex-plugin.md:54`).
- **Codex renders the tab without the server declaring the extension.** The server's `initialize` reply is `capabilities: { tools: {}, resources: {} }` (`codex/src/server.ts:196`). [inference] Codex does not enforce the both-sides rule in the client matrix L13.
- **`ui/message` becomes untrusted input** (verified live in this repo, `docs/plans/codex-plugin.md:55`, `:333`). The spec's "SHOULD ... preserving the specified role" ([S] L1033) expects a user message. This is a SHOULD deviation, not a violation.
- **Resource subscriptions did not work from a thread tab** (verified live in this repo, `docs/plans/codex-plugin.md:56`). The tab polls instead.
- **Plugins with MCP servers are "Desktop only".** "Any imported plugin that declares MCP servers in `mcp.json` or `.mcp.json` is marked Desktop only and works only in the ChatGPT desktop app" ([plugin-management](https://learn.chatgpt.com/docs/enterprise/plugin-management) #desktop-only-plugins).
- **Public listing expects mobile support.** "Plugins must function reliably in ChatGPT on both desktop and mobile, including any UI components" ([plugin-guidelines](https://developers.openai.com/plugins/plugin-guidelines) #testing).
- **Headless use must work.** "Keep tools useful without the component so the model can complete headless workflows" (OpenAI plugin architecture, "Optional UI").
- **Domain format.** OpenAI's example is `www-example-com.oaiusercontent.com` ([S] L205-217).
- **Migration.** ext-apps ships a migrate-oai-app skill ([SDK] `docs/agent-skills.md#L11-L47`). The only hosted migration guide found is at the capitalized path `Migrate_OpenAI_App.html`, which serves the old v1.1.2 build. No current-build copy was located (curl check, 2026-10-08).

## The inbox's Codex tab against the spec

Code at `55ab122`.

| Area | What the code does | What the spec or SDK expects | Effect |
| --- | --- | --- | --- |
| Protocol era | Answers `initialize`, echoes the client's version or `2025-06-18` (`codex/src/server.ts:193-198`, `:195`). No `server/discover`; unknown methods get `-32601` (`:221`). Answers `ping` (`:216`). | `2026-07-28` removes `initialize` and `ping` and requires `server/discover`. | Works with legacy and dual-era clients. Fails with modern-only clients (versioning L169-171). |
| Extension declaration | No `extensions` in the reply (`:196`). Does not read the client's `extensions`. | Both sides declare (client matrix L13). Servers SHOULD check the client ([S] L1531). | Codex renders anyway. A stricter host might not [inference]. |
| Resource `_meta.ui` | `resources/list` and `resources/read` carry no `_meta` (`:211`, `:215`). | Set `prefersBorder` explicitly ([S] L222). Declare `csp` and `permissions` as needed. | Default CSP applies. No `clipboardWrite`, no `assets.claude.ai` font origin. |
| Legacy key | Only nested `_meta.ui.resourceUri` (`:38`). | `registerAppTool` also writes `ui/resourceUri` for older hosts. | Unknown whether any target host needs it. |
| App capabilities | `appCapabilities: { tools: {} }` and no `availableDisplayModes` (`codex/src/tab.tsx:889`). | Declaring `tools` requires `tools/list` and `tools/call` handlers ([D] L1281, L1324). Declaring display modes is a MUST ([S] L781). | Drop `tools` or implement it. Add `availableDisplayModes`. |
| Host requests | Answers every host request with `result: {}` (`tab.tsx:101`). | `ListToolsResult` needs `tools`; `CallToolResult` needs `content`. | Correct for `ping` and `ui/resource-teardown`. Malformed for `tools/*`. |
| Message source | Accepts JSON-RPC from any window (`tab.tsx:90-101`). | `PostMessageTransport` checks `event.source` ([SDK] `src/message-transport.ts#L76`). | [inference] Any frame able to post into the tab could answer its requests. |
| Size reports | Never sends `ui/notifications/size-changed`. | Hosts with flexible dimensions depend on it ([S] L718). | [inference] May collapse or clip inline in Claude. |
| Polling | `inbox_view` every 3 s (`tab.tsx:52`, `:173`), started after `initialized` (`:893-895`). Never stopped. | Stop polling in `onteardown` ([SDK] `docs/patterns.md#L40-L80`). | [inference] Polls until the iframe is destroyed. |
| Request timeout | None. | SDK default 60 s. | A lost reply hangs a press forever [inference]. |
| Theme | `applyHost` uses `theme` and `styles.variables` only (`tab.tsx:104`). `color-scheme` is set in CSS (`codex/src/tab.html:10`, `:36`, `:54`). The root paints `var(--bg)` (`:11`, `:72`). | Claude: transparent background, `<meta name="color-scheme">`, `styles.css.fonts`. | Opaque card and fallback font in Claude [inference]. |
| Clipboard | Falls back to manual copy because "The tab's frame may not get the clipboard" (`tab.tsx:202-205`). | `permissions.clipboardWrite`, which hosts "MAY honor". | Declare it and keep the fallback. |
| Session key | `sessionOf` reads Codex's `_meta["x-codex-turn-metadata"].session_id`, `thread_id` or `threadId` (`server.ts:73`). A call without one fails (`:158`). | The spec defines no conversation key. Claude sends none. | Every call fails in Claude as written. |
| Visibility | `APP_ONLY = { ui: { visibility: ['app'] } }` on `inbox_view` and `inbox_press` (`server.ts:28`, `:44`, `:54`). | Hiding depends on the host. | See `docs/plans/clients.md` I21 (`:443-456`). |

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

## Where sources disagree

| Topic | Sources | Which to trust |
| --- | --- | --- |
| Does the desktop Code tab render MCP Apps? | Cowork changelog v1.37937.0 (3P) says the Code tab gained MCP app widgets "already available in the standard app". MA quickstart says "Claude Code ... doesn't render the UI". code.claude.com is silent. | Neither. The quickstart is about the CLI; the changelog implies the standard Code tab renders. Check live. |
| Negotiation | [S] L1498, [D] L2185 and SEP-2133 use `initialize`. extensions/overview and core `2026-07-28` use per-request `_meta` and `server/discover`. Core adds `capabilities.extensions` in the same revision that removes `initialize`. | The spec for how hosts behave today is unknown. Support both: read `initialize` capabilities and per-request `_meta`. |
| Per-client tool lists | [S] L1531, L1560 and SEP-2133 L202-216 allow per-connection variants. Core tools.md L62-69 forbids per-connection variance. | Core for `2026-07-28` servers. Per-request capability variance is unknown. Do not rely on list filtering. |
| Style variables | [S] lists 76 keys. [SDK] `spec.types.ts` has 70. Claude's transparent-theming list has no `--shadow-*`, while design-guidelines lists four shadows. | Code against the SDK keys with fallbacks for all. |
| Persistence | apps/overview L123-131: "maintains a persistent connection", "state that persists across interactions". [S] L1573 lists persistence as future work; L1383 allows teardown at any time. | The spec. |
| `ui/update-model-context` | [S] L1093 "overwrites"; L1098 "MAY overwrite"; L1100 "MAY dedupe". | Treat each update as a full replacement and resend all of it. |
| `ui/message` handling | [S] L1033 expects a user-role message. Codex wraps it as untrusted (verified live in this repo). | The host decides. Do not use it to act as the person. |
| Link capability name | apps/overview L146 "`sendOpenLink` capability". [S] `openLinks`, method `ui/open-link`. The SDK's `sendOpenLink` is a deprecated alias of `openLink`. | The spec. |
| Visibility enforcement | [S] L400-401 MUST. The reference `AppBridge` does not check (`src/app-bridge.ts#L2015-L2021`). claude.com's MCP Apps pages never mention `visibility`. | Assume no host enforces it. |
| Web-host timing rule | [S] L485 forbids anything before `initialized`, but only for web hosts. [S] L1106 allows tool input after `ui/initialize` completes. | Register handlers before `connect()` either way. |
| Default CSP | [S] L283 `connect-src 'none'`; the spec's reference builder emits `connect-src 'self'` (L1737); the default omits `object-src 'none'` that the proxy rules require (L482). basic-host is looser still. `base-uri`: `'self'` in spec.types, `'none'` in basic-host. | The [S] L274-284 default, which is a MUST. Test under it, not under basic-host. |
| `mimeType` strength | [S] L95 SHOULD; L240, L268 MUST. | MUST. |
| `_meta.ui` placement | create-mcp-app skill: listing-level is a mistake. SDK and [D] L270: listing is a fallback. | Put it on the `resources/read` content item. |
| Display modes in Claude | HELP: "two ways" (inline cards, fullscreen). Design-guidelines: inline card, carousel, full screen. Protocol: `inline`, `fullscreen`, `pip`. | Carousel is a layout, not a mode [inference]. `pip` in Claude is unknown. |
| Local testing in Claude | build.md L431-434: "For local development, you'll need to expose your server to the internet" with a tunnel and a custom connector, which "are available on paid Claude plans (Pro, Max, or Team)" (L448). MA getting-started #try-an-example-mcp-app-in-claude-desktop documents a local `claude_desktop_config.json` route with no tunnel. | MA getting-started, the host's own page. build.md is outdated here. |
| MCP Inspector page | The `2026-07-28` recipes page still says `--advertise-apps` claims support "at `initialize`" and assumes "a server that shows its app tools only to app-capable clients" (L74). Its sample output uses `"clipboard"` and `"text/html"` (L84-86). [S] uses `clipboardWrite` and `text/html;profile=mcp-app`. | The spec for field names. The page is partly outdated, and still treats per-client tool filtering as normal. |
| Consent to display | HELP: "No additional setup is needed". MA getting-started: Claude asks to Allow. | MA getting-started, the more specific page. Check live. |
| Iframe or WebView | HELP and transparent-theming: sandboxed iframes. Design-guidelines: mobile uses "a native WebView ... rather than a sandboxed iframe". | Design-guidelines for mobile. |
| Desktop app naming | desktop.md L9 "three tabs: Chat, Cowork, Code"; HELP names "Claude, Cowork, Claude Desktop"; `docs/plans/clients.md:22` says two modes, Claude and Code. The Cowork changelog (v2.31226.0, 3P) says "Unified Claude ... combines Chat and Cowork" and turns on for all orgs on November 10. | The public docs are outdated for orgs on Unified Claude. Map Claude mode to Chat plus Cowork when reading docs. |
| SDK versions | Claude quickstart verified with ext-apps 1.7.5 and `@modelcontextprotocol/sdk` 1.30.1. ext-apps is now 2.0.3 on split `@modelcontextprotocol/client`/`core`. | The wire protocol is unchanged ([SDK] `docs/migrate-to-2.md#L14-L18`), so either works for the view. |
| Skill install command | claude.com: `/plugin install mcp-apps@mcp-apps`. ext-apps: `/plugin install mcp-apps@modelcontextprotocol-ext-apps`. | Unknown; the marketplace name decides. |
| Hosted SDK docs | Capitalized paths such as `Quickstart.html` serve a frozen v1.1.2 build; lowercase paths serve 2.x. The old github.io host 301-redirects by path. Both report the same `last-modified`. | Use lowercase `apps.extensions.modelcontextprotocol.io/api/` URLs. |
| Hosted API pages | Class pages omit `on*` setter doc comments, such as the `onmessage` leakage rule and `onteardown`'s wait. | The source at `82221c0`. |
| `useApp` | JSDoc: the App "is NOT closed on unmount"; the cleanup calls `close()` ([SDK] `src/react/useApp.tsx#L78-L82` vs `#L179-L182`). | The code. |
| `callServerTool` signature | build.md L388 passes an object; [D] L2115 passes positional arguments. | The SDK source, which takes `({name, arguments}, options)` ([SDK] `src/app.ts#L1285-L1328`). |
| Spec examples' versions | [S] uses `2026-01-26`, [D] `2025-06-18`, negotiation samples `2024-11-05`. `McpUiInitializeResult` comment says `2025-11-21` ([SDK] `src/spec.types.ts#L571`). | `LATEST_PROTOCOL_VERSION` is `2026-01-26`. |
| `externalIframes` | SEP-1865 L148 names it; neither spec file defines it. | Treat as not existing. |
| Draft sampling vs core | [D] adds view-side `sampling/createMessage`; core `2026-07-28` deprecates Sampling. Both spec files keep `ping` and `logging`, which core removed or deprecated. | Do not build on view-side sampling. |
| Working group rule | SEP-2133 L74 "SHOULD"; extensions/overview L95 "must". | Not relevant to the inbox. |
| Repo plans | `docs/plans/clients.md:42` cites `codex/src/server.ts:139` for the no-session failure; it is now `:158`. `clients.md:38`, `:42`, `:43`, `:49` list conversation id, push and placement as unknown; the docs now answer them (none, poll, no persistent mode). `clients.md:29` says Claude mode has no Claude Code session, but Cowork sessions run Claude Code (desktop.md L825, L853). | The docs and current code. Whether mods run in Cowork is still unknown. |

## Unknown, and how to check

Each check uses a small local stdio test server (a `ui://` tool plus logging), unless it says otherwise.

1. **Does the desktop Code tab render MCP Apps?** Add the server to a project's `.mcp.json`, call the tool in a local Code-tab session, and look for an Allow prompt, a widget and requests to `*.claudemcpcontent.com`.
2. **Does Claude mode render the inbox's existing Codex server?** Point `claude_desktop_config.json` at `codex/plugin/dist/server.mjs`, ask Claude to call `inbox`, and inspect the nested iframe in Developer Tools (Help > Troubleshooting > Enable Developer Mode). Try again with `extensions: {"io.modelcontextprotocol/ui": {}}` in the `initialize` reply.
3. **What does each client send at connect time?** Log raw stdin in `codex/src/server.ts` for Codex, Claude mode and the Code tab. Look for `initialize` with `capabilities.extensions["io.modelcontextprotocol/ui"]`, per-request `_meta` capabilities, and `server/discover` probes.
4. **Which host capabilities and context does each host return?** Log the `ui/initialize` result in `codex/src/tab.tsx`. Look for `message`, `updateModelContext`, `openLinks`, `sampling`, `downloadFile`, `availableDisplayModes`, `containerDimensions`, `platform`, `styles.css.fonts` and `toolInfo`.
5. **Do hosts hide and block app-only tools?** Ask the model in each host to list or call `inbox_press`. From the tab, `tools/call` a tool marked `visibility: ["model"]` and see whether the host rejects it.
6. **What do `ui/message` and `updateModelContext` do in Claude?** Send "Reply with OK" from a button while Claude is idle and while it is busy. Push a marker string with `updateModelContext`, then ask Claude in the next turn what context the app supplied. Repeat `updateModelContext` in Codex.
7. **Does Claude grant `pip`, or any mode beside the conversation?** Declare `availableDisplayModes: ["inline", "fullscreen", "pip"]`, log the reply, and call `requestDisplayMode` for each.
8. **Does inline sizing work without size reports?** Render the tab inline in Claude and in basic-host or the MCP Inspector, with and without `ui/notifications/size-changed`.
9. **Does the desktop app send `ping` or `ui/resource-teardown`, and when?** Log every host request in the tab's catch-all (`tab.tsx:101`) while scrolling away, closing the conversation and switching modes. Same in Codex for tab close and thread switch.
10. **Is a local server one process per conversation or one shared process?** Log the PID and an `initialize` counter across two Claude-mode conversations. This decides what a "per connection" key means.
11. **Do the unsupported-features list and the 240 s timeout apply to local servers?** From the test server, send `notifications/resources/updated`, attempt `sampling/createMessage`, and time a 300 s tool.
12. **Where does the view's storage live?** Write a timestamp to `localStorage` in one view, then read it in a later view in the same conversation and in a new one, in Codex and in Claude.
13. **What does a confirmed `ui/open-link` resolve with for a local server?** Log the response for confirm and for dismiss.
14. **Does `clipboardWrite` work?** Add `_meta.ui.permissions.clipboardWrite` to the `resources/read` content and call `navigator.clipboard.writeText` in Codex and Claude.
15. **Is `toolInfo.id` stable on desktop?** Reopen a stored conversation and log `getHostContext().toolInfo`.
16. **Can a local test host run a stdio server?** basic-host cannot. Try the MCP Inspector's Apps screen with the stdio server. If it fails, an HTTP shim is needed for spec-compliance tests.
17. **Will ext-apps publish a version for core `2026-07-28`?** Watch `specification/` in `modelcontextprotocol/ext-apps` for a new dated folder.
18. **May a `2026-07-28` server vary `tools/list` by per-request capabilities?** Search the SEP-2567 and SEP-2575 discussions.

## Sources

MCP Apps specification and governance (read 2026-10-08):

- `https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx`: the stable spec.
- `https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx`: the draft spec.
- SEP-1865 (MCP Apps) and SEP-2133 (Extensions), under `https://modelcontextprotocol.io/seps/`, plus `https://modelcontextprotocol.io/seps/index.md`: status, negotiation examples, extension rules.
- Issue #1724 ("SEP-1724: Extensions", closed), read with `gh issue view 1724`.
- `https://modelcontextprotocol.io/extensions/overview.md`: extension negotiation and evolution.
- `https://modelcontextprotocol.io/extensions/client-matrix.md`: which clients support which extensions.
- `https://modelcontextprotocol.io/extensions/apps/overview.md`: MCP Apps overview, security model, client list.
- `https://modelcontextprotocol.io/extensions/apps/build.md`: build guide and Claude testing path.
- `https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/recipes.md`: MCP Inspector Apps support.

Core MCP `2026-07-28`:

- `https://modelcontextprotocol.io/specification/2026-07-28/changelog.md`: removal of `initialize`, list caching, subscriptions, handles.
- `https://modelcontextprotocol.io/specification/2026-07-28/deprecated.md`: Roots, Sampling and Logging deprecation.
- `https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning.md`: era compatibility and extension negotiation.
- `https://modelcontextprotocol.io/specification/2026-07-28/server/tools.md`: rules on `tools/list` variance.

ext-apps SDK (commit `82221c0c8ce7661efa6771c9d461511b1650495f`):

- `README.md`, `package.json`, `LICENSE`, `RELEASES.md`: package, exports, hosts, license.
- `src/app.ts`, `src/app-bridge.ts`, `src/spec.types.ts`, `src/constants.ts`, `src/message-transport.ts`, `src/server/index.ts`, `src/styles.ts`, `src/react/`: the view, host and server APIs.
- `docs/quickstart.md`, `docs/migrate-to-2.md`, `docs/patterns.md`, `docs/agent-skills.md`: guides.
- `examples/basic-host/`, `examples/basic-server-preact/`: reference host and Preact starter.
- `plugins/mcp-apps/skills/create-mcp-app/SKILL.md`: the create skill's rules.
- `https://apps.extensions.modelcontextprotocol.io/api/`: hosted TypeDoc (lowercase pages are current).
- npm tarballs of `@modelcontextprotocol/client` 2.0.0 and 2.3.1: timeout and capability enforcement defaults.

Claude (claude.com and support.claude.com):

- `https://claude.com/docs/connectors/building/mcp-apps/getting-started`: desktop config route, Allow prompt, `ui.domain`.
- `https://claude.com/docs/connectors/building/mcp-apps/quickstart.md`: Claude Code does not render; `localhost` unreachable by URL.
- `https://claude.com/docs/connectors/building/mcp-apps/instance-supersession.md`: no conversation id, instances, origin scope.
- `https://claude.com/docs/connectors/building/mcp-apps/design-guidelines`: display modes, layout, tokens.
- `https://claude.com/docs/connectors/building/mcp-apps/external-links.md`: the link modal.
- `https://claude.com/docs/connectors/building/mcp-apps/transparent-theming.md`: host styles and fonts.
- `https://claude.com/docs/connectors/building/mcp-apps/troubleshooting.md`: desktop debugging, `ui.domain`, large results.
- `https://claude.com/docs/connectors/building/index.md`: limits and unsupported features for remote servers.
- `https://claude.com/docs/connectors/getting-started`: where connector kinds work.
- `https://claude.com/docs/connectors/building/mcpb`: desktop extensions.
- `https://claude.com/docs/plugins/platform-support`: plugin components by app.
- `https://claude.com/docs/cowork/changelog`: desktop app releases, Code tab widgets, Unified Claude.
- `https://support.claude.com/en/articles/13454812`: interactive connectors (HELP).
- `https://support.claude.com/en/articles/11175166`: custom connectors and network origin.

Claude Code (code.claude.com):

- `https://code.claude.com/docs/en/mcp.md`: UI resources, runtimes, limits, tool search.
- `https://code.claude.com/docs/en/desktop.md`: desktop config sharing, Code tab, naming.
- `https://code.claude.com/docs/en/network-config.md`: widget rendering in Desktop and claude.ai.
- `https://code.claude.com/docs/en/agent-sdk/typescript.md`: `readMcpResource` and tool `_meta`.
- `https://code.claude.com/docs/en/tools-reference.md` and `https://code.claude.com/docs/en/changelog.md`: resource-list rule and its version.

OpenAI:

- `https://developers.openai.com/plugins/concepts/plugins`: ChatGPT supports MCP Apps; headless use.
- `https://developers.openai.com/plugins/plugin-guidelines`: desktop and mobile requirement.
- `https://learn.chatgpt.com/docs/enterprise/plugin-management`: "Desktop only" plugins.

This repo:

- `codex/src/server.ts`, `codex/src/tab.tsx`, `codex/src/tab.html`: the Codex tab and server.
- `docs/plans/codex-plugin.md`: live Codex checks (`:53-56`, `:333`).
- `docs/plans/clients.md`: client plan and I21.
