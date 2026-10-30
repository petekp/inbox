# Plugins: cost, manifest and install

Part of [Claude Code mods](../claude-code-mods.md).

## Plugins and marketplaces

Terms:
- **Plugin**: "a directory of skills, agents, hooks, MCP servers, or other components that Claude Code installs and loads as one unit". A plugin with a hooks module is a mod. [PL]
- **Marketplace**: a catalog file, `.claude-plugin/marketplace.json`, that lists plugins and their sources. [MR#marketplace-file]
- **Plugin id**: `<name>@<origin>`. Origins: `@<marketplace>` (installed), `@inline` (`--plugin-dir`, `--plugin-url`, `CLAUDE_CODE_PLUGIN_DIRS`, or the SDK `plugins` option; "for that session only"), `@skills-dir`, `@synced` (from claude.ai), and `@builtin` (types and live store files only). [PLD#find-where-a-plugin-came-from; T: `plugin.register`]

### What an enabled plugin costs every session

- An enabled plugin "is part of every session, not only the sessions where you use it". Skill, agent and command names and descriptions are in context every turn. "what the plugin runs, it runs as you." [PL#what-an-enabled-plugin-adds-to-your-sessions]
- `claude plugin details <name>` prints a `Component inventory` and an `Always-on` token figure. Live: for the inbox it prints "Hooks (0)", "MCP servers (0)" and "Always-on: ~0 tok". It does not see a mod. Don't cite it for the inbox's cost.
- A plugin reaches a session in three layers: settings, disk (`~/.claude/plugins/`), session. "Changes to settings or to disk don't reach this layer until you run `/reload-plugins` or start a new session." [PLD#check-which-stage-a-plugin-reached]

### Manifest facts that matter to the inbox

- `name` is the only required key. Unknown top-level keys are stripped, not fatal. Unknown keys inside `userConfig` options are errors, "and the plugin doesn't load". [MF#fields; MF#unrecognized-fields]
- The manifest has no key for a mod. Mods are declared under `modules` in `hooks/hooks.json`. [MF#fields; PC#hooks] `types` names "A `.d.ts` file that declares the `$.state` values and `$` nouns of a mod". [MF#fields]
- The manifest has no minimum-engine field. [MF#fields] The only guards are a runtime check (`$.session.version()`) or a side effect, such as `options` locking out engines before 2.1.271.
- `version` "pins the plugin to that version until you change it", except for command sources, claude.ai-hosted marketplaces and in-place loads. [MF#version]
- Reserved names: prefixes `claude-`, `anthropic-`, `anthropics-`, `cc-plugin-`; exact `claude`, `anthropic`, `anthropics`, `claude-code`, `claude-mods`. Only `claude plugin init` and `tag` enforce this. [MF#name] `inbox` is safe.
- Claude Code "doesn't load a `CLAUDE.md` at the plugin root". [PC#skills]
- "claude.ai and Cowork don't install a plugin that has a top-level `bin/` directory". [PC#executables]
- A plugin MCP server's tools are named `mcp__plugin_<plugin>_<server>__<tool>`. Tools registered with `$.tool.register` are `mcp__inbox__*` (live). Moving the inbox's tools to an MCP server would rename every tool. [PC#server-names-tool-names-and-reloads]
- `userConfig`: values reach a mod as `register(on, options)` with defaults filled in. "a required field with no value fails the load". Stored under `pluginConfigs[<plugin>].options`; a `--plugin-dir` plugin's key is "its plugin.json `<name>` (or `<name>@inline`)". [T: `PluginOptions`] The docs don't mention `options` or `$.config` for mods.
  - The `userConfig` dialog lives only in the interactive `/plugin` panel. "The `claude plugin install` shell command never prompts". [PC#when-the-configuration-dialog-appears] Inference: any inbox option needs a default, because desktop users can't answer the dialog.
  - "If you declare `options` on any field, users on Claude Code versions before v2.1.271 can't load the plugin." "A plugin whose `options` break these rules fails to load." [MF#limit-a-field-to-fixed-options]
  - Options show as `/config` rows, except `sensitive` and `multiple`. [MF#user-configuration]
- `${CLAUDE_PLUGIN_ROOT}` "changes when the plugin updates. Don't write state there". `${CLAUDE_PLUGIN_DATA}` (`~/.claude/plugins/data/<id>/`) survives updates and is deleted on the last uninstall unless `--keep-data`. [PC#path-variables-and-persistent-data] The inbox keeps state in `$.store` (`~/.claude/plugins/store/`), which neither the data-folder rules nor `--data-size` cover. Whether uninstall deletes it is unknown.
- A dependency of an enabled plugin "starts enabled regardless". [MF#defaultenabled] Types: a plugin can add a `$` noun and ship its contract for dependents. Inference: a core-plus-UI plugin split is possible, but documented only in the types.

### Install, by app

| Where | How | Source |
|---|---|---|
| Terminal session | `/plugin install inbox --marketplace petekp/inbox` (2.1.275+; asks to confirm a new marketplace) | [PI#add-and-install-in-a-session] |
| Shell | `claude plugin install inbox --marketplace petekp/inbox` (2.1.292+; no confirmation; user scope; prints `Successfully installed plugin: <id> (scope: <scope>)`) | [PI#add-and-install-from-your-shell] |
| Desktop Code mode (local or SSH) | "+ > Plugins > Add plugin", which "shows available plugins from your configured marketplaces". No add-marketplace control is documented. `/plugin` replies "isn't available in this environment". | [PI#install-a-plugin; desktop#install-plugins; PT#plugin-isnt-available-in-this-environment] |
| VS Code | `/plugins` opens Manage plugins | [PI#install-a-plugin] |
| `claude -p`, SDK, claude.ai/code | `/plugin` unavailable. Installed plugins load. SDK `plugins` option loads as `@inline`. | [PI#other-places-you-run-claude-code] |
| Cloud session | No plugin browser. Only server-managed plugins. | [PI#install-a-plugin] |

- "The terminal, the desktop app's local sessions, and the VS Code extension on one computer read the same settings files, so a plugin you install at user scope in any of them is available in the other two." [PI#choose-an-install-scope] Whether they share the plugin cache is unstated.
- The plugin-authoring skill says that in a local Code-mode session `/plugin install` "answers that the command is not available there", and "A mod installed from a terminal at the user scope loads in that local session too, and its `ui.render` hooks draw for the `desktop` surface." [skill]
- So a desktop user installs from a shell, then opens the app. The README's `/plugin install` line works only in a terminal session.
- Install summary states: `Plugin is now active.`; needs MCP configuration; `Run /reload-plugins to apply.`; `The plugin couldn't be loaded`. For the third: "You don't need to type the command. The panel closes and Claude Code runs `/reload-plugins` for you". Only adding or removing "a plugin MCP server, or the `LSP` tool" waits on `--force`. "Claude Code never invalidates the cache for a plugin's skills, commands, agents, hooks, monitors, or themes." [PI#install-a-plugin; PT#run-reload-plugins-to-activate; prompt-caching#enabling-or-disabling-a-plugin]
  - Whether the inbox's `$.tool.register` tools (seen by the model as an `inbox` MCP server) trip that gate is unknown.
- **Last updated** and **Context cost** appear only for official-marketplace plugins. A custom marketplace plugin can show `Components will be discovered at installation`. **Will install** "shows that a hook exists but not what it runs." [PI#install-a-plugin; PS#review-a-plugin-before-you-install] Inference: the README is the only place a user learns what the inbox does before installing.
- Scopes: user (`~/.claude/settings.json`), project (`.claude/settings.json`), local (`.claude/settings.local.json`). Precedence local over project over user; managed `true` force-enables and `false` blocks. [PI#choose-an-install-scope; PLD#find-where-a-plugin-is-enabled]
- Per-repo enabling: "A plugin that the marketplace lists by a relative path loads from the marketplace copy once the repository's `extraKnownMarketplaces` entries apply", after workspace trust. The inbox's `"./"` entry qualifies, so a team could enable it in a committed `.claude/settings.json` with no per-person install. [PO#require-plugins-per-repository] Not verified.
