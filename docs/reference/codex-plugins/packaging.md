# Plugin packaging and MCP server config

Part of [Codex plugins and the Codex app](../codex-plugins.md).

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
- **The repo's manifest today:** `name` and `version` "0.2.1", `author.name`,
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
  `default_tools_approval_mode: "approve"` in `.mcp.json` let `record`
  run without approval; without it, Codex refused the call [live]
  (docs/plans/codex-plugin.md:399). No page documents the key inside a
  plugin's `.mcp.json`. Whether per-tool `approval_mode` works there is
  [unknown].
