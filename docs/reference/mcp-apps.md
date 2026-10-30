# MCP Apps

MCP Apps is the MCP extension that lets a server show its own HTML view inside a host's conversation. For the inbox, it is the only documented way to draw a view in hosts where the mod cannot run: the Codex app today, and the Claude desktop app's Claude mode as a candidate.

Checked on 2026-10-08 against:

- the stable spec `2026-01-26` and the draft spec in `modelcontextprotocol/ext-apps` (raw `main` on that date);
- the ext-apps SDK at commit `82221c0` (package `@modelcontextprotocol/ext-apps` 2.0.3, committed 2026-09-25);
- core MCP revision `2026-07-28`;
- the claude.com, support.claude.com and code.claude.com pages listed under [Sources](mcp-apps/sources.md#sources), fetched that day;
- this repo at `55ab122`;
- the Claude desktop app v2.31226.0, which bundles Claude Code 2.1.293 (Cowork changelog), and local engine types whose header says "Written by Claude Code 2.1.293" (`.claude-plugin/types/claude-code/index.d.ts:1`, untracked and rewritten when a mod loads). The Codex app version was not recorded.

## Facts that most constrain the inbox

1. **A view has no persistent place.** The protocol modes are `inline`, `fullscreen` and `pip`, and a view appears where a tool call put it ([S] L740-789; [MA design-guidelines](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines) #display-modes). Codex's thread tab comes from a Codex-only key, not from the standard.
2. **Claude Code in the terminal does not render MCP Apps.** "Claude Code calls the tool as text and doesn't render the UI" ([MA quickstart](https://claude.com/docs/connectors/building/mcp-apps/quickstart.md) #see-the-ui-render-in-claude). Whether the desktop Code tab renders them is not verified (see [Where sources disagree](mcp-apps/open-questions.md#where-sources-disagree)).
3. **Claude mode can reach local state only through a local server.** URL connectors are called "from Anthropic's cloud infrastructure, rather than from your local device" ([support 11175166](https://support.claude.com/en/articles/11175166), "Network requirements"). A plugin's local MCP server is "Ignored" in Chat ([platform-support](https://claude.com/docs/plugins/platform-support) #compare-component-support-by-app). The documented local routes are `claude_desktop_config.json` and a `.mcpb` desktop extension.
4. **Claude gives the server no conversation id.** "Neither `hostContext` nor the tool-call arguments include a Claude-provided conversation ID" ([MA instance-supersession](https://claude.com/docs/connectors/building/mcp-apps/instance-supersession.md) #channel-scope-and-ui-domain). The Codex server's `sessionOf` would fail every call (`codex/src/server-tools.ts:sessionOf`, `codex/src/server.ts:callTool`).
5. **Each model tool call in Claude mounts a new live view, and old ones stay.** "No host API unmounts earlier instances when a newer one appears" (MA instance-supersession, intro).
6. **There is no push to a view; it must poll.** A view receives only tool input, tool result, cancel and host-context notifications ([S] L1104-1219). Claude does not support resource subscriptions for remote servers ([BI](https://claude.com/docs/connectors/building/index.md) #decide-what-the-server-exposes). Core `2026-07-28` replaced `resources/subscribe` ([changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog.md) major change 4). In Codex, a thread tab's subscribe never reached the server (verified live in this repo, `docs/plans/codex-plugin/what-codex-allows.md:24`).
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
- **Claude mode**: the desktop app's non-Code mode. Public docs still call it Chat and Cowork; see [Where sources disagree](mcp-apps/open-questions.md#where-sources-disagree).

## Status and governance

- **Two spec files exist.** [S] is labeled "Status: Stable (2026-01-26)" and "Track: Extensions" ([S] L5, L9). [D] is labeled "Status: Draft" ([D] L7). The ext-apps README tables them as "**2026-01-26** | Stable" and "**draft** | Development" ([SDK] `README.md#L262-L271`).
- **SEP-1865 is the accepted design, frozen.** It is Final, Extensions Track, created 2025-11-21: "This SEP has reached Final status and is preserved as a historical record ... Changes made to the protocol after finalization are not reflected here." (SEP-1865 L19-24). It points to the draft as "the full specification" (L86-87).
- **The extension mechanism is SEP-2133** (Final, Standards Track; `/seps/index.md` L41). Both spec files instead cite SEP-1724 ([S] L15, L1494; [D] L13, L2181). SEP-1724 is not in the SEP index. Issue #1724 is a closed issue titled "SEP-1724: Extensions" (checked with `gh issue view 1724` on 2026-10-08). [inference] SEP-1724 was the earlier issue-numbered form; core adopted "PR-derived numbering" (changelog process change 1, SEP-1850).
- **Extensions change outside core review.** "extensions may be iterated on without further review from the Core Maintainers" (SEP-2133 L115). "Breaking changes MUST use a new identifier, e.g. `...-v2`" (L60). The overview prefers "capability flags or versioning within the extension settings object rather than creating a new extension identifier" ([extensions/overview](https://modelcontextprotocol.io/extensions/overview.md) L109). [inference] Detect features by capability flag. The id `io.modelcontextprotocol/ui` may stay the same through non-breaking changes.
- **SDKs keep extensions off by default.** "Where implemented, extensions MUST be disabled by default and require explicit opt-in" (SEP-2133 L129).
- **Extension data is untrusted.** "Clients and servers SHOULD treat any new fields or data introduced as part of an extension as untrusted" (SEP-2133 L289).
- **The SDK sends `2026-01-26` but also offers draft-only methods.** `LATEST_PROTOCOL_VERSION = "2026-01-26"` ([SDK] `src/spec.types.ts#L29`). `App` also exposes `downloadFile`, `requestTeardown` and `createSamplingMessage`, which exist only in [D] (L1066, L1445, L534). Nothing in the handshake tells a host that a view may use draft methods.

## Parts

- [Server side: declaring an app and detecting host support](mcp-apps/server-side.md)
- [The view protocol, and security](mcp-apps/view-protocol.md)
- [The SDK, and which hosts support it](mcp-apps/sdk-and-hosts.md)
- [Claude and Claude Code as hosts](mcp-apps/claude-hosts.md)
- [Codex, the Codex tab against the spec, and a Claude-mode view](mcp-apps/inbox-fit.md)
- [Where sources disagree, and what is unknown](mcp-apps/open-questions.md)
- [Sources](mcp-apps/sources.md)
