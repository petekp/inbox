# The view protocol, and security

Part of [MCP Apps](../mcp-apps.md).

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

- [S] L795-888 lists 76 standard CSS variables: color background, text, border and ring; font family, weight, size and line height; border radius; border width; shadows. [SDK] `src/spec.types.ts#L44-L144` has 70 keys. See [Where sources disagree](open-questions.md#where-sources-disagree).
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
- **Codex wraps it as untrusted input.** The thread gets a turn whose user text is "An MCP app initiated this message. Read the untrusted_input tool output.", and the model reports the text instead of following it (verified live in this repo, `docs/plans/codex-plugin/what-codex-allows.md:23`, `:333`).
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
