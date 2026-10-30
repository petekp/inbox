# Plugin updates, conflicts and controls

Part of [Claude Code mods](../claude-code-mods.md).

## Versions, updates and the cache

- Version: `plugin.json` `version`, then the entry's `version`, then by source. "Relative path inside a Git-hosted marketplace" uses "The commit SHA of the installed directory". A local non-git folder gives `unknown`. [PLD#how-claude-code-computes-the-version]
  - The inbox sets no version. So each commit is a new version. Whether "the installed directory" SHA means HEAD or the last commit touching it is unstated. With `"./"`, Codex-only commits likely count as Claude Code updates.
  - "If you set `"version": "1.0.0"` and push new commits without changing it, users don't receive them." [PH#release-a-new-version]
- Auto-update "is off for your marketplace by default, and `marketplace.json` has no field to turn it on". Users turn it on in `/plugin` > Marketplaces, or update with `/plugin marketplace update <name>` or `claude plugin update <plugin>@<name>`. [PH#turn-on-auto-update]
- Auto-update timing: "In an interactive session, after you send your first message, Claude Code waits a random delay of up to ten minutes". "The running session keeps the versions it already loaded." The user sees `Plugin updated: <name> · Run /reload-plugins to apply`. "Whether or not you reload, the new versions load on your next launch." [PLD#when-auto-update-runs] Whether it runs in a desktop Code session is unknown.
- `claude plugin update` "ends with `Restart to apply changes.`"; the same page says `/reload-plugins` also applies it. [PLD#check-which-stage-a-plugin-reached] README (`README.md:22`) says `claude plugin update inbox` then `/reload-plugins`. Docs examples always use `<plugin>@<marketplace>`; whether the bare name works is unverified.
- Git-hosted marketplace plugins are copied into `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. "Files outside the plugin directory aren't copied". With `"./"`, the whole repo ships (about 225 KiB, 73 tracked files, live). [PLD#in-place-and-copied-plugins]
- Relative-path plugins in a marketplace added from a local path load in place: edits apply at the next start or `/reload-plugins`, with no version bump. [PLD#in-place-and-copied-plugins]
- Old version folders are removed 14 days after an `.orphaned_at` marker, "so a session that already loaded the old version keeps running". [PLD#cleanup-of-previous-versions]
- "When a copied plugin updates mid-session, hook commands, monitors, MCP servers, and LSP servers keep using the previous version's path." Mods are not mentioned. [PLD#when-auto-update-runs]
- Automatic npm install runs only with `package.json` plus a lockfile at the plugin root. "You can't turn the automatic install off." The inbox has none at its root (`codex/package.json` is in a subfolder). [PLD#node-js-package-dependencies]
- `/reload-plugins` output: `Reloaded: N plugins · N skills · N agents · N hooks · …`. In "sessions without an interactive terminal, such as the desktop app, the Agent SDK, and … `-p`" (2.1.260+), it works only when typed into the prompt, not over Remote Control, and it "doesn't connect or disconnect plugin MCP servers". [PCLI#reload-plugins; PCLI#sessions-without-an-interactive-terminal]

## Name conflicts and session-only copies

Highest precedence first: [PLD#name-conflicts]
1. A plugin in managed `enabledPlugins`. It locks out a folder copy: `--plugin-dir copy of "<name>" ignored: plugin is locked by managed settings`.
2. An enabled `--plugin-dir`, `--plugin-url` or `CLAUDE_CODE_PLUGIN_DIRS` plugin. It replaces an installed marketplace plugin "silently". "`claude plugin list` still shows the marketplace row as enabled". Only the debug log records it.
3. An installed marketplace plugin.
4. A skills-dir plugin.
5. A synced plugin, which always loses.

- "The installed copy loads instead if you disabled the session-only copy with `claude plugin disable <name>@inline`, or if managed settings lock that plugin name". Or set `"enabledPlugins": {"<name>@inline": false}`. [PCLI#flags-that-load-a-plugin-for-one-session; PLD#keep-a-session-only-plugin-from-loading]
- `CLAUDE_CODE_PLUGIN_DIRS`: absolute or `~` paths, `:` or `;` separated; "Claude Code skips relative paths"; needs 2.1.280; "Project and local settings can't set this variable". [PCR#from-an-environment-variable; env-vars]
- `CLAUDE_CODE_PLUGIN_DIR_WATCH`: on by default in interactive sessions; `1` turns it on for non-interactive sessions, `0` off everywhere; needs 2.1.287. [ENVV]
- Live: with only `CLAUDE_CODE_PLUGIN_DIRS` set, `claude plugin list --json` shows `inbox@inline`, version `unknown`, scope `session`, and `plugin details inbox` resolves it. The docs say a flag is needed for both. `installed_plugins.json` has no inbox entry on this machine.
- Inference: when testing "the installed plugin" on this machine, the working tree wins unless the `@inline` copy is disabled.

## Synced plugins and Claude mode

- A plugin turned on for a claude.ai account "loads as `<name>@synced`, with no marketplace and no install record". "In terminal sessions, a synced plugin's skills, agents, hooks, MCP servers, and LSP servers all load". Mods aren't named. [PLD#synced-plugins]
- Sync is one way: CLI installs "stay on this machine and aren't added to your claude.ai account." [PI#plugins-from-your-claude-ai-account]
- The desktop app "manages some plugins itself, including plugins synced from claude.ai and plugins your organization deploys through the app", and passes them to local Code sessions unless `disableSideloadFlags`. [SETR#disablesideloadflags]
- Cowork "sources its skills, plugins, and connectors from this Customize configuration, which syncs through your claude.ai account, not from the CLI's `~/.claude` directory." [desktop#extend-claude-code] Inference: `CLAUDE_CODE_PLUGIN_DIRS` does not reach Claude mode.
- Component support by app ("Chat" = claude.ai web, desktop and mobile chats; "Cowork" = desktop tasks; "Claude Code" = terminal, IDE extensions, desktop Code tab): hooks are ignored in Chat and load in Cowork and Code; local MCP is ignored in Chat and loads in Cowork "when the Cowork session runs on your computer"; `bin/` "Can't be installed" in Chat or Cowork; "The directory lists a mod … for Claude Code." [PS-claude#compare-component-support-by-app]
  - Inference: the mod can't run in Claude mode. A local MCP server with an MCP Apps view (as the Codex plugin uses) is the only documented path there. Whether Cowork runs `modules` is unknown.
- Org sync from claude.ai needs a private or internal repo, so `petekp/inbox` can't be org-synced as it is. [PH#distribute-through-organization-settings]
- The Anthropic directory: "One listing there reaches people on claude.ai, in Cowork, and in Claude Code"; a listed plugin loads in Claude Code as `<name>@synced`. [PP#submit-to-anthropics-directory]

## Org plugin controls (beyond the mod guard)

- `strictKnownMarketplaces` (allowlist; `[]` blocks every source) and `blockedMarketplaces` apply "before anything downloads and again at session start". While any allowlist is set, a plugin whose marketplace can't be found doesn't load. [PO#restrict-what-users-can-install]
- `disableSideloadFlags` rejects `--plugin-dir`, `--plugin-url`, `--agents`, the SDK `plugins` option, non-SDK `--mcp-config`, and `CLAUDE_CODE_PLUGIN_DIRS` folders; Claude Code "exits `1` without starting". [PO#control-matrix; PCLI#flags-that-load-a-plugin-for-one-session]
- `allowManagedModsOnly` "Doesn't stop a plugin that contains a mod from installing." [PO#control-matrix]
- Managed `extraKnownMarketplaces` plus `enabledPlugins` install at the user's next session start; a user's own disable doesn't stop it. `"autoUpdate": true` separately keeps it refreshing. [PO#require-a-marketplace-and-its-plugins]
- OTel `plugin_loaded` events report third-party plugin names as `third-party` unless `OTEL_LOG_TOOL_DETAILS=1`. [PS#find-plugins-in-telemetry]

## Plugin security

- "A Claude Code plugin you install can execute arbitrary code on your machine with your user privileges." [PS]
- "Claude Code runs hooks, monitors, MCP servers, LSP servers, and the processes a mod starts outside the sandbox." Permission rules "cover the tool calls Claude makes, not the code a plugin runs by itself". The inbox's `record` and `close` are tool calls, so permission rules apply to them. [PS#understand-what-a-plugin-can-do]
- With auto-update, "the files you reviewed can change on disk". [PS#understand-what-a-plugin-can-do]

## Other components the inbox could add

- Monitors: a shell command for the whole session; "What it prints reaches Claude as notifications". They start "in an interactive session and never in non-interactive mode with the `-p` flag", get no `userConfig`, and don't run on Bedrock, Agent Platform or Foundry. [PC#monitors; MF#monitors] Whether they start in desktop Code mode is unknown.
- Channels: an MCP server plus a `channels` entry, for outside events into a session. [PC#channels]
- Agent frontmatter `hooks` and `mcpServers` are ignored in plugin agents. [PC#frontmatter-fields-in-plugin-agents]
- "If a rule must hold every time… add it to the plugin as a hook rather than a skill." [PC#skills]

## Live validate and repo state

- `.claude-plugin/marketplace.json`: `name: "inbox"`, one entry `{ "name": "inbox", "source": "./" }`, no `description`, no `version`. `.agents/plugins/marketplace.json` is the Codex marketplace; Claude Code reads only `.claude-plugin/marketplace.json`.
- `claude plugin validate --json` on 2.1.295 exits 0. Warnings: no version, no author, "No marketplace description provided", CLAUDE.md not loaded. `gatingHooks` (16 with `hasCatch: false` in the JSON; the text output listed 17 lines) appear on the `manifest` object and each `contents` item, as notes. Undocumented fields: `advice`, `type`, `code`, and per-module inventory notes. `validate --strict` would fail while `version` is missing.
