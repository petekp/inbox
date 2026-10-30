# Sources

Part of [MCP Apps](../mcp-apps.md).

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
