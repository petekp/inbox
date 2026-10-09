# Codex plugins and the Codex app

Checked on 2026-10-08.

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
| Latest Codex CLI in the public changelog | 0.162.0, dated 2026-10-08 |
| openai/codex source | `main` at `e45069d`, fetched 2026-10-08 |
| openai/mcp-extensions (spec, TypeScript README, sample plugin) | commit `7e1be49` |
| MCP Apps spec, stable `2026-01-26` | modelcontextprotocol/ext-apps at `82221c0` |
| MCP Apps spec, draft | modelcontextprotocol/ext-apps at `c55a3a2` |
| This repo | `55ab122` |

## The facts that most constrain the inbox

Each fact is one line. Details and quotes are in the sections below. The
citation prefixes are defined in "How to read the citations".

1. A plugin with hooks cannot be listed in the public directory, so the inbox ships through a Git or local marketplace (D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks).
2. Hooks run only after the person trusts each hook definition, and a changed definition is skipped until trusted again (L/hooks#review-and-trust-hooks).
3. `Stop` cannot add context for the model; only `SessionStart`, `UserPromptSubmit`, `SubagentStart`, `PreToolUse` and `PostToolUse` can (GH/codex-rs/hooks/schema/generated/).
4. No public doc says Codex renders plugin UI; the Inbox tab rests on the early-access openai/mcp-extensions repo and this repo's live check (docs/plans/codex-plugin.md:332).
5. Nothing pushes updates to a thread tab, so the tab must poll a tool [live] (docs/plans/codex-plugin.md:332; APPSPEC:L489-508).
6. A tab's `ui/message` arrives as untrusted input, so presses go through `codex queue` and the undocumented, `#[experimental]` `thread/queue/add` [live] (docs/plans/codex-plugin.md:333; GH/codex-rs/app-server-protocol/src/protocol/common.rs:630-664).
7. Codex calls both the transcript format and app-server unstable, and the inbox depends on both (L/hooks#common-input-fields; L/mcp-server).
8. `default_tools_approval_mode` in the plugin's `.mcp.json` works live but is documented only in user `config.toml` (docs/plans/codex-plugin.md:399; D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks).

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
- **[inference]**: worked out, not checked.
- **[unknown]**: no source answers it. See "Unknown, and how to check".

## Names and surfaces

- **Codex is a mode of the ChatGPT desktop app.** "On July 9, the Codex app
  merged into the ChatGPT desktop app for macOS and Windows. Codex keeps its
  dedicated coding experience alongside ChatGPT's Chat and Work."
  (L/whats-new#use-codex-in-the-chatgpt-desktop-app; changelog entry
  "Codex joins the ChatGPT desktop app 26.707", L/changelog#codex-2026-07-09-app)
- **How a person reaches it.** "Choose ChatGPT or Codex. In ChatGPT, use the
  toggle above the composer to select Chat or Work. In Codex, start with New
  chat." (L/app#get-started-with-the-desktop-app) "In the ChatGPT desktop
  app, open the ChatGPT dropdown and select **Codex**." (L/environments/modes)
- **The binary still names itself Codex Desktop.** Desktop transcripts record
  `originator: "Codex Desktop"` and `source: "vscode"` [live]
  (docs/plans/codex-plugin.md:331). The app ships inside
  `/Applications/ChatGPT.app`, with the CLI at
  `Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex` [live 2026-10-08].
- **Docs disagree on the name.** learn.chatgpt.com says "Codex in the ChatGPT
  desktop app". developers.openai.com still says "Codex desktop" ("manually
  installed Codex desktop plugins", D/build/plugins). This repo says "Codex
  desktop app" (codex/README.md:3).
- **Where a Codex chat runs.** Local, Worktree or Cloud. "Both **Local** and
  **Worktree** chats run on your computer." Cloud tasks need a published
  environment, and "Your computer's local files, running processes, browser
  sign-ins, and VPN access aren't automatically transferred to it."
  (L/environments/modes) [inference] A Cloud chat cannot run the inbox's local
  hooks or stdio server.
- **Platforms.** macOS and Windows; Linux is in preview for Ubuntu, Debian and
  Fedora (L/app#get-started-with-the-desktop-app, L/changelog#codex-2026-08-11-app).
- **Which surfaces support plugins.** "Plugins work in Chat and Work across
  ChatGPT on the web, desktop, and mobile, and in Codex in the ChatGPT desktop
  app. Codex CLI also has a plugin browser for Codex environments. The IDE
  extension doesn't support plugins." (L/plugins#overview)
- **Desktop-only plugins.** "Any imported plugin that declares MCP servers in
  `mcp.json` or `.mcp.json` is marked Desktop only and works only in the
  ChatGPT desktop app. This includes servers that use a remote HTTPS URL. The
  same restriction applies to other supported MCP configuration forms, such as
  inline server declarations."
  (L/enterprise/plugin-management#desktop-only-plugins) "You can discover
  these plugins on the web, but you must open the ChatGPT desktop app to
  install and use them. They aren't available on mobile." (L/plugins#overview)
- **Plugins Directory tabs.** "OpenAI", the workspace's name, and "Personal"
  ("including Created by me and Shared with me sections"), plus "the separate
  Installed row". (L/plugins#universal-plugin-directory)
- **API-key sign-in.** People signed in with an API key "can browse, install,
  and manage supported OpenAI-curated plugins in Codex CLI and Codex in the
  ChatGPT desktop app". Some are unavailable because "their connection flows
  require unsupported OAuth capabilities". (L/plugins#api-key-availability)
  Whether local-marketplace plugins work under API-key sign-in is not stated
  [unknown].
- **ChatGPT web reaches plugins only as remote MCP tools.** "ChatGPT web
  doesn't read local Codex configuration files." "ChatGPT web can use remote
  MCP-backed tools supplied by plugins." (L/extend/mcp) [inference] The inbox's
  local stdio server is unreachable there.
- **CLI.** "enter `/plugins` to open the plugin browser. Install a plugin from
  a configured marketplace, then start a new session before using its bundled
  skills or tools." Space on an installed plugin turns it on or off.
  (L/plugins#plugin-browser-in-codex-cli) [inference] The inbox's hooks can
  therefore fire in Codex CLI sessions, where no Inbox tab exists.
- **Glossary terms.** "Chat" is the user-facing word. "Thread" is "A technical
  object in Codex app-server APIs that contains turns and stored conversation
  history." "Turn" is "One exchange in a chat". There is no plain "Session"
  entry, only "Ephemeral session": "Non-interactive run that skips saving
  session state after it completes." (L/glossary)
- **Words Codex already uses.** "Finding" means "A notable result or issue
  surfaced by a scheduled task", reported in Triage. "Task" is being renamed
  to "chat" but survives in many anchors and changelog lines. (L/glossary)
  Inbox copy in the Codex client should avoid clashing with these.
- **dots.** A documented ChatGPT product: "An always-on agent that keeps work
  moving and asks for your input when a decision needs you." (L/dots) It
  overlaps with the inbox's purpose. Plugin and command hooks do not run in
  its cloud orchestration (L/hooks#managed-hooks-from-requirementstoml).

## Where the docs live

- **Old paths redirect.** Checked with `curl -w %{redirect_url}` on
  2026-10-08 [live 2026-10-08]:

  | Old path | Now |
  | --- | --- |
  | `developers.openai.com/codex/hooks` | 308 to `learn.chatgpt.com/docs/hooks` |
  | `developers.openai.com/codex/plugins` | 308 to `learn.chatgpt.com/docs/plugins` |
  | `developers.openai.com/codex/enterprise/plugin-management` | 308 to `learn.chatgpt.com/docs/enterprise/plugin-management` |
  | `developers.openai.com/codex/enterprise/managed-configuration` | 308 to `learn.chatgpt.com/docs/enterprise/managed-configuration` |
  | `developers.openai.com/codex/config-file/config-basic` | 308 to `learn.chatgpt.com/docs/config-file/config-basic` |
  | `developers.openai.com/codex/plugins/build` | 308 to `developers.openai.com/plugins/build/plugins` |
  | `developers.openai.com/apps-sdk` | 301 to `developers.openai.com/plugins` |
  | `developers.openai.com/apps-sdk/deploy/submission` | 301 to `developers.openai.com/plugins/deploy/submission` |
  | `learn.chatgpt.com/codex/hooks`, `/codex/plugins` | 308 to `learn.chatgpt.com/docs/...` |

- **Two doc sites split the topic.** learn.chatgpt.com covers Codex use,
  hooks, config, enterprise and app-server. developers.openai.com/plugins
  covers plugin packaging, submission, MCP servers and UI.
- **Markdown copies.** "Markdown versions of documentation pages are available
  by appending `.md` to the page URL." (learn.chatgpt.com) `L/changelog.md`
  returns "Not found"; read the HTML.
- **This repo links to no OpenAI docs.** A grep for
  `developers.openai.com|learn.chatgpt|apps-sdk` found hits only in
  `node_modules`, `package-lock.json` and worktree copies [live 2026-10-08].
  `docs/plans/codex-plugin.md` tags claims "[documented]" without URLs.

## Plugin packaging

### What a plugin can contain

- **Parts.** Skills, MCP servers, "Browser extensions" and Hooks
  (L/plugins#overview). developers.openai.com lists skills, an MCP server and
  "Lifecycle hooks that run commands at configured points in the Codex
  runtime, including ChatGPT Work and Codex." (D/concepts/plugins)
- **One directory for ChatGPT and Codex.** "ChatGPT and Codex share one
  universal plugin directory … Individual capabilities can still be
  surface-specific; for example, hook scripts must be available in the
  execution environment. Installing a plugin on the web doesn't deploy those
  scripts." (D/concepts/plugins)
- **UI is optional.** "Custom UI is not required for an MCP server." "Keep
  tools useful without the component so the model can complete headless
  workflows." (D/concepts/plugins#optional-ui)

### Two manifest formats

There are now two formats. The repo uses the older one.

| | Portable Agent Plugins format | Codex compatibility format |
| --- | --- | --- |
| Manifest | `plugin.json` at the plugin root, schema `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` | `.codex-plugin/plugin.json` |
| OpenAI-only keys | Under `extensions.com.openai` in root `plugin.json` | Top level of `.codex-plugin/plugin.json` |
| MCP servers | Always from root `mcp.json`, each with a transport `type` | From the file `mcpServers` names, usually `./.mcp.json` |
| Skills | Always from `skills/` | From the `skills` field |
| Status in docs | "new packages should use this format" | "remain supported as a compatibility fallback" |
| Used by this repo | No | Yes: `codex/plugin/.codex-plugin/plugin.json` |

Sources and rules:

- "For a portable Agent Plugins package, add `plugin.json` at the plugin root
  … Put OpenAI-specific presentation, registered MCP server mappings, and
  hook settings under `extensions.com.openai` in root `plugin.json`. Existing
  `.codex-plugin/plugin.json` files remain supported as a compatibility
  fallback." (D/build/plugins, intro)
- "OpenAI also accepts legacy and Claude-compatible manifests, but new
  packages should use this format." (D/build/plugins#plugin-structure)
- **The two are never merged.** "When `extensions.com.openai` is an object, it
  replaces the entire `.codex-plugin/plugin.json` overlay … the two aren't
  merged." (D/build/plugins#add-openai-specific-metadata) "If that object is
  present, OpenAI ignores settings in `.codex-plugin/plugin.json`."
  (D/deploy/submission#automatically-provide-submission-and-review-information)
- **A portable package ignores component declarations.** "Portable packages
  always discover skills in `skills/` and MCP servers in `mcp.json`. A skills
  or `mcpServers` declaration in the inline extension or compatibility
  overlay can't replace, disable, or add to those components."
  (D/deploy/submission#manifest-fields)
- **Layout.** "Keep `plugin.json`, `mcp.json`, `skills/`, and `assets/` at the
  plugin root." With a Codex overlay, "keep only its `plugin.json` inside
  `.codex-plugin/`; referenced hooks, `.app.json`, and other resources stay at
  the plugin root." (D/build/plugins#plugin-structure)
- **Paths.** Paths in `extensions.com.openai` or the compatibility manifest
  start with `./` and resolve from the plugin root. `apps` is used "only for
  registered MCP server mappings in `.app.json`". (D/build/plugins#path-rules)
- **The name is the namespace.** "Use a stable plugin `name` in kebab-case.
  Plugin hosts use it as the plugin identifier and component namespace."
  (D/build/plugins#create-a-plugin-manually)
- **Scaffolding.** `@plugin-creator` (`$plugin-creator` in Codex) creates the
  compatibility layout. "Requesting hooks creates an empty `hooks/`
  directory, not a hook configuration or executable script."
  (D/build/plugins#package-with-plugin-creator)
- **Onboarding skill.** `extensions.com.openai.onboardingSkill:
  "./skills/setup/SKILL.md"`. "When users run setup, it invokes the skill in a
  new conversation, or in the existing conversation if they installed the
  plugin during that conversation." It also works in the compatibility
  format. (D/build/plugins#add-an-onboarding-skill)
- **Skills reload on their own.** "Codex detects skill changes automatically.
  If an update doesn't appear, restart Codex." (L/build-skills) Plugins need a
  cache refresh and an app restart (see "Updates").
- **Where skills run.** "Standalone skills are available in the ChatGPT
  desktop app, Codex CLI, and IDE extension. Skills bundled in plugins are
  also available in Chat and Work across ChatGPT on the web, desktop, and
  mobile." (L/build-skills)

### Codex-format fields

From the field tables in D/deploy/submission#manifest-fields and
#listing-metadata. The page says: "The limits here are for public
submission; a package upload can accept longer draft text. A successful
upload doesn't mean the listing is ready to submit."

| Field | What the table says |
| --- | --- |
| `name` | "Required stable identifier, at most 64 characters. Use lowercase letters, numbers, and single hyphens for packages you plan to submit." |
| `version` | "Required for Codex; optional in the portable schema". No length limit. An explicit semantic version is advised "for submission and updates". |
| `description` | "Required for Codex", at most 4000 characters |
| `author.name` | Required in the Codex format |
| `interface` | "Required for Codex" |
| `interface.capabilities` | "Required in the Codex format; use [] if there are none" |
| `composerIcon` | "Required for Codex" |
| `logo` | "Required for Codex; primary icon required for submission" |
| `longDescription`, `displayName`, `shortDescription`, `developerName`, `category` | "Required" in the listing table. `longDescription` at most 4000; `displayName` and `shortDescription` at most 30 |
| `defaultPrompt` | Up to 3 prompts, each at most 128 characters |
| `skills`, `mcpServers` | Codex-only. `mcpServers` is `"./.mcp.json"` |

- **Icons.** "Codex package validation requires both [`logo` and
  `composerIcon`]; you can upload a portable package without them." PNG,
  JPEG, WebP or SVG, at most 5 MiB, square, at least 48×48, raster at most
  4096 px. (D/deploy/submission#icons-and-screenshots)
- **The repo's manifest has no `longDescription`, `composerIcon` or `logo`,
  and installs locally anyway** [repo, live] (codex/plugin/.codex-plugin/plugin.json:1-17).
  [inference] "Codex package validation" means the submission portal's upload
  checks, not local install. The docs do not say so.
- **The repo's manifest today:** `name` and `version` "0.1.0", `author.name`,
  `"mcpServers": "./.mcp.json"`, `"hooks": "./hooks/hooks.json"`, and an
  `interface` with `displayName` "Inbox", `category` "Developer Tools" and
  `capabilities: ["Interactive"]` (codex/plugin/.codex-plugin/plugin.json:1-17).
  `codex/plugin/` has no root `plugin.json`.

## MCP server config in a plugin

- **Compatibility `.mcp.json`.** The docs' example is
  `{ "mcpServers": { "notes": { "url": "https://example.com/mcp" } } }`. "This
  format omits the Agent Plugins schema." (D/deploy/submission#complete-metadata-examples)
  No developers.openai.com page shows a stdio entry (`command`, `args`, `cwd`,
  `env_vars`).
- **A root `.mcp.json` is read only when named.** "A root .mcp.json is
  imported only when the plugin-manifest mcpServers field is set to
  ./.mcp.json." (D/deploy/submission-errors#package-warnings) `mcpServers`
  "must resolve to the root .mcp.json". (D/deploy/submission-errors)
- **Portable `mcp.json`.** `$schema` is `AP-MCP`. Entries look like
  `mcpServers.<name> = { "type": "streamable-http", "url": … }`.
  "Don't just rename `.mcp.json`: the portable MCP format also declares a
  transport `type` for each server." (D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks,
  #plugin-creator-output)
- **The portable schema allows stdio but not the repo's extra keys** [schema].
  `$defs.server` is `oneOf` stdio, streamable HTTP or SSE. A stdio entry is
  `{type:"stdio", command, args?, env?, cwd?}` with
  `additionalProperties: false`. `env` may not set `PLUGIN_ROOT` or
  `PLUGIN_DATA`. `cwd` must start with `./`, `${PLUGIN_ROOT}` or
  `${PLUGIN_DATA}`. So `env_vars` and `default_tools_approval_mode` are not
  allowed there. (AP-MCP, `$defs.stdioServer`)
  - The `cwd` pattern is `^(?:\./|\$\{PLUGIN_ROOT\}(?:/|$)|\$\{PLUGIN_DATA\}(?:/|$))`.
    The repo's `cwd: "."` has no trailing slash, so it would also fail the
    portable schema [schema] (AP-MCP; codex/plugin/.mcp.json:6).
  - [inference] Reserving `PLUGIN_ROOT` and `PLUGIN_DATA` in `env` and allowing
    `${PLUGIN_DATA}` in `cwd` suggests the runtime gives portable stdio servers
    those variables. The spec prose was not read.
- **The repo's `.mcp.json`** [repo] (codex/plugin/.mcp.json:1-11): one stdio
  server `inbox`, `command: "/bin/sh"`,
  `args: ["-c", "exec \"${CODEX_MCP_NODE_PATH:-node}\" ./dist/server.mjs"]`,
  `cwd: "."`, `env_vars: ["PATH", "HOME", "CODEX_HOME", "CODEX_CLI_PATH",
  "CODEX_MCP_NODE_PATH"]`, `default_tools_approval_mode: "approve"`.
- **Host-side stdio keys** (Codex's own `config.toml`, not the plugin file):
  `command`, `args`, `env`, `env_vars` ("Environment variables to allow and
  forward"; string entries read "from Codex's local environment"), `cwd`,
  `experimental_environment`. (L/extend/mcp#stdio-servers)
- **Users tune plugin servers in their own config.** "After installation,
  users can enable or disable a bundled MCP server and tune tool approval
  policy from their Codex config without editing the plugin. Use
  `plugins.<plugin>.mcp_servers.<server>` for plugin-scoped MCP server
  policy." (D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks) The
  page's example:

  ```toml
  [plugins."my-plugin".mcp_servers.docs]
  enabled = true
  default_tools_approval_mode = "prompt"
  enabled_tools = ["search"]
  [plugins."my-plugin".mcp_servers.docs.tools.search]
  approval_mode = "approve"
  ```

- **User config cannot change a plugin server's command.** Plugin MCP servers
  "are launched from the plugin, so user config doesn't set their transport
  command. User config can still control on/off state and tool policy".
  Plugin `.mcp.json` OAuth fields use camelCase.
  (L/extend/mcp#plugin-provided-mcp-servers)
- **Approval modes.** `default_tools_approval_mode` takes
  `auto|prompt|writes|approve`. "The `writes` mode prompts for tools that
  aren't marked read-only." Per tool: `tools.<tool>.approval_mode` and
  `tools.<tool>.output_token_limit` ("before the standard 20% serialization
  allowance"). (L/extend/mcp#other-configuration-options) The exact meaning of
  `auto` and `approve` is not spelled out [unknown].
- **The plugin-file placement works but is undocumented.**
  `default_tools_approval_mode: "approve"` in `.mcp.json` let `record_finding`
  run without approval; without it, Codex refused the call [live]
  (docs/plans/codex-plugin.md:399). No page documents the key inside a
  plugin's `.mcp.json`. Whether per-tool `approval_mode` works there is
  [unknown].

## Marketplaces, install, cache and updates

### Marketplace files

- **Where Codex looks.** "The ChatGPT desktop app can read marketplace files
  from: a repo marketplace at `$REPO_ROOT/.agents/plugins/marketplace.json`, a
  legacy-compatible marketplace at `$REPO_ROOT/.claude-plugin/marketplace.json`,
  a personal marketplace at `~/.agents/plugins/marketplace.json`."
  (D/build/plugins#how-local-marketplaces-work) No precedence is given.
- **Which file wins at one root.** With both `.claude-plugin/marketplace.json`
  and `.agents/plugins/marketplace.json` at one root, Codex reads
  `.agents/plugins/marketplace.json` [live] (docs/plans/codex-plugin.md:330).
  The row does not say which command or surface was used.
- **This repo has both.** `.agents/plugins/marketplace.json` names the `inbox`
  marketplace with one local entry, `source: {source: "local", path:
  "./codex/plugin"}`, policy `AVAILABLE` / `ON_INSTALL`, category "Developer
  Tools" [repo]. It has no `interface.displayName`, which "sets the marketplace
  title" (D/build/plugins#marketplace-metadata). `.claude-plugin/marketplace.json`
  is the Claude Code mod's, with `source: "./"`. The root
  `.claude-plugin/plugin.json` holds only `name`, `description` and `types`
  (.claude-plugin/plugin.json:1-5).
- **Entry rules.** "Always include `policy.installation`,
  `policy.authentication`, and `category`." Installation takes "values such
  as" `AVAILABLE`, `INSTALLED_BY_DEFAULT` and `NOT_AVAILABLE`. The enterprise
  page names the authentication values `ON_INSTALL` and `ON_USE`
  (L/enterprise/plugin-management#supported-formats). `source.path`
  must start with `./` and stay inside the root. "Codex resolves
  `source.path` relative to the marketplace root, not relative to the
  `.agents/plugins/` folder." (D/build/plugins#marketplace-metadata,
  #install-a-local-plugin-manually)
- **Other sources.** Git: `"source": "url"` for a repo root, or `"git-subdir"`
  with `url`, `path`, `ref` or `sha`. npm: `package`, optional `version`,
  optional HTTPS `registry`; "Codex downloads the package without running
  lifecycle scripts. The `npm` CLI must be installed." "If Codex can't resolve
  a marketplace entry's source, it skips that plugin entry instead of failing
  the whole marketplace." (D/build/plugins#marketplace-metadata)
  [inference] An npm source is a documented alternative to committing
  `codex/plugin/dist`, at the cost of a publish step.

### CLI commands

- `codex plugin marketplace add owner/repo | owner/repo@ref | --ref main |
  <git url> --sparse PATH | ./local-root`, then `list`, `upgrade [name]`,
  `remove name`. `list` "prints each marketplace Codex is considering and the
  root path it resolves from". (D/build/plugins#add-a-marketplace-from-the-cli)
- `codex plugin add|list|remove`, all with `--json`.
  (L/developer-commands?surface=cli#codex-plugin)
- "Use the ChatGPT desktop app to install and test a local plugin."
  (D/build/plugins#add-a-marketplace-from-the-cli)
- Desktop deep links: `codex://plugins/install/<plugin-name>?marketplace=<m>`,
  `codex://plugins/<plugin-id>`, `codex://plugins/<name>?marketplacePath=<abs>`.
  (L/reference/commands#supported-links)

### Enabling and the plugin key

- **Key format.** `[plugins."my-plugin@local-repo"] enabled = true|false`.
  "The quoted key uses `plugin-name@marketplace-name`."
  (D/build/plugins#enable-or-disable-a-plugin-for-a-repo)
- "During marketplace refresh, Codex can install or refresh files for
  configured plugins, even when `enabled = false`." "Codex loads project
  `.codex/config.toml` only for trusted projects." "These settings apply to
  local-marketplace plugins in supported local clients, including Codex CLI
  and Codex in the ChatGPT desktop app." (same section)
- "The plugin browser saves user-level choices in `~/.codex/config.toml`."
  (D/build/plugins#how-local-marketplaces-work)
- **Live config on the test Mac** [live 2026-10-08]:
  `[marketplaces.inbox] source_type = "local"` with `source` set to the
  checkout, and `[plugins."inbox@inbox"] enabled = true`.

### Cache and data folders

- **Documented cache path.** "ChatGPT installs plugins into
  `~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/`. For local
  plugins, `$VERSION` is `local`, and ChatGPT loads the installed copy from
  that cache path rather than directly from the marketplace entry."
  (D/build/plugins#how-local-marketplaces-work)
- **Live cache layout differs** [live 2026-10-08]:
  - The inbox is at `~/.codex/plugins/cache/inbox/inbox/0.1.0/`, the manifest
    version, not `local`. `diff -rq` against `codex/plugin` showed no
    differences.
  - Another local marketplace keeps `0.1.0`, `0.1.1` and `0.1.3` side by side.
  - Git-backed `openai-curated` uses a short hash folder (`github/1dc19589`).
  - `openai-bundled/chrome` has both `26.930.61225` and `latest`.
  - No `local` folder exists anywhere.
- **Data folder.** "`PLUGIN_DATA` points to the plugin's writable data
  directory." (D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks) No
  page says where it is. Live, `~/.codex/plugins/data/inbox-inbox` exists
  [live 2026-10-08].
- **How the server finds it.** `dataDir` reads `INBOX_DATA` or `PLUGIN_DATA`.
  Otherwise it maps `<home>/plugins/cache/<market>/<plugin>/<version>` to
  `<home>/plugins/data/<plugin>-<market>`, and falls back to
  `~/.codex/inbox-dev` (codex/src/state.ts:89-102). MCP server processes
  found the hooks' data folder this way [live]
  (docs/plans/codex-plugin.md:400). The `<plugin>-<market>` order is a code
  assumption: it cannot be told apart while both names are "inbox".
  [inference] The regex ignores the version segment, so a switch to `local`
  would not break it. A change to the `data/` naming would.

### Updates

- "After you change the plugin, update the plugin directory … and restart the
  ChatGPT desktop app so the local install picks up the new files."
  (D/build/plugins#install-a-local-plugin-manually)
- Bundled skills and tools need a new session after install
  (L/plugins#how-permissions-and-data-sharing-work).
- Git marketplaces refresh with `codex plugin marketplace upgrade`
  (D/build/plugins#add-a-marketplace-from-the-cli).
- Uninstalling "removes the plugin bundle from that ChatGPT or Codex
  environment". "Separately connected MCP server integrations remain
  connected in ChatGPT until you disconnect them there." Workspace-installed
  or default plugins may not offer Uninstall. (L/plugins#remove-a-plugin)
- Plugin management moved into Settings in desktop 26.707
  (L/changelog#codex-2026-07-09-app). L/reference/settings lists no Plugins
  section.

## Public directory and submission

None of this applies to a Git or local install. It matters only if the inbox
is ever listed publicly.

- **Hooks block listing.** "Plugin ZIPs containing app references (`apps` /
  `.app.json`) or lifecycle hooks cannot currently be submitted … If your
  plugin depends on lifecycle hooks, distribute it so users can install it
  manually in Codex desktop." (D/deploy/submission#automatically-provide-submission-and-review-information)
  The same rule is in D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks
  and D/guides/submit-claude-plugin ("Remove lifecycle hooks before public
  directory submission").
- **A local server blocks listing, with an exception.** "For public
  submission, submit the remote HTTPS endpoint through With MCP. If your MCP
  server runs locally, deploy it to a public HTTPS URL. If you can't, reach
  out to your OpenAI contact for local MCP support."
  (D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks) The endpoint must
  use Streamable HTTP (D/guides/submit-claude-plugin).
- **Mobile is required.** "Plugins must function reliably in ChatGPT on both
  desktop and mobile, including any UI components." (D/plugin-guidelines#testing)
  [inference] A local stdio tab cannot meet this.
- **Name rule.** Avoid "single-word dictionary terms that aren't explicitly
  tied to your brand." (D/plugin-guidelines#plugin-name-description-and-prompts)
  "Inbox" is one.
- **Tool rules** (D/plugin-guidelines#tools, #correct-annotation,
  #tool-independence-and-exposure):
  - Each tool needs explicit boolean `readOnlyHint`, `destructiveHint` and
    `openWorldHint`. `readOnlyHint` is false for "external-state changes,
    persisting artifacts, starting stateful jobs or workflows, queuing work".
    "Being able to undo an action does not, by itself, justify setting
    destructiveHint to false."
  - [inference] `record_finding`, `close` and `inbox_press` all need
    `readOnlyHint: false`. The inbox's tools set no annotations today
    (codex/src/server.ts:31-55).
  - "Do not request the full conversation history … Your MCP server must not
    pull, reconstruct, or infer the full chat log from the client or
    elsewhere." [inference] The per-reply update reads the transcript, which
    would fail review.
  - Responses must not include "session IDs, trace IDs, request IDs,
    timestamps" unless needed.
  - "Do not use discovery, operation selection, or schema fetching with a
    generic executor to enable operations not individually exposed for
    review." [inference] A generic "press any action" tool may fail this.
- **Submission mechanics** (D/deploy/submission):
  - Org owners or members with Apps Management Write, plus identity
    verification.
  - "Your package can declare multiple MCP servers, but only one MCP server can
    be connected per plugin." "Adding an MCP server to an existing skills-only
    plugin is not currently supported."
  - Domain verification at `/.well-known/openai-apps-challenge`. Reviewers
    need 5 positive and 3 negative test cases plus a video.
  - The hosted server is scanned daily; "New tools remain unavailable until
    approved". "Only one review can be active per plugin." Changing an MCP
    server URL needs support.
  - `plugin_version_unchanged`: "A new release must use a different manifest
    version; reusing the published version requires confirmation." It is a
    warning, not an error. (D/deploy/submission-errors#zip-upload-errors-and-warnings)
  - Screenshots, if given: one per starter prompt, "exactly 706 pixels wide and
    400–860 pixels tall". (D/deploy/submission-errors#final-submission-requirements)
- **Testing endpoints.** Secure MCP Tunnel or a development tunnel can reach a
  local server for testing. "These testing options do not replace the public
  HTTPS endpoint required for plugin submission." Tool metadata changes need
  Refresh, which "applies to custom MCP servers connected directly in
  ChatGPT". (D/deploy/connect-chatgpt#prepare-the-endpoint, #refresh-metadata)
- **Converting a Claude Code plugin** (D/guides/submit-claude-plugin):
  - "Claude marketplace listings and approvals don't transfer."
  - `.claude-plugin/plugin.json` can be kept for direct upload: "The portal
    converts it to `.codex-plugin/plugin.json`."
  - `commands/` and `agents/` must become skills. `outputStyles`,
    `lspServers`, `experimental.themes`, `experimental.monitors`, `channels`
    and `dependencies` must move into skills or go. "The portal doesn't
    accept .mcpb files."
  - "OpenAI doesn't run Claude installation prompts or expand `user_config`
    variables." "OpenAI doesn't currently support Claude live artifacts."
  - Skills that name Claude should use "provider-neutral language".
  - "Contact your OpenAI partner before submitting if the plugin's core value
    requires local execution, arbitrary access to files on the user's
    computer … offline operation, or inbound channel messages."

## Workspaces and managed configuration

Each of these can turn the inbox off on a managed Mac. When a local setting
conflicts with an enforced rule, "the local client falls back to a compatible
value and notifies the user" (L/enterprise/managed-configuration#admin-enforced-requirements-requirementstoml).
Whether the person sees which plugin was affected is [unknown].

| Control | Effect | Source |
| --- | --- | --- |
| `features.plugins = false` | Plugins off in local clients, "also … with an API key" | L/enterprise/managed-configuration |
| `[features].hooks = false`, or pinned in requirements | All hooks off | L/hooks#turn-hooks-off |
| `allow_managed_hooks_only = true` | "skips hooks from user, project, session, and plugin sources" | L/hooks#managed-hooks-from-requirementstoml |
| `[marketplaces] restrict_to_allowed_sources = true` with `allowed_sources` (git, `host_pattern`, local) | "reject unmatched marketplace add, plugin install, and configured Git marketplace refresh operations" and "filter configured marketplaces and their plugins at runtime" | L/enterprise/managed-configuration#restrict-plugin-marketplace-sources |
| `mcp_servers` allowlist | A server is enabled "only when both its name and identity match an approved entry". Present but empty disables all MCP servers | L/enterprise/managed-configuration#admin-enforced-requirements-requirementstoml |
| `plugins.<plugin>.mcp_servers` table in requirements | "plugin-bundled servers without a matching plugin and server entry are disabled" | L/config-reference#requirementstoml |
| `features.plugin_sharing = false` | Disables publishing to a workspace | D/build/plugins#publish-a-local-plugin-to-your-workspace |

- **Command identity.** "For stdio servers, match on `command` … The string
  form of identity.command … doesn't inspect `args`, `cwd`, `env`, or
  `env_vars`". A structured form,
  `command = { executable, args = [{ match, value }] }`, matches the
  executable and each positional argument. "Structured command rules still
  don't inspect `cwd`, `env`, or `env_vars`." Plugin servers use the same
  shapes under `plugins.<plugin>.mcp_servers.<server>`.
  (L/enterprise/managed-configuration#enforce-command-rules-from-requirements)
  [inference] The inbox's `/bin/sh -c` invocation can be pinned, but weakly:
  the argument expands `${CODEX_MCP_NODE_PATH:-node}`, and identity rules
  never inspect env. A direct executable with fixed args would be cleaner to
  allowlist.
- **Requirements file locations** are only `/etc/codex/requirements.toml`, the
  Agent Security cloud bundle, legacy `managed_config.toml`, and MDM
  (`com.openai.codex:requirements_toml_base64`). No user or `CODEX_HOME`
  location is listed. (L/enterprise/managed-configuration#locations-and-precedence)
- **Scope.** The source restrictions apply in "ChatGPT and Codex in the
  desktop app, and Codex CLI". They "don't control plugin use in ChatGPT on
  the web or mobile". "Bundled plugins and remotely installed workspace
  plugins are separate from this curated Git source policy." (same page)
- **Workspace GitHub import** (L/enterprise/plugin-management#supported-formats):
  - Accepts `.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json`,
    or a standalone `.claude-plugin/plugin.json` "when no marketplace manifest
    is present".
  - GitHub only, daily sync plus "Sync now". "GitHub import and sync do not
    apply repository installation or authentication policies." Admins set
    Available or Installed per role.
  - A removed entry is marked "No longer in source". "If an update to an
    existing plugin is invalid, its last working version is retained."
    (#keep-plugins-up-to-date) A `pluginId` field moves an existing workspace
    plugin under GitHub management.
  - Repo settings "don't change workspace installation policies for plugins
    imported through Admin > Plugins". (D/build/plugins#enable-or-disable-a-plugin-for-a-repo)
- **Control layers.** Availability, included skills, MCP server access,
  actions and permissions, service authorization, runtime permissions.
  (L/enterprise/apps-and-connectors#understand-the-capability-chain)
- **Who can publish to a workspace** disagrees between pages; see "Where
  sources disagree".
- "Enterprise admins can deploy required scripts through mobile device
  management (MDM)." (D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks)

## Hooks

A hook is a command (or MCP tool call) Codex runs when an event matches.
Hooks reached general availability in May 2026 (L/whats-new#automate-trusted-workflows;
L/changelog#codex-2026-05-13-app, an entry dated 2026-05-14: "This launch
also includes Hooks general availability"). The `hooks` feature flag is Stable and on
(GH/codex-rs/features/src/lib.rs:1319-1324).

### Events

| Event | When | Matcher filters | Plain stdout | `additionalContext` |
| --- | --- | --- | --- | --- |
| `SessionStart` | Start; sources `startup`, `resume`, `clear`, `compact` | source | Developer context | Yes |
| `UserPromptSubmit` | Each prompt | ignored | Developer context | Yes |
| `PreToolUse` | Before a covered tool call | tool name | Ignored | Yes, without blocking |
| `PermissionRequest` | "when Codex is about to ask for approval" | tool name | Ignored | No |
| `PostToolUse` | After a covered tool call, including non-zero exits | tool name | Ignored | Yes |
| `PreCompact`, `PostCompact` | Around compaction | `manual` or `auto` | Ignored | No |
| `SubagentStart` | A subagent starts | agent type | The subagent's context | Yes |
| `SubagentStop` | A subagent stops | agent type | Invalid | No |
| `Stop` | The main turn ends | ignored | Invalid | No |
| `Interrupt` | The person interrupts an active main turn | ignored | Invalid; only `systemMessage` | No |
| `SessionEnd` | Main thread ends | reason | n/a; output advisory | No output schema |

Sources: the event table and per-event sections of L/hooks, and the
generated schemas in GH/codex-rs/hooks/schema/generated/ (12 input schemas,
11 output schemas; no session-end output).

Notes per event:

- **SessionStart after compaction.** "After Codex compacts a root session,
  SessionStart hooks that match source: "compact" run before the next model
  request", including mid-turn. "If the hook returns `continue: false`, Codex
  ends the turn without sending another model request." (L/hooks#sessionstart)
  The inbox's SessionStart hook has no matcher, so it fires on compact
  (codex/plugin/hooks/hooks.json:3-7).
- **SessionStart `fork`.** The schema on `main` adds a fifth source, `fork`
  [source] (GH/codex-rs/hooks/schema/generated/session-start.command.input.schema.json).
  The docs list four. The hooks page warns that "main branch schemas may
  include hook fields that are not in the current release".
- **SessionStart resume.** It fires again on resume, and earlier guidance is
  still in the conversation [live] (docs/plans/codex-plugin.md:395).
- **SessionEnd.** "runs for the main thread when you archive or delete a
  conversation that's still open, when Codex closes normally, or after a
  conversation has been idle and isn't open in any connected client for 30
  minutes." "Switching away from a conversation or calling thread/unsubscribe
  doesn't end the session right away." "Your hook can still read the session
  transcript while it runs." `reason` is always `other`. It does not run for
  subagents. The example payload has `"session_id": "thr_123"`.
  (L/hooks#sessionend)
- **Interrupt.** "doesn't run for idle threads or subagents". "Hook output
  can't prevent the interruption or restart the turn." (L/hooks#interrupt)
- **PermissionRequest.** "runs when Codex is about to ask for approval, such
  as a shell escalation or managed-network approval… It doesn't run for
  commands that don't need approval." Any `deny` wins; "an `allow` lets the
  request proceed without surfacing the approval prompt". With no decision,
  the normal flow runs. `updatedInput`, `updatedPermissions` and `interrupt`
  "fail closed today". `tool_input.description` is a "Human-readable approval
  reason, when Codex has one". (L/hooks#permissionrequest) [inference] The
  hook firing does not prove the person sees a prompt: under "Approve for me",
  eligible requests go "through automatic review instead of showing a prompt
  for manual approval" (L/permission-modes#choose-a-mode).
- **Compaction hooks can stop work.** A PreCompact `continue: false` "stops
  before compacting"; PostCompact "stops after compacting".
  (L/hooks#precompact, #postcompact)
- **SubagentStart ignores `continue: false`.** (L/hooks#common-output-fields)

### Matchers and tool coverage

- A matcher is a regex. `"*"`, `""` or none matches all. (L/hooks#matcher-patterns)
- Shell and unified exec both match as `Bash`. `apply_patch` also matches
  `Edit` and `Write`. `spawn_agent` also matches `Agent`. MCP tools match as
  `mcp__<server>__<tool>`. Hosted tools such as WebSearch are not covered.
  (L/hooks#matcher-patterns, #tool-coverage)
- "Some specialized tool paths can opt out of the default hook path. Treat
  tool hooks as a useful guardrail, not a complete enforcement boundary."
  (L/hooks#tool-coverage)
- Unified exec: "A later `write_stdin` poll can deliver the original command's
  `PostToolUse` when that command finishes." `write_stdin` "doesn't run
  `PreToolUse` again". (L/hooks#tool-coverage)
- Code mode: PreToolUse can block or rewrite a call made from JavaScript. A
  blocking PostToolUse rejects the promise. (L/hooks#tool-calls-from-code-mode)
- **Live shapes** [live] (docs/plans/codex-plugin.md:325-327):
  - Shell: `tool_name` is `Bash`, `tool_input.command` is the command,
    `tool_response` is the output text only, with no exit code.
  - Patch: `apply_patch` fires Pre and PostToolUse. `tool_input.command` is
    the patch; its `*** Add File:`, `*** Update File:` and `*** Delete File:`
    lines name the files.
  - MCP tools appear as `mcp__<server>__<tool>`, so PreToolUse sees them.
- **A long command got no PostToolUse.** A 20-second command in the desktop
  app got none, because code mode returns after about 1 second [live]
  (docs/plans/codex-plugin.md:373-378). The exit code is in the transcript
  instead (see "Transcripts").
- **The repo's matcher** is `Bash|apply_patch|mcp__.*` on PreToolUse
  (codex/plugin/hooks/hooks.json:13-17).

### Input

- **Common fields.** `session_id` ("Subagent hooks use the parent session
  id."), `transcript_path` (string or null), `cwd`, `hook_event_name`,
  `model`, plus `turn_id` on turn-scoped events. `permission_mode` is one of
  `default|acceptEdits|plan|dontAsk|bypassPermissions`. (L/hooks#common-input-fields)
- **Schema details** [source] (GH/codex-rs/hooks/schema/generated/*.input.schema.json):
  - Every input schema has `additionalProperties: false`.
  - SessionEnd requires only `cwd`, `hook_event_name`, `reason` (const
    `other`), `session_id`, `transcript_path`. No `model`, no `permission_mode`.
  - Pre/PostCompact have no `permission_mode`.
  - Optional `agent_id` and `agent_type` appear on PreToolUse, PostToolUse,
    PermissionRequest, UserPromptSubmit, PreCompact and PostCompact. The docs
    list them only on SubagentStart and SubagentStop. Stop, Interrupt and
    SessionStart have neither.
  - PreToolUse requires `tool_use_id`; PermissionRequest has none.
  - Stop requires `stop_hook_active` and `last_assistant_message` (nullable).
  - SubagentStop requires `agent_transcript_path`.
- **The repo's `HookInput` type** omits `model`, `permission_mode` and
  `tool_use_id` (codex/src/hook.ts:31-43).
- [inference] A subagent's prompts and tool calls carry the parent's
  `session_id`. Without a check on `agent_id`, they would land in the parent
  session's inbox.

### Output

- **Common fields.** `continue`, `stopReason`, `systemMessage` ("Surfaced as a
  warning in the UI or event stream"), `suppressOutput` ("Parsed today but not
  yet implemented"). "Exit 0 with no output is treated as success."
  (L/hooks#common-output-fields)
- **PreToolUse.** Deny with `permissionDecision: "deny"`, legacy
  `{"decision":"block"}`, or exit 2 with the reason on stderr. Rewrite with
  `permissionDecision: "allow"` plus `updatedInput`. `"ask"`, legacy
  `approve`, `continue: false`, `stopReason` and `suppressOutput` are "parsed
  but not supported yet. Codex marks the hook run as failed, reports the
  error, and continues the tool call." (L/hooks#pretooluse) The schema still
  lists `ask` and `approve` [source].
- **PostToolUse.** `decision: "block"` "replaces the tool result with that
  feedback". `updatedMCPToolOutput` is parsed but unsupported.
  (L/hooks#posttooluse)
- **UserPromptSubmit** can block with `decision: "block"` or exit 2.
  (L/hooks#userpromptsubmit)
- **Stop.** `decision: "block"` "tells Codex to continue and automatically
  creates a new continuation prompt that acts as a new user prompt, using
  your reason". `continue: false` from any Stop hook wins. (L/hooks#stop) The
  stop output schema has only `continue`, `decision`, `reason`, `stopReason`,
  `suppressOutput`, `systemMessage` [source].
- **Live** [live] (docs/plans/codex-plugin.md:391-396): SessionStart and
  UserPromptSubmit `additionalContext` reached the model as a developer
  message; PreToolUse `deny` stopped the command; Stop `{decision: "block",
  reason}` continued the turn and the next Stop had `stop_hook_active: true`.
- **Size limit.** "By default, Codex limits each model-visible hook-output
  message to roughly 2,500 tokens." Larger text is spilled to
  `<temp_dir>/hook_outputs/<session_id>/<uuid>.txt` with a head-and-tail
  preview. `additionalContextLimit` per handler (positive, or `0` for
  unlimited) raises it. "The setting applies only to `additionalContext`.
  Tool feedback and continuation prompts keep the default limit." "Context
  from multiple hooks and plugins adds up and can degrade model performance."
  For events that cannot produce context, Codex "ignores
  `additionalContextLimit` and reports a configuration warning".
  (L/hooks#large-hook-output) The repo's hooks set no `additionalContextLimit`
  (codex/plugin/hooks/hooks.json).

### Background hooks, timeouts and handler types

- **`async: true`** applies to command hooks only. "Background hooks can't
  block, approve, rewrite, or otherwise control the operation that triggered
  them." (L/hooks#run-hooks-in-the-background)
- **Delivery.** "If a turn is active, Codex waits for the current model
  request and tool calls to finish, then makes the output available to the
  next model request in that turn. If no turn is active, Codex waits until the
  next user turn. Finishing a background hook doesn't start a new turn."
  (L/hooks#how-background-hooks-run)
- **Limits.** "Codex runs up to eight background hooks concurrently per
  session. Additional hooks wait." That caps concurrency, not the total.
  "When the session ends, Codex cancels unfinished background hooks and
  discards output that hasn't been delivered." (L/hooks#limitations)
- **Timeouts.** Default 600 s. "`SessionEnd` and `Interrupt` use `1` second by
  default and support up to `3` seconds." (L/hooks#config-shape) Interrupt:
  "including when they run in the background", and "Configured timeouts are
  limited to one through three seconds" (L/hooks#interrupt). "`SessionEnd`
  hooks always run synchronously, even when `async` is `true`."
  (L/hooks#sessionend) The repo's Stop hook sets `timeout: 60` and no `async`
  (codex/plugin/hooks/hooks.json:19-29).
- **Handlers.** "`command` and `mcp_tool` handlers are supported. `prompt` and
  `agent` handlers are parsed but skipped." "Commands run with the session cwd
  as their working directory." Other fields: `statusMessage`,
  `commandWindows`, a top-level `description`. For repo-local hooks, "prefer
  resolving from the git root … Codex may be started from a subdirectory".
  (L/hooks#config-shape)
- **MCP tool hooks** (L/hooks#mcp-tool-hooks, #execution-and-lifecycle):
  - Shape: `type: "mcp_tool"`, `server`, `tool`, and `input` templates with
    `${tool_input.x}`.
  - "Hooks use an existing MCP connection. They don't start or reconnect
    servers." "SessionStart hooks can run before an MCP server is ready."
    "SessionEnd doesn't support MCP tool hooks."
  - "MCP tool hooks run synchronously. They don't request tool approval or
    trigger other hooks." "The shorter hook or server timeout applies. Time
    spent waiting for an MCP elicitation response doesn't count against the
    timeout."
  - It "uses the same trust review and output contract as a command hook". "A
    hook can block an operation when the tool returns a blocking decision.
    Errors, missing servers, and unavailable tools don't block the operation."
  - How a text or `structuredContent` result becomes hook output JSON is
    [unknown].
  - [inference] An `mcp_tool` PreToolUse hook could replace spawning Node per
    matched tool call.

### Where Codex finds hooks, and trust

- Codex looks for `hooks.json` or inline `[hooks]` next to each active config
  layer, and in plugins. "Higher-precedence config layers don't replace
  lower-precedence hooks." "Matching hooks from multiple files all run."
  "Multiple matching command hooks for the same event are launched
  concurrently". "Project-local hooks load only when the project .codex/ layer
  is trusted." (L/hooks, top and #where-codex-looks-for-hooks)
- **Plugin hook files.** "Codex discovers `hooks/hooks.json` by default when
  the selected OpenAI extension or compatibility manifest doesn't define
  `hooks`." `hooks` can be a path, array of paths, inline object or array of
  objects. "An explicit value replaces default-file discovery; it doesn't add
  to `hooks/hooks.json`." Paths start with `./` and stay in the plugin root.
  "Plugin hooks use the same event schema as regular hooks."
  (D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks)
- **Trust.** "Non-managed hooks must be reviewed and trusted before they run."
  "Installing or enabling a plugin doesn't automatically trust its hooks.
  Plugin-bundled hooks are non-managed hooks, so Codex skips them until the
  user reviews and trusts the current hook definition."
  (L/hooks; D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks) Review is
  in the CLI's `/hooks`; "If hooks need review at startup, Codex prints a
  warning." `--dangerously-bypass-hook-trust` skips trust for one invocation,
  with `codex` and `codex exec`. (L/hooks#review-and-trust-hooks,
  L/developer-commands?surface=cli)
- **Trust keys.** `<plugin_id>:<source_relative_path>:<event>:<group_index>:<handler_index>`,
  for example `demo@test:hooks/hooks.json:pre_tool_use:0:0`. Skipped `prompt`
  and `agent` handlers still take an index. [source]
  (GH/codex-rs/hooks/src/declarations.rs:12-37, 52-100) Live, `config.toml`
  holds `[hooks.state."inbox@inbox:hooks/hooks.json:<event>:<i>:<j>"]
  trusted_hash = "sha256:…"` for `session_start`, `user_prompt_submit`,
  `pre_tool_use` and `stop` [live 2026-10-08].
  - [inference] Reordering hooks changes the keys, so it forces re-trust.
  - Whether changing only `dist/hook.mjs` forces re-trust is [unknown].
  - Hooks were trusted and ran in a desktop app session [live]
    (docs/plans/codex-plugin.md:421-423). The docs describe trust review only
    in the CLI's `/hooks`.
- **Environment.** "Plugin hook commands receive the Codex-specific
  environment variables `PLUGIN_ROOT` and `PLUGIN_DATA`. `PLUGIN_ROOT` points
  to the installed plugin root, and `PLUGIN_DATA` points to the plugin's
  writable data directory. Codex also sets `CLAUDE_PLUGIN_ROOT` and
  `CLAUDE_PLUGIN_DATA` for compatibility with existing plugin hooks."
  (D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks; L/hooks#plugin-bundled-hooks)
  No page says MCP servers get these.
- **`CODEX_CLI_PATH`.** Every hook gets `CODEX_CLI_PATH`, the path of the
  desktop app's `codex` [live] (docs/plans/codex-plugin.md:361-365). No docs
  page mentions it or `CODEX_MCP_NODE_PATH`. The environment-variable page
  "does not list internal development variables" (L/config-file/environment-variables),
  so neither has a stability promise.
- **Plugin hooks flag.** `plugin_hooks` is `Stage::Removed`
  (GH/codex-rs/features/src/lib.rs:1605-1609); Removed means "The feature flag
  is useless but kept for backward compatibility reason" (lib.rs:60-61).
  [inference] No separate flag gates plugin hooks. They still need `hooks`
  on, trust, and no `allow_managed_hooks_only`.

### Where hooks run

- Plugin hooks load "alongside user, project, and managed hooks. This
  includes ChatGPT Work and Codex. Hook scripts must exist in the execution
  environment". (D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks)
- "Lifecycle hooks are supported for plugins installed manually in Codex
  desktop." (same section)
- Cloud orchestration: "Command hooks and hooks from local configuration or
  plugins do not run, even when tools execute locally and the plugin itself is
  allowed … When both orchestration and execution are local, existing
  supported hooks continue to work in local-only Work and Codex threads."
  (L/enterprise/apps-and-connectors#step-2-manage-capabilities) "Plugin hooks
  are not supported in cloud-orchestrated ChatGPT Work." (L/plugins#overview)
- Managed PreToolUse callbacks fail open: "a `PreToolUse` callback error,
  timeout, or malformed response can fail the hook without blocking the
  tool." (L/hooks#managed-hooks-from-requirementstoml)
- **Live:** every hook fired in a desktop thread [live]
  (docs/plans/codex-plugin.md:331). `codex exec --ephemeral
  --ignore-user-config` fired no plugin hooks and saved no session [live]
  (docs/plans/codex-plugin.md:328).
- **Telling an `exec` run apart.** SessionStart input in `exec` looks the
  same. The transcript's `session_meta` has `originator: "codex_exec"` and
  `source: "exec"` [live] (docs/plans/codex-plugin.md:329). Live, one of two
  recent `codex_exec` transcripts had `source: {subagent: …}` instead
  [live 2026-10-08]. `isExecRun` checks either field (codex/src/transcript.ts:32-34).
- [inference] Hooks and their per-reply `codex exec` can fire in Codex CLI
  and local Work threads where no tab exists. The plugin has no surface gate.
- **Telemetry.** OTel metrics `hooks.run` and `hooks.run.duration_ms`, tagged
  `hook_name`, `source`, `status`. (L/config-advanced#turn-and-tool-activity)
  app-server emits `hook/started` and `hook/completed`, but "These
  notifications aren't emitted for asynchronous hooks." (L/app-server#turn-events)

## MCP servers, as Codex hosts them

- **Supported.** Stdio and streamable HTTP servers, bearer tokens, OAuth, and
  ChatGPT-session auth for first-party servers. (L/extend/mcp#supported-mcp-features)
- **Shared config.** "The ChatGPT desktop app, Codex CLI, and IDE extension
  support MCP servers and share MCP configuration for the same Codex host."
  (L/extend/mcp)
- **Server instructions.** "Codex reads the MCP `instructions` field returned
  during initialization and uses it as server-wide guidance… Keep the first
  512 characters self-contained." (L/extend/mcp#supported-mcp-features;
  D/build/mcp-server#create-the-server) [inference] The inbox's guidance could
  move here from the SessionStart hook. Whether Codex re-reads `instructions`
  after compaction is [unknown].
- **Timeouts and startup.** `startup_timeout_sec` (default 10),
  `tool_timeout_sec` (default 60). `required = true` makes startup fail if the
  server can't initialize. `mcp_optional_startup_grace_ms` "defaults to 1000
  milliseconds" for the initial tool catalog; 0 waits for each server's
  startup timeout. (L/extend/mcp#other-configuration-options) [inference] The
  inbox server starts through `/bin/sh` and Node; if that takes over 1 s, its
  tools may miss the first turn's catalog.
- **Tool filters.** `enabled`, `enabled_tools`, `disabled_tools` (applied after
  `enabled_tools`). (L/extend/mcp#other-configuration-options) The full list of
  `mcp_servers.<id>.*` and `plugins.<plugin>.mcp_servers.<server>.*` keys is
  at L/config-reference#configtoml.
- **Destructive tools always prompt.** "Destructive app/MCP tool calls always
  require approval when the tool advertises a destructive annotation (unless
  the tool advertises a read annotation, which takes priority)."
  (L/agent-approvals-security#sandbox-and-approvals) app-server says the same:
  "Destructive tool annotations always trigger approval even when the tool
  also advertises less-privileged hints." (L/app-server#mcp-tool-call-approvals-apps)
  Whether `approval_mode = "approve"` overrides that is [unknown].
- **Automatic review.** It evaluates "side-effecting app and MCP tool calls"
  that need approval, and "uses extra model calls, so it can add to Codex
  usage." (L/agent-approvals-security#automatic-approval-reviews)
- **Elicitations.** `approval_policy.granular.mcp_elicitations = true` lets
  MCP elicitation prompts surface "instead of being auto-rejected".
  (L/config-reference)
- **Network.** The command network proxy "does not filter … MCP server
  connections". (L/agent-approvals-security#traffic-outside-the-command-network-proxy)
  "App and connector traffic is not controlled by the sandboxed-command
  network proxy or its domain allowlist." (L/config-reference, `features.apps`)
- **Live process behavior** [live] (docs/plans/codex-plugin.md:327, :334):
  - `initialize` and the server's environment carry no session id. A server
    learns its session at its first tool call.
  - One desktop app-server started 17 probe server processes in three
    minutes. Most got only `initialize` and `tools/list`. The tab's server
    lived at least 2.5 minutes, across turns.
  - So state must live in files or in one process the others can reach. The
    repo keeps one JSON file per session under an mkdir lock
    (codex/src/state.ts:158-188).
- **The inbox server's handshake** [repo]: it echoes the client's
  `protocolVersion` or defaults to `2025-06-18`, returns
  `capabilities: { tools: {}, resources: {} }` and
  `serverInfo: { name: 'inbox', version: '0.1.0' }`, and implements no
  `server/discover` (codex/src/server.ts:193-198).
- **Removed: `codex mcp-server`.** "The `codex mcp-server` command and the
  standalone `codex-mcp-server` binary have been removed." Deprecated
  2026-08-24, removed 2026-09-05. app-server "isn't an MCP server or a
  drop-in replacement for an MCP client." (L/mcp-server,
  L/changelog#codex-2026-08-24, #codex-2026-09-05)

## Plugin UI: MCP Apps and OpenAI entrypoints

MCP Apps is an MCP extension. A tool names a `ui://` HTML resource, and the
host renders it in a sandboxed iframe that talks to the host over JSON-RPC on
`postMessage`. OpenAI adds "entrypoints", which let a person open an app
without the model calling it. The Inbox tab is a thread entrypoint.

### Which product the docs say renders UI

- **developers.openai.com scopes UI to ChatGPT.** "Components run inside an
  iframe in ChatGPT, communicate with the host through the MCP Apps bridge
  (JSON-RPC over `postMessage`)". "Keep the MCP tools useful without a
  component so ChatGPT and Codex can complete the workflow without UI."
  (D/build/chatgpt-ui#overview) The docs index says "Build an MCP server for
  ChatGPT and Codex, with optional UI in ChatGPT." (D/llms.txt)
  Troubleshooting: "UI, widget state, and client-authentication checks on
  this page describe ChatGPT behavior." (D/deploy/troubleshooting#how-to-triage-issues)
- **The extensions spec names ChatGPT surfaces only.** SPEC:L3 lists "ChatGPT,
  including ChatGPT Work, ChatGPT Desktop, and ChatGPT mobile apps". Codex
  appears only in the desktop deep-link scheme: "`codex` on desktop. `chatgpt`
  on mobile." (SPEC:L141)
- **The sample plugin is a Codex plugin.** BB's README calls it "a
  kitchen-sink example of the core MCP extensions available in Codex", says
  "Open the Parts Library from the Codex sidebar", and ships
  `.codex-plugin/plugin.json` with a stdio server (`node ./dist/server.js`,
  `StdioServerTransport`). Its marketplace is "OpenAI MCP Extensions (Early
  Access)".
- **Live:** a thread tab opened from the local inbox plugin in the desktop
  app [live] (docs/plans/codex-plugin.md:54, :332).
- **CLI:** `enable_mcp_apps` is `Stage::UnderDevelopment` and off
  (GH/codex-rs/features/src/lib.rs:244, 1503-1508; `codex features list`
  [live 2026-10-08]). No learn.chatgpt.com page mentions MCP Apps, `ui://` or
  `enable_mcp_apps`. `features.apps` is "app (connector) integrations", a
  different thing. (L/config-basic#common-feature-flags)
- **Codex advertises the extension.** `MCP_APP_UI_EXTENSION_ID =
  "io.modelcontextprotocol/ui"` is advertised in client capabilities [source]
  (GH/codex-rs/protocol/src/mcp.rs:34, used at :584 and :599).
- **Platform table is a forecast.** "This table describes expected support at
  DevDay launch." (SPEC:L16) It lists thread entrypoints on Desktop, Web, iOS
  and Android. File entrypoints, file opening, file resources and composer
  at-mentions are desktop only.
- **DevDay framing.** Plugin Extensions sit under "Sites & plugins": "Add
  sidebar apps, conversation panels, file viewers and editors, and forms to
  ChatGPT. Composer mentions are available only in the desktop app. Free and
  Go web extensions are coming soon." (L/whats-new/devday-2026#plugin-extensions)

### Entrypoints

- **Declaration.** `_meta["openai/ui"].entrypoints: [{ type: "global" }]`
  beside `_meta.ui.resourceUri`. "Use `{ type: "thread" }` to add an
  entrypoint in a conversation's side panel." (D/build/extensions#sidebar-apps)
  The inbox declares `[{ type: 'thread' }]` (codex/src/server.ts:38).
- "Normally, MCP Apps can only be invoked via the model. However, it may be
  convenient to allow users to open your MCP App via static entrypoints."
  (SPEC:L36) Up to three per app: global, thread ("Available as a content tab
  within a thread"), file. (SPEC:L40-44)
- **Visibility is ignored.** "`_meta["ui"]["visibility"]` normally controls
  model versus user visibility. This field is ignored when an MCP App is
  invoked as an entrypoint." (SPEC:L49)
- **Render from the first result.** "MCP Apps SHOULD use the initial tool
  result for their first render without calling the tool again." (SPEC:L50)
  "Register `app.ontoolresult` before `app.connect()` to render the initial
  result instead of calling the tool again, which delays rendering and causes
  visible flicker." (TSR:L42) The inbox tab instead calls `poll()` right after
  `ui/initialize` and has no `tool-result` handler (codex/src/tab.tsx:886-894).
- **Thread entrypoint.** "The server receives `{}` as the tool arguments when
  the entrypoint opens." "Every thread will have a different instance of the
  entrypoint." (SPEC:L218-225)
- **Global entrypoint.** The server MUST accept `{}`. "On desktop, global
  entrypoints open with a composer and thread layout, with the app as a
  permanent tab. Requests that target the current thread, such as
  `ui/update-model-context` and `ui/message`, use that thread." (SPEC:L95-97)
  [inference] A global "every session" view would itself live in a thread.
- **Title.** "MCP Servers SHOULD provide a unique title for each thread
  entrypoint that describes the view's contents and differs from the plugin
  name" (SPEC:L38). Title order: `title`, `annotations.title`, `name`
  (SPEC:L82-85). The inbox's tool is titled "Inbox", the plugin name
  (codex/src/server.ts:34-35).
- **Icons.** SHOULD be on each entrypoint tool: SVG, monochrome, transparent,
  `currentColor`, 20x20 viewport, 1.33px strokes (SPEC:L56-63). Fallback: the
  tool icon, then the "Local MCP Server icon, or the app logo registered with
  OpenAI for hosted MCP Apps", then a "Generic fallback icon". "Server icons
  come from `_meta["io.modelcontextprotocol/serverInfo"]["icons"]` in
  `server/discover`; servers without `server/discover` use
  `serverInfo["icons"]` in `initialize`." (SPEC:L67-73) The inbox sets no
  icons on the tool or `serverInfo` (codex/src/server.ts:33-39, :197).
- **File entrypoints.** `extensions` MUST use the dot form (SPEC:L288). The
  tool gets `{file: {name, resourceUri}}`; `resourceUri` is opaque.
  "`resources/read` and `resources/subscribe` work. However, they will be
  intercepted and handled by ChatGPT instead of the MCP Server."
  (SPEC:L288-293) "ChatGPT will never directly provide raw filesystem paths to
  MCP Apps" (SPEC:L373-377).
- **Undocumented entrypoint types in examples.** TSR:L132-163 and BB use
  `{type: "settings", searchTerms}`, a global `quickAction`, and BB uses
  `"openai/iconStyle": "monochrome"`. None are in SPEC's list.
- **The sample's entrypoint tool matches the inbox pattern.** BB `cad.tray` has
  no `visibility`, returns the full view in `structuredContent` with
  `content: []`, is titled with the plugin name, and has no tool icon
  (BB `src/server/register.ts:36-38`, `:160-189`).

### Display modes

- "ChatGPT currently supports `inline` and `fullscreen`, but not `pip`."
  "ChatGPT uses the `fullscreen` display mode for all entrypoints specified
  above." "by default, all MCP Apps invoked by the model are displayed inline
  first." (SPEC:L857-861)
- Resource metadata `_meta["openai/ui"].availableDisplayModes` and
  `preferredDisplayMode`. Servers that advertise
  `appCapabilities.availableDisplayModes` "SHOULD also set this field". "When
  resource metadata omits both display-mode fields, ChatGPT uses
  `appCapabilities.availableDisplayModes` after initialization."
  (SPEC:L863-871) Declaring modes on the resource lets ChatGPT open "in
  fullscreen immediately, without showing an inline loading state first."
  (D/reference#declare-display-modes-before-the-ui-loads)
- Stable spec: modes are `inline | fullscreen | pip`. A view MUST declare the
  modes it supports (APPSPEC:L781). The host "MUST NOT switch the View to a
  display mode that does not appear in its
  `appCapabilities.availableDisplayModes`, if set" (APPSPEC:L786).
- The inbox tab declares `appCapabilities: { tools: {} }` and no display modes
  (codex/src/tab.tsx:889). `appCapabilities.tools` means "App exposes MCP-style
  tools that the host can call" (APPSPEC:L518); the tab serves none.

### The bridge: standard calls and ChatGPT aliases

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
  no thread id [live] (docs/plans/codex-plugin.md:332).
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
  `styles.variables` (codex/src/tab.tsx:104-107).

### What the model sees in a tool result

| Source | `structuredContent` | `_meta` |
| --- | --- | --- |
| D/reference#tool-results | "Surfaced to the model and the component"; "the model reads them verbatim" (#capabilities) | "Delivered only to the component. Hidden from the model." |
| D/build/mcp-server#return-useful-results-without-ui | "concise data the model can inspect and use in later calls" | "client-specific data hidden from the model" |
| APPSPEC:L1474 (Data Passing) | "Structured data optimized for UI rendering (not added to model context)" | n/a |

- "Only `structuredContent` and `content` appear in the conversation
  transcript." (D/reference#tool-results)
- "Declare `outputSchema` for any tool that returns `structuredContent`."
  (D/reference#tool-descriptor-parameters) `inbox`, `inbox_view` and
  `inbox_press` declare none (codex/src/server.ts:33-55).
- "Tools MUST return meaningful content array even when UI is available"
  (APPSPEC:L1559). BB and SPEC's own settings examples return `content: []`.
- "Return enough structured content for both the model and UI to understand
  the new state." (D/build/chatgpt-ui#keep-business-data-on-the-server)
- "Treat `_meta` as hidden from the model, not as a substitute for
  authorization or secure storage." (D/build/mcp-server#return-useful-results-without-ui)
- [inference] If Codex follows D/reference, every tab open puts the whole
  inbox view into the transcript, because the `inbox` tool returns it in
  `structuredContent` (codex/src/server.ts:170-172). What Codex actually does
  is [unknown].
- **Split render and data tools.** "Only the render tool should include
  `_meta.ui.resourceUri`." "Let the UI call data tools directly for local
  interactions … without remounting the widget." (D/build/chatgpt-ui#decoupled-pattern)
  "Components feel sluggish when tool calls take longer than a few hundred
  milliseconds." (D/deploy/troubleshooting#server-side-issues)

### `ui/message`

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
  (docs/plans/codex-plugin.md:333). No doc describes this wrapping.
- `target: "new"` opens a new conversation (SPEC:L1175-1185), so it cannot
  route to a known session.

### `ui/update-model-context`

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

### Tool visibility and app-only tools

- Default visibility is `["model", "app"]`. `"app"`: "Tool is callable by the
  app from the same server connection only". "Host MUST NOT include tools in
  the agent's tool list when their visibility does not include "model"".
  "Host MUST reject `tools/call` requests from apps for tools that don't
  include "app" in visibility". (APPSPEC:L395-402)
- "Servers SHOULD check client capabilities before registering UI-enabled
  tools" (APPSPEC:L1529-1560). The client declares
  `capabilities.extensions["io.modelcontextprotocol/ui"].mimeTypes` at
  `initialize` (L1498-1522). The inbox server does not check
  (codex/src/server.ts:193-198).
- "Extensions are always opt-in: a client only uses an extension if both
  client and server declare support in the `extensions` field of their
  capabilities." (MATRIX) The inbox server declares no extensions, and Codex
  renders the tab anyway [live].
- The host "MAY decide to block some messages or subject them to further user
  approval" (APPSPEC:L487).
- Whether Codex enforces visibility is [unknown].

### Resource metadata, CSP and sandbox

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
- "Bundle or inline the CSS in your app's HTML. The default iframe CSP can
  block external stylesheets." (TSR:L96)
- The inbox resource sets no `_meta.ui` (codex/src/server.ts:214-215), so the
  default CSP applies. All data goes through `tools/call` and the bundle is
  inline, so that is fine today.

### ChatGPT-only `window.openai` and client `_meta`

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

### Live updates

- **Subscriptions are documented only for file viewers.** "MCP Apps MAY
  subscribe to changes to their `resourceUri` with `resources/subscribe`"
  (SPEC:L425-429), in the file-entrypoint section, where the host handles the
  calls (SPEC:L292). BB subscribes only to the opened file
  (BB `src/app/controller.ts:369`).
- **Live:** a thread tab's `resources/subscribe` never reached the server, and
  no update arrived in two minutes. Polling a tool every 5 s worked [live]
  (docs/plans/codex-plugin.md:332). The tab now polls every 3 s
  (codex/src/tab.tsx:52).
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

### Other OpenAI extensions

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

### UI guidelines

- Inline cards: at most two primary actions; "No deep navigation or multiple
  views within a card"; "No nested scrolling". (D/concepts/ui-guidelines#inline-card)
- Fullscreen: "Design your UX to work with the system composer".
  (#fullscreen)
- "Don't use custom fonts, even in full screen modes". Icons "monochromatic
  and outlined". WCAG AA contrast. (#visual-design-guidelines)
- [inference] A three-tab pane fits a side panel, not an inline card. A
  cross-host design needs a compact and a full layout chosen from
  `hostContext.displayMode` and `containerDimensions`.

### Which hosts support MCP Apps

- APPS#client-support lists Claude, Claude Desktop, VS Code GitHub Copilot,
  Microsoft 365 Copilot, Goose, Postman, MCPJam and Archestra.AI.
- MATRIX adds ChatGPT, Cursor and PostHog Code. "This list is maintained by
  the community."
- Neither lists Codex or Claude Code. Whether Claude Code or the Claude
  desktop app's Code mode renders MCP Apps is not answered here.
- [inference] Of the inbox's MCP surface, only `_meta["openai/ui"].entrypoints`
  is OpenAI-specific (codex/src/server.ts:38). The same `ui://inbox/tab`
  resource could render in other MCP Apps hosts, opened by the model and
  inline.

## Session, thread and turn ids

A thread is Codex's stored conversation. A session id names the tree of
threads a root thread and its forks belong to. They differ after a fork.

- "`thread.sessionId` identifies the current live session tree root. Root
  threads use their own thread id as the session id; forked threads keep the
  session id of the root they came from. Clients should read the session id
  from `thread.sessionId` instead of deriving it from the thread id."
  (L/app-server#start-or-resume-a-thread) The `Thread` object also has
  `forkedFromId`, `parentThreadId` ("only be set if this thread is a
  subagent"), `ephemeral`, `section`, `projectId` [source]
  (GH/codex-rs/app-server-protocol/schema/typescript/v2/Thread.ts).
- **Hooks.** `session_id` on hook input. "Subagent hooks use the parent
  session id." (L/hooks#common-input-fields) The SessionEnd example uses
  `"thr_123"`. [inference] The hook `session_id` is a thread id.
- **Three `_meta` shapes on MCP calls:**

  | Caller | Where the id is | Source |
  | --- | --- | --- |
  | The model | `_meta["x-codex-turn-metadata"]` with `session_id`, `thread_id`, `turn_id`, `turn_trigger`, `forked_from_thread_id`, `parent_thread_id`, `thread_source`, plus `_meta.callId` | [live] docs/plans/codex-plugin.md:327; [source] GH/codex-rs/core/src/mcp_tool_call.rs:1311-1344, turn_metadata.rs:275-312, :440-490, responses_metadata.rs:418-445 |
  | The desktop tab | `_meta.thread_id`, "equal to the hooks' `session_id`" | [live] docs/plans/codex-plugin.md:332 |
  | app-server `mcpServer/tool/call` | The caller's own `_meta` object with `threadId` added; `{threadId}` if the caller sent none; a non-object `_meta` passes unchanged. No `x-codex-turn-metadata`. | [source] GH/codex-rs/app-server/src/request_processors/mcp_processor.rs:16, :679-701, :715-737 |

- The model-call payload strips `agent_name`, `parent_turn_id` and
  `root_turn_id`, and adds `codex_version`. "Never serialize harness-owned tool
  inventory for external MCP servers." [source] (GH/codex-rs/core/src/turn_metadata.rs:275-312)
- **The inbox resolver.** `sessionOf` reads
  `x-codex-turn-metadata.session_id`, then `thread_id`, then `threadId`
  (codex/src/server.ts:73-79). [inference] In a fork, `session_id` is the
  root's. The inbox would then key state to the root and run
  `codex queue --thread <root>`, sending a press to the wrong chat. Reading
  `thread_id` first would key rows to the chat the person is in. Not checked
  live.
- **Live transcripts on the test Mac** [live 2026-10-08, 60 most recent,
  metadata only]: 9 top-level threads had `id == session_id` and
  `thread_source: "user"`. 51 were subagent threads with
  `source: {subagent: …}` and `thread_source` `guardian_review` (45) or
  `subagent` (6); in all of them `id != session_id`, and in 28
  `session_id == parent_thread_id`. Whether plugin hooks fire in those
  threads, and with which id, is [unknown].
- [inference, source] Tool calls during a queued turn should carry
  `turn_trigger: "queue"`. Not checked live.

## Sending a press: `codex queue` and `thread/queue/*`

### What the code says [source]

- **No public doc mentions it.** The CLI overview lists 27 commands without
  `queue`; no fetched page or changelog entry contains "codex queue" or
  "thread/queue". (L/developer-commands?surface=cli#command-overview,
  L/app-server#api-overview, L/changelog)
- **Command.** "Queue a message for an existing session."
  (GH/codex-rs/cli/src/main.rs:209-210) `--thread <THREAD>` ("Session UUID or
  exact session name"), `--message <TEXT>` (non-empty), remote options and
  `-c` (GH/codex-rs/cli/src/queue_cmd.rs:12-27). "`codex queue` does not
  support image attachments" (queue_cmd.rs:45-47), although `--help` lists
  `-i/--image` [live 2026-10-08].
- **Path.** It sends `thread/queue/add` with one text input and a fresh
  UUIDv7 `clientUserMessageId` through a local or remote app-server
  (GH/codex-rs/tui/src/session_queue_commands.rs:1, :52, :111-126).
- **Daemon rule.** "--no-daemon cannot be used with codex queue. Queuing must
  discover the shared server to avoid writing through a separate server." It
  refuses to queue through an embedded server while a local daemon runs.
  (session_queue_commands.rs:32-50)
- **Name lookup.** A UUID goes straight to `thread/queue/add`. A name is
  looked up among active sessions only; a miss fails with "No active session
  found matching '{target}'." (session_queue_commands.rs:91-110)
- **Output.** "Queued message {id} for thread {thread_id}." (:78-81)
- **Old or gated servers.** "the {server} does not support thread/queue/add;
  update or restart the {server}", on method-not-found, an `experimentalApi`
  rejection, or "unknown variant `thread/queue/add`", through the implicit
  daemon or `--remote` only (:63-74, :130-142).
- **Methods.** `thread/queue/add`, `list`, `update`, `delete`, `reorder`,
  `start`, all `#[experimental]` (GH/codex-rs/app-server-protocol/src/protocol/common.rs:630-664).
  Notification `thread/queue/changed` with only `{ thread_id }`
  (common.rs:1960-1961; protocol/v2/thread.rs:2145-2147). It fires on add,
  update, reorder, delete and drain (GH/codex-rs/app-server/tests/suite/v2/thread_queue.rs:117-250).
- **Types.** `QueuedSubmission { id, input, clientUserMessageId }`. An update
  keeps `id` and `clientUserMessageId`. (protocol/v2/thread.rs:926-1027;
  thread_queue.rs:117-250)
- **Rejections** (GH/codex-rs/app-server/src/request_processors/thread_queue_processor.rs):
  - loaded ephemeral thread: "ephemeral thread does not support queued
    submissions" (:263-266);
  - unloaded archived thread: "session {id} is archived" (:284-287);
  - multi-agent-v2 sub-agents that cannot take direct input, and unloaded
    spawned sub-agents (:49-50, :296-313);
  - no service: "user message queue is unavailable" (:247-251);
  - bad image URLs and oversized input (:81, :325-329).
- **Cold threads.** `add` accepts a thread that is not loaded. `start` needs a
  loaded one, fails during an active turn, and fails while the server drains
  (:193-222, :253-292).
- **Capacity.** "queue cannot contain more than 100 submissions"
  (thread_queue.rs:328-366).
- **Idle dispatch.** Adding to an idle thread starts the turn at once, with
  `"turn_trigger": "queue"` in the request's `x-codex-turn-metadata`
  (thread_queue.rs:369-428).
- **Durability.** A persisted queued item dispatches on cold resume.
  Interrupting a turn keeps the queue. (thread_queue.rs:430, :560, :864-948)
- **Daemon.** CLI 0.156.0 added `/daemon` and `--no-daemon`; 0.157.0
  "Enabled automatic background-server startup for eligible interactive
  sessions". (L/changelog)

### What this repo saw [live]

| Case | Result | Source |
| --- | --- | --- |
| Idle thread | Arrived as a plain user message; the model followed it; `UserPromptSubmit` fired with the exact text | docs/plans/codex-plugin.md:357 |
| Busy thread | Started its own turn 14 ms after the running turn ended | :358 |
| Hand-off | `codex queue` exits in about 0.2 s; a row appears in `~/.codex/queue_1.sqlite` | :359 |
| Server-started press | An app-server started the inbox server; `mcpServer/tool/call` pressed an answer; the server ran `codex queue`; the message started a turn | :398 |
| `codex exec resume` | Also reads the queue and delivered the message | :397 |
| Ephemeral thread | `codex queue` fails | :398 |

- **Which binary.** The server uses the CLI path a hook saved, then
  `CODEX_CLI_PATH`, then its parent process if named `codex`, then `codex`
  (codex/src/server-main.ts:14-20, codex/src/server.ts:88).
- A press from the tab in the desktop app is not yet confirmed end to end
  (docs/plans/codex-plugin.md:3-4).

### User-facing queue behavior [doc]

- "**Steer** adds the message to the current run… **Queue** saves the message
  for the next run." "Queued messages appear above the composer, where you can
  edit, reorder, send, or delete them." Follow-up behavior is a setting, with a
  shortcut for the other behavior on one message. (L/prompting#steering-and-queuing,
  L/reference/settings#general)
- CLI: "Press Tab while Codex is working to queue a follow-up". "Codex parses
  queued slash commands when they run." (L/developer-commands?surface=cli)
- iOS 1.2026.237 (2026-09-01): "Queued prompts now sync with the connected
  host, remain editable, and send even when the app is in the background."
  (L/changelog)
- [inference] A person can edit inbox-sent text before it runs, and an edit
  keeps the submission's ids. The UI should say "queued" until the turn
  starts.

## `codex exec` (the per-reply update)

- "Codex streams progress to `stderr` and prints only the final agent message
  to `stdout`." (L/non-interactive-mode#basic-usage)
- Flags: `--ephemeral` ("Run without persisting session rollout files to
  disk"), `--ignore-user-config` ("Do not load `$CODEX_HOME/config.toml`.
  Authentication still uses `CODEX_HOME`."), `--ignore-rules`,
  `--disable <feature>` (repeatable; "translates to
  `-c features.<name>=false`"), `-m`, `-s read-only|workspace-write|danger-full-access`
  (read-only by default), `-C`, `--skip-git-repo-check`, `--output-schema`,
  `-o/--output-last-message`, `--json`. `--full-auto` is deprecated.
  (L/developer-commands?surface=cli, exec table) The 0.160.1 `--help` also
  shows `--thread-source <SOURCE>` [live 2026-10-08].
- Stdin: "If you omit the prompt argument, Codex reads the prompt from stdin".
  With both, the piped content is added as context. (L/non-interactive-mode)
  Live: "`exec` waits on stdin unless it is given `/dev/null`" [live]
  (docs/plans/codex-plugin.md:328).
- `--json` events: `thread.started` (with `thread_id`), `turn.started`,
  `turn.completed` (with `usage`), `turn.failed`, `item.*`, `error`.
  (L/non-interactive-mode#make-output-machine-readable)
- "If you configure an enabled MCP server with `required = true` and it fails
  to initialize, `codex exec` exits with an error". (L/non-interactive-mode#permissions-and-safety)
  [inference] `--ignore-user-config` avoids this unless a managed config
  applies.
- Exec "reuses saved CLI authentication by default"; `CODEX_API_KEY` also
  works. (L/non-interactive-mode#authenticate-in-automation)
- **Cost** [live]: "It costs 21.5k input tokens for a one-word answer, 12.3k
  of it cached. Switching off tools and features and replacing the base
  instructions brings it to 12.5k, and no flag tried went lower."
  (docs/plans/codex-plugin.md:328) Measured on 0.160.1, before 0.161.0 made
  GPT-6.1 Sol the default model.
- **Unknown flags.** `exec` rejects an unknown `--disable` name with "Unknown
  feature flag: X"; the code drops it and retries [live]
  (codex/src/update.ts:88-92; docs/plans/codex-plugin.md:407-408).
  `personality` is "removed" in 0.160.1 but still in the `OFF` list
  (codex/src/update.ts:40).
- **Model.** `gpt-6.1-sol` at low effort got 12 of 12 right in 4–5 s;
  `gpt-6-luna` got 10 of 12 [live] (docs/plans/codex-plugin.md:412-419).
- `exec` threads are excluded from `thread/list` by default (see app-server).
- **`notify` is not a substitute trigger.** It runs one external program on
  `agent-turn-complete` with `thread-id` and `last-assistant-message`, but it
  is a single user-level command and project config cannot set it.
  (L/config-advanced#notifications, #project-config-files-codexconfigtoml)

## app-server

app-server is the JSON-RPC server behind Codex's rich clients. The inbox does
not call it directly, but `codex queue` does.

- **Status.** "The app-server command is experimental and isn't supported for
  production workloads." (L/mcp-server) CLI help: "primarily for development
  and debugging and may change without notice".
- **Clients.** The doc names "the Codex VS Code extension". The glossary says
  it applies to "Desktop app, IDE extension, SDK". The README names "local
  stdio desktop sessions (`Codex Desktop`)" (GH/codex-rs/app-server/README.md:189-198).
- **Transports.** stdio JSONL (default); WebSocket ("experimental and
  unsupported"; non-loopback listeners "currently allow unauthenticated
  connections by default during rollout"); Unix socket. (L/app-server#protocol)
- **Handshake.** One `initialize` per connection, then `initialized`.
  Capabilities include `experimentalApi`. Experimental methods without it fail
  with "`<descriptor> requires experimentalApi capability`".
  (L/app-server#initialization, #experimental-api-opt-in)
- **Thread status.** `notLoaded`, `idle`, `systemError`, `active` with flags
  `WaitingOnApproval` and `WaitingOnUserInput`
  (L/app-server#read-a-stored-thread-without-resuming;
  GH/codex-rs/app-server-protocol/src/protocol/v2/thread.rs:1697-1700).
  `thread/status/changed` fires on change.
- **Unloading.** "the server keeps the thread loaded until it has no
  subscribers and no thread activity for 30 minutes." (L/app-server#unsubscribe-from-a-loaded-thread)
- **`thread/list`.** `sourceKinds`: "When omitted or `[]`, the server defaults
  to interactive sources only: `cli` and `vscode`". Kinds include `exec`,
  `appServer` and several `subAgent*`. No desktop kind exists; desktop threads
  record `source: "vscode"`. Other filters: `cwd`, `isPinned`, `searchTerm`,
  `archived`, sort keys, experimental `parentThreadId` and `ancestorThreadId`.
  (L/app-server#list-threads-with-pagination--filters)
- **Turns.** `turn/start` input items `text`, `image`, `localImage`, `skill`,
  `mention`. `turn/steer` needs `expectedTurnId`. `thread/inject_items`
  appends history "without starting a user turn". `thread/shellCommand` "runs
  outside the sandbox with full access". (L/app-server#turns, #steer-an-active-turn,
  #inject-items-into-a-thread, #run-a-thread-shell-command)
- **Approvals** are server requests: `item/commandExecution/requestApproval`,
  `item/fileChange/requestApproval`, `item/tool/requestUserInput`,
  `item/permissions/requestApproval`, `mcpServer/elicitation/request`.
  (L/app-server#approvals)
- **MCP.** `mcpServer/tool/call` (not experimental, common.rs:1277),
  `mcpServer/resource/read`, `mcpServerStatus/list`, `config/mcpServer/reload`.
  A `required` server that fails makes `thread/start` and `thread/resume`
  fail. (L/app-server#api-overview)
- **`mcpToolCall` item.** The schema has `appContext` (`connectorId`,
  `linkId`, `resourceUri`, `appName`, `actionName`), legacy
  `mcpAppResourceUri`, `mcpAppUi {resourceUri, preferredModelDisplayMode}`,
  `pluginId`, `readOnlyHint`, `durationMs` [source]
  (GH/codex-rs/app-server-protocol/schema/typescript/v2/ThreadItem.ts).
- **Plugins.** `plugin/list|read|install|uninstall` are "under development…
  Don't call this method from production clients yet." Sources are `local`,
  `git`, `npm`, `remote`. `marketplace/add|remove|upgrade`. (L/app-server#api-overview)
  `disabledPluginIds` exists, but "Saving this selection does not yet filter
  plugin capabilities." (README.md:385-409)
- **Hooks.** `hooks/list` lists discovered hooks per `cwd`. Source types
  include Plugin and Mdm; trust statuses Managed, Untrusted, Trusted,
  Modified; execution modes Sync and Async [source]
  (GH/codex-rs/app-server-protocol/src/protocol/v2/hook.rs:19-157).
- **Read state** (experimental): `thread/read.readState`,
  `thread/readState/update`, `thread/readState/changed`. "Only newly
  delivered, durable, visible terminal results advance read state."
  (README.md:22-63)
- **Thread attachments.** `thread/attachment/add|list|remove`, not gated. For
  pull requests, "clients should reuse the canonical application identity
  `JSON.stringify([canonicalHostname, lowercaseOwner, lowercaseRepository,
  pullRequestNumber])`." At most 100 per thread. (README.md:316-383;
  common.rs:672-687) Who writes these today is [unknown].
- **Auth.** "App-server authentication has never been permitted for
  commercial or hosted services." (L/app-server#auth-endpoints)

## The desktop app's own attention features

These overlap with what the inbox shows.

- **Activity view.** "select the bell in the sidebar to see chats that are
  unread, running, or waiting for your response." "Depending on your current
  surface, the options can include **Work**, **Chat**, **Pinned**, and
  **Scheduled**." (L/notifications#follow-chats-in-activity-view) Added in
  26.727, 2026-07-30 (L/changelog#codex-2026-07-30-app).
- **Pets** "can show when a chat is **Running**, **Needs input**, **Ready**,
  or **Blocked**". (L/notifications#follow-chat-activity-with-a-pet)
- **iOS Priority view** brings "running tasks, unread updates, and tasks
  awaiting your response to the top". (L/changelog, iOS 1.2026.237)
- **Desktop alerts.** Turn completion "never, only while ChatGPT is in the
  background, or always", plus separate permission and question
  notifications. (L/notifications#configure-desktop-notifications)
- **PR review in the side panel** is part of the desktop Codex experience.
  (L/whats-new#use-codex-in-the-chatgpt-desktop-app)
- [inference] The inbox should not rebuild "which chat needs me". It adds
  item-level content Activity lacks, and can link with
  `codex://threads/<thread-id>`.
- **Deep links.** "The ChatGPT desktop app keeps the `codex://` URL scheme for
  compatibility." `codex://threads/<thread-id>` opens "A local chat".
  `codex://new?prompt=…` "Sets the initial composer text" and "doesn't send
  the prompt automatically". (L/reference/commands#deep-links, #chats)
- Other: pop-out chats with Always on top; `/app` moves a CLI session into the
  desktop app; imports from Claude Code, Claude Cowork and Cursor.
  (L/reference/settings, L/developer-commands?surface=cli, L/whats-new)

## config.toml layers

- Precedence, highest first: CLI flags and `--config`; project
  `.codex/config.toml` (closest wins, trusted projects only); profile;
  `~/.codex/config.toml`; cloud-managed defaults; `/etc/codex/config.toml`;
  built-in defaults. Untrusted projects skip project config, hooks and rules.
  (L/config-basic#configuration-precedence)
- Project config cannot set `openai_base_url`, `chatgpt_base_url`,
  `apps_mcp_product_sku`, `model_provider(s)`, `notify`, `profile(s)`,
  `experimental_realtime_ws_base_url` or `otel`, and prints a startup warning.
  (L/config-advanced#project-config-files-codexconfigtoml)
- "By default, Codex saves local session transcripts under CODEX_HOME".
  `history.persistence = "none"` turns it off. (L/config-advanced#history-persistence)
- `CODEX_HOME`: "If you set it, the directory must already exist."
  (L/config-file/environment-variables)
- Desktop-only `desktop.custom_file_handlers.<id>` adds "Open in" targets.
  (L/config-advanced#desktop)
- Keys that matter for the inbox: `[plugins."inbox@inbox"] enabled`,
  `[marketplaces.inbox]`, `[hooks.state."…"] trusted_hash`, `[features]`,
  `plugins.<plugin>.mcp_servers.<server>.*`, `mcp_optional_startup_grace_ms`,
  `approval_policy`. All are cited in the sections above.

## Sandbox and approvals

- `approval_policy` is `on-request | never | {granular}`. "`untrusted` is
  unsupported, and `on-failure` is deprecated." "The retired setting can
  prevent either client from starting." (L/config-reference;
  L/agent-approvals-security#migrate-from-the-retired-untrusted-approval-policy)
  No repo file passes `untrusted` [live 2026-10-08].
- "The sandbox applies to spawned commands." Seatbelt on macOS. CLI and IDE
  defaults: "no network access and write permissions limited to the active
  workspace." `.git`, `.agents` and `.codex` under writable roots are
  read-only. (L/sandboxing#what-the-sandbox-does,
  L/agent-approvals-security#os-level-sandbox, #protected-paths-in-writable-roots)
- Desktop modes: "Ask for approval", "Approve for me" (workspace-write,
  on-request, `auto_review`), "Full access", "Custom (config.toml)". The CLI
  uses `/permissions`. (L/permission-modes#choose-a-mode)
- Non-interactive runs: "use `codex exec --sandbox workspace-write`".
  (L/agent-approvals-security#common-sandbox-and-approval-combinations)
- **No page says whether hook commands or MCP server processes run inside the
  sandbox.** [inference] They probably run outside it: the inbox server runs
  `codex queue` and `codex exec` without approval. [unknown] until checked.
- "When a plugin capability runs through a Codex host, the host's sandbox and
  approval policy applies." (L/plugins#how-permissions-and-data-sharing-work)

## AGENTS.md

- "Codex builds an instruction chain when it starts (once per run; in the TUI
  this usually means once per launched session)." Global
  `~/.codex/AGENTS.override.md` else `AGENTS.md`; then each directory from the
  git root down to the cwd; concatenated root first. It "stops adding files
  once the combined size reaches the limit defined by `project_doc_max_bytes`
  (32 KiB by default)." (L/agent-configuration/agents-md#how-codex-discovers-guidance)
- Project guidance is included "in the first turn of a session"; the root is
  found with `project_root_markers` (default `.git`).
  (L/config-advanced#project-instructions-discovery)
- [inference] AGENTS.md cannot carry live inbox state. It could carry static
  guidance only, and that would mean editing the person's files.

## Feature flags and maturity

- Labels: Under development ("Don't use"), Experimental ("Unstable and OpenAI
  may remove or change it"), Beta, Stable ("removals typically go through a
  deprecation process"), Deprecated. (L/feature-maturity) Source also has
  Removed (GH/codex-rs/features/src/lib.rs:47-62).
- `codex features list` on 0.160.1 [live 2026-10-08]:

  | Flag | State |
  | --- | --- |
  | `hooks`, `plugins`, `apps` | stable, on |
  | `plugin_hooks` | removed |
  | `enable_mcp_apps` | under development, off |
  | `code_mode_host` | stable, on |
  | `code_mode` | under development, off |
  | `non_prefixed_mcp_tool_names` | under development, off |
  | `mcp_2026_07_28`, `codex_apps_mcp_2026_07_28` | under development |
  | `local_thread_store_compression` | under development, on |
  | `transcript_v2` | deprecated |
  | `personality` | removed |

- **`non_prefixed_mcp_tool_names`**: "Expose MCP model-visible namespaces
  without the legacy `mcp__` prefix" (lib.rs:1563-1568). [inference] If it
  also changes hook `tool_name`, the matcher `mcp__.*` and the tool names in
  the inbox's guidance (codex/src/texts.ts:19, :26) break.
- **Code mode.** L/config-reference calls `features.code_mode.enabled` "under
  development and off by default", yet the desktop app runs shell commands
  through code mode [live] (docs/plans/codex-plugin.md:373). [inference] The
  app turns it on by its own config; the CLI and app behave differently here.

## Transcripts

`transcript_path` points to a JSONL file of the thread. "the transcript
format isn't a stable interface for hooks and may change over time."
(L/hooks#common-input-fields) The inbox reads it for check results and to
detect `exec` runs.

- **Command ends.** Every command's end is an `event_msg` / `item_completed`
  with `item.type: "CommandExecution"`; its `id` equals the hook's
  `tool_use_id`, and it is written before PostToolUse [live]
  (docs/plans/codex-plugin.md:325, :377).
- **Item fields** [live 2026-10-08, 1,525 items]: `aggregated_output`,
  `command` (always an argv list), `cwd` (always a `file://` URL), `duration`,
  `exit_code`, `formatted_output`, `id`, `parsed_cmd`, `process_id`, `source`,
  `status`, `stderr`, `stdout`, `type`. The code reads `aggregated_output`,
  unwraps `sh -c`, and converts `file://` (codex/src/transcript.ts:44-62, :81).
- **Row types** [live 2026-10-08]: `session_meta`, `response_item`,
  `event_msg`, `world_state`, `turn_context`, `token_usage_record`,
  `compacted`, `inter_agent_communication_metadata`. All 60 recent threads have
  `history_mode: "paginated"`.
- **Still plain JSONL** [live 2026-10-08]: 146 files in three days, none
  compressed, although `local_thread_store_compression` is on.
- [inference] The format is moving: paginated history, `migrate-rollouts`,
  compression, `world_state`. This is the inbox's riskiest dependency. Each
  read needs a test that fails loudly and an "unknown" state in the UI.

## What this repo verified live

All rows come from `docs/plans/codex-plugin.md`, measured on Codex 0.154.0 or
the desktop app's 0.160.1 (codex-plugin.md:14-15). The plan does not record
which version each check used. Rows marked "2026-10-08" were checked
read-only while writing this file.

| Fact | Where |
| --- | --- |
| Every hook fired in a desktop thread; SessionStart context reached the model | :331 |
| Shell and patch hook shapes; no exit code in `tool_response` | :325-326 |
| Model tool calls carry `x-codex-turn-metadata` with `session_id`, `thread_id`, `turn_id` | :327 |
| `exec --ephemeral --ignore-user-config` fires no plugin hooks; cost 21.5k / 12.5k tokens | :328 |
| `exec` sessions have `originator: "codex_exec"`, `source: "exec"` | :329 |
| `.agents/plugins/marketplace.json` wins over `.claude-plugin/marketplace.json` | :330 |
| A thread tab opens from a local plugin; tab calls carry `_meta.thread_id`; no subscribe; polling works | :332 |
| `ui/message` is wrapped as `untrusted_input` | :333 |
| 17 probe server processes in 3 minutes | :334 |
| `codex queue` delivers to idle and busy threads | :357-359 |
| Hooks get `CODEX_CLI_PATH` | :361-365 |
| A long command got no PostToolUse in the desktop app | :373-378 |
| SessionStart fires on resume; Stop `block` continues the turn | :395-396 |
| A server-started press works through `codex queue` / `thread/queue/add` | :397-398 |
| `default_tools_approval_mode: "approve"` in `.mcp.json` skips approval | :399 |
| Servers find the data folder from their install path | :400 |
| Unknown `--disable` names fail; model choice | :407-419 |
| Bundled CLI 0.160.1, PATH CLI 0.154.0, `codex queue --help`, `codex features list` | 2026-10-08 |
| Cache at `.../cache/inbox/inbox/0.1.0/`, matches the repo; data at `.../data/inbox-inbox` | 2026-10-08 |
| Hook trust keys for all four inbox events | 2026-10-08 |
| Transcript row types, item fields, subagent id patterns | 2026-10-08 |

## Where sources disagree

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
| Poll interval (repo) | codex-plugin.md:56, :119, :332: 5 s or "every few seconds". codex/src/tab.tsx:52: 3 s | Code | |
| `additionalContextLimit` (repo) | codex-plugin.md:231-234: SessionStart sets it. hooks.json has none | Code | The plan was not implemented. |
| `CODEX_CLI_PATH` in the server (repo) | codex-plugin.md:361-365: servers get no Codex variables. `.mcp.json` lists it in `env_vars`; server-main.ts:13 says ".mcp.json passes [it] on" | Unknown | Whether it arrives is not recorded. |
| `session_meta.source` (repo) | codex-plugin.md:331: desktop transcripts have `source: "vscode"`. Live: 8 of 58 desktop transcripts do; the rest are subagent threads. Whether this and the 60-transcript count in "Session, thread and turn ids" (9 top-level) are the same sample is not recorded [unknown] | Both | True for top-level threads only. |
| Mode switcher copy | L/sandboxing (IDE-extension tab) still shows "Chat / Agent / Agent (full access)". The mode pickers on L/sandboxing and L/permission-modes show a "Do anything" label that is not in their mode list | n/a | Leftover UI copy. |
| Listing translations | D/deploy/submission#translate-listing-text: importing translations "doesn't yet change the text shown in the Plugins Directory or listing API responses" | n/a | A documented feature that is not live yet. |
| Transcript item fields (repo) | codex-plugin.md:325 lists five fields. Live and code use `aggregated_output` and argv lists | Live | The plan's list is incomplete. |
| clients.md line numbers (repo) | docs/plans/clients.md:555-559 cites `server.ts:71-73`, `:36`, `:115` | Code | Now 73-79, 38, 123. |

## Unknown, and how to check

Each check below is concrete. Run it in a scratch `CODEX_HOME` where it would
otherwise write to real state.

| Question | Check |
| --- | --- |
| Do plugin hooks fire in `guardian_review` and `subagent` threads, and with which `session_id`? Do they get Stop or only SubagentStop? Does UserPromptSubmit fire for subagent prompts? | Add a logging hook on every event, spawn a subagent and trigger a guardian review, then compare `session_id`, `agent_id` and the thread ids. |
| Which id do forks send, and which does `codex queue --thread` need? | Fork a desktop chat (`/fork`, `/side`). Call an inbox tool from the fork and its tab, log `_meta` and hook input, then press a button in the fork. |
| Do MCP server processes receive `PLUGIN_DATA`, `PLUGIN_ROOT`, `CLAUDE_PLUGIN_*`, `CODEX_CLI_PATH`, `CODEX_MCP_NODE_PATH`? | Log `process.env` keys at server start, in the desktop app and in the CLI. Repeat with a portable `mcp.json` (`type: "stdio"`). |
| Is per-tool `approval_mode` honored in `.mcp.json`? Which `config.toml` key form works (`inbox` or `inbox@inbox`)? | Set `tools.inbox_press.approval_mode = "prompt"` in a scratch `.mcp.json`, call through app-server `mcpServer/tool/call`. Then try both `config.toml` forms. |
| What do `auto` and `approve` mean exactly? Does `approve` override `destructiveHint: true`? | Give a test tool `destructiveHint: true` with `approve` and watch for a prompt. |
| When is the cache folder `local` vs the version? Does a same-version reinstall overwrite? Are old folders deleted? | Change only file content, reinstall, compare `ls -la` timestamps under `~/.codex/plugins/cache/inbox/inbox/`. |
| Is the data folder `<plugin>-<market>` or `<market>-<plugin>`? Where is it for Git and npm installs? | Install a scratch plugin whose plugin and marketplace names differ, from a local, a Git and an npm source; `ls ~/.codex/plugins/data`. |
| Does editing only `dist/hook.mjs` force hook re-trust? Does reordering `hooks.json`? | Change the bundle, reinstall, and compare `trusted_hash` keys and prompts. Then reorder handlers. |
| Do hooks and the `exec` update fire in Codex CLI and local Work threads? | Run `codex` with the plugin enabled and open a local Work thread; look for new session files in the data folder. |
| Do hooks and MCP servers run inside the sandbox? | Under workspace-write, write outside the workspace and open a network connection from a hook and from the server. |
| Does Codex send `ui/notifications/tool-result` to a thread-entrypoint view? | Add a handler in the tab that records arrival time relative to `initialized`. |
| Does the model see the tab's `structuredContent`? | Open the tab, ask the model what the inbox tool returned, and inspect the transcript JSONL. |
| What does Codex send in `initialize` (`extensions`, `protocolVersion`) and does it call `server/discover`? | Log raw `initialize` params and every method name for one session. Also try declaring `extensions["io.modelcontextprotocol/ui"]` server-side. |
| What is in `ui/initialize`'s result (`hostCapabilities`, `displayMode`, `platform`, draft keys)? | Dump it to the tab's debug view or a server log. |
| Which `_meta` keys reach the server and the widget (`openai/session`, `openai/widgetSessionId`)? | Log `params._meta` on `tools/call`, and the `_meta` of each result the tab receives. |
| Does Codex hide `visibility: ["app"]` tools from the model, and reject app calls to model-only tools? | Ask the model to list or call `inbox_press`; call `record_finding` from the tab. |
| Is `ui/update-model-context` supported in Codex tabs, and is it marked untrusted? | Send a text block, ask the model to repeat it, inspect the transcript wrapper and composer. |
| Does Codex send `ui/resource-teardown` and `host-context-changed`? | Log both; toggle the theme and resize the panel. |
| Do `ui/request-display-mode`, entrypoint `icons`, a distinct title, `ui/open-link` and `clipboardWrite` work in the Codex tab? | Try each in a copy of the plugin and compare. |
| Does a global entrypoint get its own thread, and do its `ui/message` calls start turns there? | Add `{type: "global"}` to a copy and press a message button. |
| Does Codex show structured settings for a local plugin? | Add a minimal `openai/settings` capability with read and update tools. |
| Does any Claude client (terminal, desktop Code mode, desktop Claude mode) render MCP Apps from a plugin's server? | Install a minimal `ui://` tool in each and ask the model to call it. |
| Does the desktop app use the daemon `codex queue` finds? What happens when the app is closed? | Quit the app, run `codex queue`, reopen. Run `codex doctor`. |
| Do `codex queue` messages show above the composer as editable items? | Queue during a busy turn and look. |
| Does a queued turn carry `turn_trigger: "queue"` in MCP `_meta`, and do hooks see `clientId`? | Log UserPromptSubmit input and an inbox tool call's `_meta` during a queued turn. |
| Does Activity view include Codex chats? What counts as "waiting for your response"? | Leave an approval pending and an open question in a Codex chat, then open Activity view. |
| Does PermissionRequest fire before automatic review under "Approve for me"? | Log it under each permission mode and compare with what the person sees. |
| How does an `mcp_tool` hook's result map to hook output? | Build a UserPromptSubmit `mcp_tool` hook that returns JSON; check whether the model gets the context. |
| Does Codex re-read MCP `instructions` after compaction or resume? | Put a marker sentence in `instructions`, compact, ask about it. |
| Does a slow server miss the first turn's tool catalog? | Add `sleep 2` before server start; list tools on turns one and two. |
| Is a detached child of a synchronous Stop hook killed at session end? Does an `async` Stop hook survive closing the app? | Start a long update, close the app, read its log. |
| Is Stop called after an Interrupt? | Interrupt a turn with Stop and Interrupt loggers. |
| Does `non_prefixed_mcp_tool_names` change hook `tool_name`? | `codex --enable non_prefixed_mcp_tool_names` with a PreToolUse logger. |
| Can plain stdout exceed the 2,500-token default? | Emit 20k tokens of stdout from SessionStart with `additionalContextLimit: 0`. |
| Is `thread/attachment/*` written by the desktop PR panel? | Open a PR from a desktop chat; call `thread/attachment/list` for that thread. |
| Does `codex://threads/<id>` open Worktree and Cloud chats? | Try it with ids of each kind. |
| Is the `exec` cost floor the same on 0.162.0 with GPT-6.1 Sol? | Rerun the plan's measurement. |
| Does `--disable personality` now fail? | Run `codex exec --disable personality` against `/dev/null` stdin. |
| How does a missing `interface.displayName` show in the Plugins Directory? | Open Plugins, then Personal, and read the source label. |
| Can an `onboardingSkill` run for a local install and walk the person through hook trust? | Add `extensions.com.openai.onboardingSkill` to a scratch copy. |
| Which marketplace file does a workspace GitHub import read when both exist? | Import this repo in a test workspace's Admin > Plugins. |
| Does `restrict_to_allowed_sources` hide an already-configured local marketplace? | Needs `/etc/codex/requirements.toml` (admin rights, affects every Codex session on the Mac) or a test workspace's Agent Security policy. |
| Will paginated history or compression change `transcript_path` contents? | Recheck row types and file extension after each Codex update. |
| Does Codex read a portable root `plugin.json` and `mcp.json` next to a Claude Code plugin's files? | Add both to a scratch copy and install it. |
| When does `enable_mcp_apps` leave Under development, and is `thread/queue/add` deprecated? | Read `features/src/lib.rs` and the `#[experimental]` markers in `common.rs` each release. |

## Sources

### Public docs, fetched 2026-10-08

learn.chatgpt.com (Codex use, hooks, config, enterprise, app-server):

| URL | Covers |
| --- | --- |
| https://learn.chatgpt.com/docs/hooks | Events, matchers, input, output, background hooks, trust, plugin hooks, managed hooks |
| https://learn.chatgpt.com/docs/plugins | Surfaces, plugin parts, CLI browser, permissions, removal, directory tabs |
| https://learn.chatgpt.com/docs/build-plugins | ChatGPT-side plugin guide, sharing permissions |
| https://learn.chatgpt.com/docs/build-skills | Skills availability and auto-reload |
| https://learn.chatgpt.com/docs/skills-and-plugins | Overview with duplicate "Build plugins" links |
| https://learn.chatgpt.com/docs/extend/mcp | MCP server support, stdio keys, approval modes, plugin servers, ChatGPT web |
| https://learn.chatgpt.com/docs/config-file/config-basic | Precedence, feature flags |
| https://learn.chatgpt.com/docs/config-file/config-advanced | Project config limits, notify, history, project instructions, OTel, desktop keys |
| https://learn.chatgpt.com/docs/config-reference | Every config and requirements key |
| https://learn.chatgpt.com/docs/config-file/environment-variables | Public environment variables |
| https://learn.chatgpt.com/docs/feature-maturity | Maturity labels |
| https://learn.chatgpt.com/docs/agent-approvals-security | Approvals, sandbox, automatic review, network proxy |
| https://learn.chatgpt.com/docs/sandboxing | What the sandbox covers |
| https://learn.chatgpt.com/docs/permission-modes | Desktop permission modes |
| https://learn.chatgpt.com/docs/agent-configuration/agents-md | AGENTS.md discovery |
| https://learn.chatgpt.com/docs/enterprise/plugin-management | Workspace import, Desktop only |
| https://learn.chatgpt.com/docs/enterprise/managed-configuration | requirements.toml, marketplace restrictions, command identity |
| https://learn.chatgpt.com/docs/enterprise/apps-and-connectors | "Plugin controls", capability chain, cloud orchestration |
| https://learn.chatgpt.com/docs/app | ChatGPT desktop app |
| https://learn.chatgpt.com/docs/environments/modes | Local, Worktree, Cloud |
| https://learn.chatgpt.com/docs/glossary | Chat, thread, turn, session, finding |
| https://learn.chatgpt.com/docs/notifications | Alerts, Activity view, pets |
| https://learn.chatgpt.com/docs/reference/settings | Settings sections, follow-up behavior |
| https://learn.chatgpt.com/docs/reference/commands | Deep links and shortcuts |
| https://learn.chatgpt.com/docs/prompting | Steering and queuing |
| https://learn.chatgpt.com/docs/developer-commands?surface=cli | CLI commands and flags (tables rendered client-side) |
| https://learn.chatgpt.com/docs/non-interactive-mode | `codex exec` |
| https://learn.chatgpt.com/docs/app-server | app-server protocol |
| https://learn.chatgpt.com/docs/mcp-server | Removal of `codex mcp-server`; app-server status |
| https://learn.chatgpt.com/docs/codex-sdk | TypeScript and Python SDKs |
| https://learn.chatgpt.com/docs/changelog | Release notes, CLI 0.162.0, desktop 26.707 and 26.727 |
| https://learn.chatgpt.com/docs/whats-new | Merge into the ChatGPT app, hooks GA |
| https://learn.chatgpt.com/docs/whats-new/devday-2026 | Plugin Extensions, MCP Events, dots |
| https://learn.chatgpt.com/docs/dots | dots |
| https://learn.chatgpt.com/docs/llms.txt | Docs index |

developers.openai.com/plugins (packaging, submission, UI):

| URL | Covers |
| --- | --- |
| https://developers.openai.com/plugins/build/plugins | "Package your plugin": formats, marketplaces, cache, hooks, enabling, workspace publishing |
| https://developers.openai.com/plugins/concepts/plugins | "Plugin architecture" |
| https://developers.openai.com/plugins/deploy/submission | "Upload and submit your plugin": field tables |
| https://developers.openai.com/plugins/deploy/submission-errors | Upload errors and warnings |
| https://developers.openai.com/plugins/deploy/connect-chatgpt | "Connect and test your plugin": tunnels |
| https://developers.openai.com/plugins/guides/submit-claude-plugin | "Submit your Claude Code plugin to OpenAI" |
| https://developers.openai.com/plugins/plugin-guidelines | Review rules for tools, names, testing |
| https://developers.openai.com/plugins/build/chatgpt-ui | "Add UI to your MCP server" |
| https://developers.openai.com/plugins/reference | Tool and resource `_meta`, `window.openai`, tool results |
| https://developers.openai.com/plugins/build/extensions | "Plugin Extensions": entrypoints |
| https://developers.openai.com/plugins/build/mcp-server | Server instructions, annotations, skills import |
| https://developers.openai.com/plugins/concepts/mcp-server | Transport |
| https://developers.openai.com/plugins/build/mcp-events | MCP Events |
| https://developers.openai.com/plugins/concepts/ui-guidelines | UI guidelines |
| https://developers.openai.com/plugins/build/app-quickstart | Quickstart |
| https://developers.openai.com/plugins/deploy/troubleshooting | Troubleshooting |
| https://developers.openai.com/plugins/llms.txt | Docs index |

### Specs, schemas and source

| Source | Covers |
| --- | --- |
| https://agent-plugins.org/schemas/1.0.0/plugin.schema.json | Portable manifest schema (cited, not read in full) |
| https://agent-plugins.org/schemas/1.0.0/mcp.schema.json | Portable `mcp.json` schema, stdio entry |
| SPEC, TSR, BB (openai/mcp-extensions at `7e1be49`) | OpenAI MCP extensions: entrypoints, display modes, `ui/message`, model context, settings, deep links |
| https://modelcontextprotocol.io/extensions/apps/overview | MCP Apps overview and client list |
| APPSPEC (ext-apps at `82221c0`) | Stable MCP Apps spec `2026-01-26` |
| APPSDRAFT (ext-apps at `c55a3a2`) | Draft MCP Apps spec |
| https://modelcontextprotocol.io/extensions/client-matrix | Community host matrix |
| GH/codex-rs/features/src/lib.rs, legacy.rs | Feature flags and stages |
| GH/codex-rs/hooks/src/declarations.rs, hooks/schema/generated/ | Hook trust keys, hook input and output schemas |
| GH/codex-rs/cli/src/main.rs, cli/src/queue_cmd.rs, tui/src/session_queue_commands.rs | `codex queue` |
| GH/codex-rs/app-server-protocol/ (src/protocol/common.rs, v2/thread.rs, v2/hook.rs, v2/turn.rs, schema/typescript/v2/) | app-server methods and types |
| GH/codex-rs/app-server/src/request_processors/thread_queue_processor.rs, mcp_processor.rs | Queue rules, `mcpServer/tool/call` `_meta` |
| GH/codex-rs/app-server/tests/suite/v2/thread_queue.rs | Queue behavior tests |
| GH/codex-rs/app-server/README.md | Read state, attachments, plugins, desktop as a client |
| GH/codex-rs/core/src/mcp_tool_call.rs, turn_metadata.rs, responses_metadata.rs, codex_thread.rs | `_meta` on model tool calls |
| GH/codex-rs/protocol/src/mcp.rs, items.rs | MCP Apps extension id, item types |
| GH/sdk/python/src/openai_codex/generated/notification_registry.py | Python SDK registers `thread/queue/changed` |
| GH/docs/config.md | Lifecycle hooks note (stale) |

### This repo

`docs/plans/codex-plugin.md`, `docs/plans/codex-tab.md`,
`docs/plans/clients.md`, `codex/README.md`, `codex/plugin/.codex-plugin/plugin.json`,
`codex/plugin/.mcp.json`, `codex/plugin/hooks/hooks.json`,
`.agents/plugins/marketplace.json`, `.claude-plugin/plugin.json`,
`codex/src/{server,server-main,hook,state,update,transcript,texts,tab}`.

### Not authoritative

Third-party posts say `codex queue` shipped in CLI 0.149.0 and disagree on
`--thread` vs `--session`. The 0.160.1 `--help` output settles it: `--thread`.
