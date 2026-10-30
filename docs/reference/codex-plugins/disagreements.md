# Where sources disagree

Part of [Codex plugins and the Codex app](../codex-plugins.md).

| Topic | Sources | Trust | Why |
| --- | --- | --- | --- |
| Cache version folder | D/build/plugins#how-local-marketplaces-work: "For local plugins, `$VERSION` is `local`". Live: `0.1.0`, side-by-side versions, Git short hashes, `latest`; no `local` anywhere | Live layout | It is what Codex 0.160.1 does. Keep the regex version-agnostic. |
| Where `default_tools_approval_mode` goes | Docs: user or project `config.toml` under `plugins.<plugin>.mcp_servers.<server>`. Repo: plugin `.mcp.json` (codex/plugin/.mcp.json:8), works live. AP-MCP forbids it in portable `mcp.json` | Live, with care | It works, but nothing promises it. Recheck after each Codex update. |
| Plugin key in MCP policy | The same page uses `[plugins."my-plugin@local-repo"]` to enable and `[plugins."my-plugin".mcp_servers.docs]` (no `@marketplace`) for MCP policy. Live config uses `inbox@inbox` | Unknown | Test both forms. |
| Manifest status | docs/plans/codex-plugin.md:46 says root `plugin.json` or `.codex-plugin/plugin.json`, "Limits: None". Docs now make root `plugin.json` primary and `.codex-plugin` a fallback that is ignored when `extensions.com.openai` exists | Docs | The plan row predates the portable format. |
| Codex-format required fields | Submission tables mark `composerIcon` and `logo` "Required for Codex". The repo manifest lacks both and installs | Live for local install | [inference] The rule is the portal's upload validation. |
| Annotation justifications | D/plugin-guidelines#correct-annotation: "Annotation justifications are no longer required". D/deploy/submission-errors still lists `justification_required` | Guidelines, tentatively | Newer wording; confirm at submission time. Irrelevant unless listing. |
| Who can publish to a workspace | D/build/plugins: "You must be a workspace admin". L/build-plugins#share-the-plugin-with-your-team: "Publish plugins to workspace permission" | Unknown | Two pages, two models. |
| "Public listing needs a remote HTTPS server" | codex-plugin.md:48 states it flat. Docs add "reach out to your OpenAI contact for local MCP support" | Docs | The plan overstates it slightly. |
| Where the hooks-block-listing rule lives | The plan tags it [documented]. It is in D/build/plugins, D/deploy/submission and D/guides/submit-claude-plugin, not in D/plugin-guidelines | Docs | Cite those three pages. |
| Where hooks run | D/build/plugins intro: "Lifecycle hooks (manually installed Codex desktop plugins only)". Its hooks section: hooks load in "ChatGPT Work and Codex". CLI not named; the plan ran hooks through CLI `exec` | Live plus hooks section | Hooks run wherever orchestration is local. |
| "Desktop only" | L/enterprise/plugin-management: any imported plugin with MCP servers works "only in the ChatGPT desktop app". L/plugins: the CLI installs from marketplaces | Both, scoped | [inference] "Desktop only" is about workspace-imported plugins on ChatGPT surfaces. |
| App name | learn.chatgpt.com: "Codex in the ChatGPT desktop app". developers.openai.com: "Codex desktop". Repo: "Codex desktop app". Binary: `originator: "Codex Desktop"` | learn.chatgpt.com for prose; binary for code checks | The docs name the product; the transcript names what code sees. |
| Who renders plugin UI | developers.openai.com: "ChatGPT". SPEC (`codex://`), BB README ("available in Codex") and the repo's live check: Codex desktop thread tabs | Live | [inference] The developer docs lag the product. |
| Whether the model sees `structuredContent` | D/reference, D/build/mcp-server, D/build/chatgpt-ui: yes. APPSPEC:L1474: "not added to model context" | Unknown for Codex | Check the transcript after a tab open. |
| Empty `content` with UI | APPSPEC:L1559: MUST return meaningful content. BB and SPEC examples return `content: []` | APPSPEC | It is the normative text. |
| PiP | SPEC:L857: no `pip` in ChatGPT. D/reference and D/concepts/ui-guidelines describe PiP | SPEC | Pinned and newer. |
| Entrypoint display mode | SPEC:L859: all entrypoints are `fullscreen`. SPEC:L218 and D/build/extensions call the thread entrypoint a side panel or content tab | Both | [inference] "fullscreen" is the panel's own mode. No page says so. |
| Entrypoint types | SPEC:L40: global, thread, file. TSR:L157 and BB also use `settings`, `quickAction` and `openai/iconStyle` | SPEC for what is promised | The extras are undocumented. |
| File-extension format | SPEC:L288: MUST start with "." D/build/extensions:L136 example: `["stl"]` | SPEC | Normative. |
| Entrypoint title and icons | SPEC:L38 and L56 SHOULDs. BB breaks both | SPEC | The sample is not a contract. |
| `ui/message` content shape | APPSPEC and APPSDRAFT: one object. SPEC:L1169, TSR:L390: an array | Send what the host advertises | Both exist. |
| `ui/message` handling | SPEC: untitled text "becomes ordinary message text". Codex live: wrapped as `untrusted_input` | Live | Codex behavior differs from the ChatGPT spec. |
| Host capability keys | SPEC shows `message`, `updateModelContext`. Only APPSDRAFT defines them; APPSPEC's `HostCapabilities` lacks them | Feature-detect | Draft keys may change. |
| MCP Apps version | SPEC:L3, L36 link the draft at `c55a3a2`; SPEC:L117, L154, L853, L863, L1157 link stable `2026-01-26` | Stable spec | SPEC disagrees with itself. |
| Live updates | APPS says an app "maintains a persistent connection, updating the display". APPSPEC gives views no subscribe | APPSPEC and live | No standard push exists for a thread tab. |
| Extension negotiation | MATRIX: used only if both sides declare. APPSPEC:L1498-1522: client declaration only. Codex renders the inbox tab with no server declaration | Live | A stricter host might not render it. |
| Deprecation deadline | APPSPEC:L347: flat `ui/resourceUri` "will be removed before GA"; spec status is "Stable (2026-01-26)" | n/a | Stale note in the spec. |
| Legacy CSP key | D/reference calls `openai/widgetCSP` superseded, but `redirect_domains` is still needed for `openExternal` | D/reference | Both statements are on one page. |
| Annotations "Required" | D/reference#annotations marks the three hints "Required". In MCP they are optional hints | [inference] Required for ChatGPT submission | Set them anyway. |
| Protocol versions | D/reference uses `2025-06-18`; SPEC uses `2025-11-25` and `2026-07-28`; MCP Apps `2026-01-26`; MCP Events needs `2026-07-28`; the inbox server defaults to `2025-06-18` | n/a | Many versions are in play. |
| SessionStart sources | Docs: four. Schema on `main`: five, with `fork` | Schema for future releases | The hooks page warns `main` may be ahead. |
| `agent_id` / `agent_type` | Docs: only on Subagent events. Schema: optional on six more events | Schema | Guard against them. |
| PreToolUse `ask` / `approve` | Schema allows them. Docs: "parsed but not supported yet" and the hook fails | Docs | Behavior beats schema. |
| PostToolUse for long commands | Docs: a later `write_stdin` poll can deliver it. Live: a 20 s command in code mode got none | Live | Read the transcript instead. |
| Managed-hooks-only scope | GH docs/config.md: "user, project, and session". L/hooks and L/config-reference add "plugin" | learn.chatgpt.com | The GitHub file is stale. |
| `Interrupt` in requirements | The requirements.toml `hooks.<Event>` list omits Interrupt; config.toml and L/hooks include it | L/hooks | Likely an omission. |
| `project_doc_max_bytes` | L/agents-md: combined cap. L/config-advanced: "how much to read from each AGENTS.md file". L/config-reference: "Maximum bytes read from AGENTS.md" | Unknown | Pages disagree. |
| `thread/rollback` | L/app-server: deprecated. README: removed, use `thread/revert`; `common.rs` has no rollback | Source | The doc is stale. |
| Personality | L/app-server examples use `"personality": "friendly"`. README: no longer selects a style; `supportsPersonality: false` | Source | The doc is stale. |
| MCP App resource URI | L/app-server: use `appContext.resourceUri`, lists `templateId`. Schema: prefer `mcpAppUi.resourceUri`, no `templateId` | Schema | The doc is stale. |
| Item name | L/app-server: `collabToolCall`. Schema: `collabAgentToolCall` | Schema | |
| `--remote` scope | Help: only six commands accept it. `queue_cmd.rs` takes remote options | Source | |
| CLI command overview | Omits `queue`, `migrate-rollouts`, `exec-server`; all exist in `main.rs` (L210, L219, L240) and in 0.160.1 `--help` | Source and live | The overview is incomplete. |
| app-server support level | "not supported for production", yet it replaces the removed MCP server and runs the desktop app | Treat as unstable | |
| Settings and plugins | Changelog: plugin management moved into Settings (26.707). L/reference/settings lists no Plugins section | Changelog | The settings page lags. |
| Chat vs task naming | Glossary and changelog still use "task" in many places | n/a | Rename half done. |
| Screenshots | D/plugin-guidelines: "Screenshots are no longer shown in the Directory". Submission tables and errors still specify them | Guidelines | |
| Old app vocabulary | L/build-plugins still says plugins include "apps"; developer docs say "MCP server" | Developer docs | `.app.json` and `asdk_app_` ids remain from the Apps SDK. |
| Duplicate "Build plugins" links | L/skills-and-plugins links one title to L/codex/build-plugins and to D/build/plugins | n/a | Two different pages. |
| Stale links | GH docs/config.md links old developers.openai.com Codex pages (they redirect); L/agent-approvals-security links a removed `docs/config.md#otel` anchor | n/a | The first still resolves; the anchor does not. |
| `codex queue` mechanism (repo) | codex-plugin.md:359: "writes a row to `~/.codex/queue_1.sqlite`… The desktop app picks the row up". :398 and source: `thread/queue/add` on the app-server | Source | [inference] The SQLite row is the store behind the service, a side effect. |
| "Every tools/call" (repo) | codex-plugin.md:327: every MCP `tools/call` carries `x-codex-turn-metadata` | Source | True for model calls only; tab calls carry `thread_id`, app-server calls `threadId`. |
| Desktop session tried? (repo) | codex/README.md:9-10: "has not been tried yet". codex-plugin.md:421-423: it ran. :434-436: "Not yet". :3-4: tab press unconfirmed | codex-plugin.md:421-423 for hooks and polling | The README and step list are stale; the press is still unconfirmed. |
| Poll interval (repo) | codex-plugin.md:56, :119, :332: 5 s or "every few seconds". codex/src/settle.ts:POLL_MS: 3 s | Code | |
| `additionalContextLimit` (repo) | codex-plugin.md:231-234: SessionStart sets it. hooks.json has none | Code | The plan was not implemented. |
| `CODEX_CLI_PATH` in the server (repo) | codex-plugin.md:361-365: servers get no Codex variables. `.mcp.json` lists it in `env_vars`; `appCli` in server-handler.ts says ".mcp.json passes [it] on" | Unknown | Whether it arrives is not recorded. |
| `session_meta.source` (repo) | codex-plugin.md:331: desktop transcripts have `source: "vscode"`. Live: 8 of 58 desktop transcripts do; the rest are subagent threads. Whether this and the 60-transcript count in "Session, thread and turn ids" (9 top-level) are the same sample is not recorded [unknown] | Both | True for top-level threads only. |
| Mode switcher copy | L/sandboxing (IDE-extension tab) still shows "Chat / Agent / Agent (full access)". The mode pickers on L/sandboxing and L/permission-modes show a "Do anything" label that is not in their mode list | n/a | Leftover UI copy. |
| Listing translations | D/deploy/submission#translate-listing-text: importing translations "doesn't yet change the text shown in the Plugins Directory or listing API responses" | n/a | A documented feature that is not live yet. |
| Transcript item fields (repo) | codex-plugin.md:325 lists five fields. Live uses `aggregated_output` and argv lists | Live | The plan's list is incomplete. |
