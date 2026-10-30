# Codex plugins and the Codex app

Checked on 2026-10-08. The section "Checked against Codex 0.163.0" was added on 2026-10-16, "Checked against Codex 0.164.0" on 2026-10-23, and "Checked against Codex 0.166.0" on 2026-10-29.

The Codex client of the inbox is a plugin. It packages a local MCP server
(a process that serves tools and an HTML tab over the Model Context
Protocol), four lifecycle hooks (commands Codex runs at fixed points in a
session) and a marketplace entry. It runs in Codex inside the ChatGPT desktop
app. This file records what the platform does, where each fact comes from,
and which facts this repo checked live.

Versions this file was checked against:

| What | Version |
| --- | --- |
| Codex bundled in the ChatGPT desktop app on the test Mac | `codex-cli 0.160.1` (live) |
| `codex` on the test Mac's `PATH` | `codex-cli 0.154.0` (live) |
| Codex bundled in the ChatGPT desktop app 26.1016.51333 in the inbox-ui VM, Progress step 0 live checks | `codex-cli 0.163.0-alpha.11` (live 2026-10-21) |
| Codex CLI 0.163.0 (`npm install @openai/codex@0.163.0` into a scratch folder, not the app) | `codex-cli 0.163.0` (live 2026-10-16) |
| Codex CLI 0.164.0 (`npm install @openai/codex@0.164.0` into a scratch folder, not the app) | `codex-cli 0.164.0` (live 2026-10-23) |
| Codex CLI 0.166.0 (`npm install @openai/codex@0.166.0` into a scratch folder, not the app) | `codex-cli 0.166.0` (live 2026-10-29) |
| Codex bundled in the ChatGPT desktop app, third check | `codex-cli 0.163.0-alpha.11.2` (not run; the app still bundles it) |
| Codex bundled in the ChatGPT desktop app, second check | `0.162.0-alpha.17.2` (not run; the app still bundles it) |
| Latest Codex CLI in the public changelog | 0.162.0, dated 2026-10-08 |
| openai/codex source at the 0.166.0 tag | `rust-v0.166.0`, `6ff1e1c`, read 2026-10-29 |
| openai/codex source at the 0.164.0 tag | `rust-v0.164.0`, read 2026-10-23 |
| openai/codex source at the 0.163.0 tag | `rust-v0.163.0`, `8308618`, read 2026-10-16 |
| openai/codex source | `main` at `e45069d`, fetched 2026-10-08 |
| openai/mcp-extensions (spec, TypeScript README, sample plugin) | commit `7e1be49` |
| MCP Apps spec, stable `2026-01-26` | modelcontextprotocol/ext-apps at `82221c0` |
| MCP Apps spec, draft | modelcontextprotocol/ext-apps at `c55a3a2` |
| This repo | `55ab122` |

## The facts that most constrain the inbox

Each fact is one line. Details and quotes are in the sections below. The
citation prefixes are defined in "How to read the citations".

