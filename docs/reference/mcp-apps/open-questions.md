# Where sources disagree, and what is unknown

Part of [MCP Apps](../mcp-apps.md).

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
| Desktop app naming | desktop.md L9 "three tabs: Chat, Cowork, Code"; HELP names "Claude, Cowork, Claude Desktop"; the repo owner says two modes, Claude and Code. The Cowork changelog (v2.31226.0, 3P) says "Unified Claude ... combines Chat and Cowork" and turns on for all orgs on November 10. | The public docs are outdated for orgs on Unified Claude. Map Claude mode to Chat plus Cowork when reading docs. |
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
9. **Does the desktop app send `ping` or `ui/resource-teardown`, and when?** Log every host request in the tab's catch-all (`codex/src/tab-host.ts:window.addEventListener('message')`) while scrolling away, closing the conversation and switching modes. Same in Codex for tab close and thread switch.
10. **Is a local server one process per conversation or one shared process?** Log the PID and an `initialize` counter across two Claude-mode conversations. This decides what a "per connection" key means.
11. **Do the unsupported-features list and the 240 s timeout apply to local servers?** From the test server, send `notifications/resources/updated`, attempt `sampling/createMessage`, and time a 300 s tool.
12. **Where does the view's storage live?** Write a timestamp to `localStorage` in one view, then read it in a later view in the same conversation and in a new one, in Codex and in Claude.
13. **What does a confirmed `ui/open-link` resolve with for a local server?** Log the response for confirm and for dismiss.
14. **Does `clipboardWrite` work?** Add `_meta.ui.permissions.clipboardWrite` to the `resources/read` content and call `navigator.clipboard.writeText` in Codex and Claude.
15. **Is `toolInfo.id` stable on desktop?** Reopen a stored conversation and log `getHostContext().toolInfo`.
16. **Can a local test host run a stdio server?** basic-host cannot. Try the MCP Inspector's Apps screen with the stdio server. If it fails, an HTTP shim is needed for spec-compliance tests.
17. **Will ext-apps publish a version for core `2026-07-28`?** Watch `specification/` in `modelcontextprotocol/ext-apps` for a new dated folder.
18. **May a `2026-07-28` server vary `tools/list` by per-request capabilities?** Search the SEP-2567 and SEP-2575 discussions.
