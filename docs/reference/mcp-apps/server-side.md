# Server side: declaring an app and detecting host support

Part of [MCP Apps](../mcp-apps.md).

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
- Which MCP Apps capability Claude Code, Claude desktop or Codex sends to a server is not documented. See [Unknown, and how to check](open-questions.md#unknown-and-how-to-check).