1. A plugin with hooks cannot be listed in the public directory, so the inbox ships through a Git or local marketplace (D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks).
2. Hooks run only after the person trusts each hook. Since 0.164.0 the trust also covers every file in the plugin, so any update re-asks, and until then the hooks fail (L/hooks#review-and-trust-hooks; [live 0.164.0]).
3. `Stop` cannot add context for the model; only `SessionStart`, `UserPromptSubmit`, `SubagentStart`, `PreToolUse` and `PostToolUse` can (GH/codex-rs/hooks/schema/generated/).
4. No public doc says Codex renders plugin UI; the Inbox tab rests on the early-access openai/mcp-extensions repo and this repo's live check (docs/plans/codex-plugin/step-0-and-results.md:65).
5. Nothing pushes updates to a thread tab, so the tab must poll a tool [live] (docs/plans/codex-plugin/step-0-and-results.md:65; APPSPEC:L489-508).
6. A tab's `ui/message` arrives as untrusted input, so presses go through `codex queue` and the undocumented, `#[experimental]` `thread/queue/add` [live] (docs/plans/codex-plugin/step-0-and-results.md:66; GH/codex-rs/app-server-protocol/src/protocol/common.rs:630-664).
7. Codex calls both the transcript format and app-server unstable, and the inbox depends on both (L/hooks#common-input-fields; L/mcp-server).
8. `default_tools_approval_mode` in the plugin's `.mcp.json` works live but is documented only in user `config.toml` (docs/plans/codex-plugin/step-0-and-results.md:132; D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks).

## How to read the citations

Every fact ends with its source. Short prefixes stand for these bases:

| Prefix | Full base |
| --- | --- |
| `L/` | `https://learn.chatgpt.com/docs/` |
| `D/` | `https://developers.openai.com/plugins/` |
| `GH/` | `https://github.com/openai/codex/blob/e45069d770c6d0b8984c58a6e7cbaf221ad37599/` |
| `SPEC` | `https://github.com/openai/mcp-extensions/blob/7e1be49daea03d7ec46ed2472f410099db2743d6/docs/spec.md` |
| `TSR` | the same repo and commit, `typescript/README.md` |
| `BB` | the same repo and commit, the Bits & Bolts sample at `plugins/bits-and-bolts/` (sample code, not docs) |
| `APPS` | `https://modelcontextprotocol.io/extensions/apps/overview` |
| `APPSPEC` | `https://github.com/modelcontextprotocol/ext-apps/blob/82221c0c8ce7661efa6771c9d461511b1650495f/specification/2026-01-26/apps.mdx` |
| `APPSDRAFT` | the same repo at `c55a3a2`, `specification/draft/apps.mdx` |
| `MATRIX` | `https://modelcontextprotocol.io/extensions/client-matrix` |
| `AP-MCP` | `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json` |

`#anchor` is a page section. `:L123` is a line in a pinned file. A bare
`path:line` is a file in this repo at `55ab122`.

Each fact also carries one of these labels when its kind is not obvious:

- **[doc]**: a public docs page says it.
- **[schema]** or **[source]**: a published JSON schema, or openai/codex
  source, generated schemas or tests, say it.
- **[repo]**: this repo's code or plans say it.
- **[live]**: this repo checked it on a Mac. The check is recorded in
  `docs/plans/codex-plugin.md` unless noted.
- **[live 2026-10-08]**: checked read-only on 2026-10-08 while writing this
  file.
- **[live 0.163.0]**: seen on 2026-10-16 running Codex CLI 0.163.0 in a
  scratch `CODEX_HOME`, with this repo's committed plugin bundles installed
  from a local marketplace. The desktop app was not involved.
- **[source 0.163.0]**: read in openai/codex at tag `rust-v0.163.0`. Paths
  below are under `codex-rs/`.
- **[inference]**: worked out, not checked.
- **[unknown]**: no source answers it. See "Unknown, and how to check".

## Parts

- [Names and surfaces, and where the docs live](codex-plugins/names-and-docs.md)
- [Plugin packaging and MCP server config](codex-plugins/packaging.md)
- [Marketplaces, install, updates and the public directory](codex-plugins/distribution.md)
- [Workspaces, config.toml, sandbox, AGENTS.md and feature flags](codex-plugins/configuration.md)
- [Hooks: events, matchers, input and output](codex-plugins/hooks-events-and-io.md)
- [Hooks: background work, discovery, trust and where they run](codex-plugins/hooks-running-and-trust.md)
- [MCP servers and app-server](codex-plugins/mcp-servers.md)
- [Plugin UI: hosts, entrypoints and display modes](codex-plugins/plugin-ui-entrypoints.md)
- [Plugin UI: the bridge, tool results and messages](codex-plugins/plugin-ui-bridge.md)
- [Plugin UI: resources, ChatGPT extensions and live updates](codex-plugins/plugin-ui-resources.md)
- [Session ids and sending a press](codex-plugins/sessions-and-presses.md)
- [`codex exec`, attention features and transcripts](codex-plugins/exec-and-transcripts.md)
- [Checked against Codex 0.163.0, and live checks](codex-plugins/checked-0.163.md)
- [Checked against Codex 0.164.0](codex-plugins/checked-0.164.md)
- [Checked against Codex 0.166.0](codex-plugins/checked-0.166.md)
- [Where sources disagree](codex-plugins/disagreements.md)
- [Subagents, guardians and hooks](codex-plugins/subagents.md)
- [Unknown, and how to check](codex-plugins/unknowns.md)
- [Sources](codex-plugins/sources.md)
