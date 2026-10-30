# Security model, settings and environment variables

Part of [Claude Code mods](../claude-code-mods.md).

## Security model

- "A mod is code that runs with your permissions. It can read and write your files, start processes, and make network requests." [O#install-or-update-a-mod]
- Once loaded, a mod can: [O#what-a-mod-can-reach]
  - "Act on your machine as you".
  - "Read your secrets: environment variables and settings files, including an API key".
  - "See your session: every prompt you send and every tool call Claude makes".
  - "Change your session: rewrite a prompt or a tool call, submit a prompt as if you had typed it, or send a message to another of your sessions".
  - "Act without asking you: approve a tool call before you're asked".
  - "Spend your usage: call a model on your plan or API key".
- "Mods aren't sandboxed. If you turn on sandboxing, the sandbox isolates the Bash commands Claude runs, and a process that a mod starts runs outside it." [O#what-a-mod-can-reach]
- A mod that approves tool calls can approve one that an `ask` rule would prompt for, and one that the user's own `PreToolUse` hook blocked. The overview links to a permissions section that "lists what such a mod can approve, including when it can approve a call that a `deny` rule refuses". [O#what-a-mod-can-reach; P#extend-permissions-with-hooks]
- "A mod can restyle much of Claude Code's interface, but not the permission prompt." [O#what-a-mod-can-reach; A]
- "In an interactive session in a directory the user hasn't trusted yet, no mod loads until they answer the trust prompt." [A#know-which-controls-still-apply] Inference: a first run of the inbox in a new repo shows nothing until the person grants trust.
- `claude plugin validate ./dir` lists a mod's `hooks:` and `calls:` without running it. Example: `hooks: session.start, tool.call, ui.render{component=Pane}` and `calls: $.fs.read, $.http.fetch, $.store.set, $.ui.open`. [O#list-what-a-mod-does-before-you-install-one; A#review-what-a-mod-can-do]
- "Claude Code refuses to load a mod that uses the mods API in a way this command can't read." [A#review-what-a-mod-can-do]
- Calls the admin page tells reviewers to look for: [A#review-what-a-mod-can-do]

| Call | Why it matters |
|---|---|
| `$.fs.read`, `$.fs.write` | "anywhere the user can" |
| `$.process.run`, `$.process.spawn` | "Starts programs as the user" |
| `$.http.fetch` | Network |
| `$.env.get`, `$.settings.read` | Shown on an `env reads:` line |
| `$.env.set` | Affects every command and MCP server started afterward. Shown on an `env writes:` line. |
| `$.mcp.call` | Runs "under the session's permission rules" |
| `$.model.complete` | "Uses the user's plan or API key" |
| `$.prompt.submit` | "can send it as the user's own words" |
| `$.session.send` | Messages another session |

- Hooks reviewers should look for: `tool.call` and `prompt.submit` (see and change every call and prompt), `session.append` ("can rewrite each row of the conversation before it's stored"), `ui.render{component=AskUserQuestion}`, and `tool.check` ("can approve or deny a tool call before a permission prompt appears"). [A#review-what-a-mod-can-do]
- The inbox uses almost all of these (live grep, 2026-10-08): `$.process.run` at 9 sites in `hooks/register.tsx`, `$.model.complete`, `$.model.fork`, `$.prompt.submit`, `$.env.get`, `$.fs.write`, `$.store.*`, `$.tool.register`, `$.command.register`. It hooks `session.append` and `prompt.submit`. It does not call `$.http.fetch`.
  - Inference: the admin page's example policy mod refuses any user mod that calls `$.process.run` or `$.process.spawn` [A#enforce-a-policy-with-a-mod-of-your-own]. The inbox would fail that policy.

## Settings, environment variables and permissions

This section covers only the settings that touch plugins, hooks and mods. "Security model" and "Admin policy that can stop the mod" cover the guard and org policy.

### What can turn the inbox off

| Setting or state | Effect on the inbox | Source |
|---|---|---|
| `disableAllHooks` in a non-managed file, including a project's `.claude/settings.json` | "the mods you installed stop" | [SETR#disableallhooks] |
| `disableAllHooks` in managed settings | "the mods in every installed plugin stop" | [SETR#disableallhooks] |
| Managed `allowManagedHooksOnly` | Blocks "hooks and mods from other installed plugins". A GitHub install never counts as the org's. | [SETR#what-runs-under-allowmanagedhooksonly; A#install-your-organizations-mods] |
| Project `enabledPlugins: {"inbox@inbox": false}` | "Project settings take precedence over user settings". | [SETR#enabledplugins] |
| Untrusted folder, interactive terminal | "no mod loads until they answer the trust prompt" | [A#know-which-controls-still-apply] |
| `--safe-mode`, `--bare`, `CLAUDE_CODE_SIMPLE` | Installed mods off | [A; ENVV] |
| A deny rule `mcp__*` or `mcp__inbox__*` | "A tool matched by a bare-name glob deny rule is removed from Claude's context." | [P#manage-permissions] |
| The mod worker crashes three times | "Claude Code unloads every mod that isn't built in … until the user runs `/reload-plugins` or starts a new session." | [A] |
| Managed `disableSideloadFlags` | Rejects `--plugin-dir` and `CLAUDE_CODE_PLUGIN_DIRS`, so this machine's development setup fails on a managed machine. | [SETR#disablesideloadflags] |

Inference: the UI must not assume the inbox runs in every session on a machine.

### Settings `env` and the launch environment

- "When the Claude Desktop app … starts the session, the launch environment it builds takes precedence instead: Claude Code ignores an `env` value from any settings file for a variable the launch environment already sets." "The debug log names each ignored variable." [SETR#how-env-values-interact-with-your-shell]
- Settings `env` is not expanded: "No shell processes them, so shorthand such as `~` or `$HOME` stays as typed. For a variable that takes a path, such as `CLAUDE_CONFIG_DIR`, write the absolute path." [ENVV#in-settings-files]
- `CLAUDE_CODE_PLUGIN_DIRS` is the exception: paths "must be absolute or start with `~`". Needs 2.1.280. [ENVV]
- Project and local `env` apply "after you trust the workspace, or at startup in `-p` mode". [SETR#when-claude-code-applies-env-values]
- The list of variables project `env` cannot set "include[s]" `CLAUDE_CONFIG_DIR` and plugin cache variables. It does not name `CLAUDE_CODE_PLUGIN_DIRS`, and the list is not exhaustive. [SETR#variables-claude-code-ignores-in-env] Whether a repository can sideload a plugin folder this way is undocumented.
- `CLAUDE_CONFIG_DIR`: "Set it in your shell, user settings, or managed settings. In a settings file, write the absolute path." [ENVV]
- Inference: `HERDR_PANE_ID` (`hooks/register.tsx:publishStatus`) and `GH_TOKEN` may differ in desktop sessions. The debug log shows which settings values were ignored.

### Environment variables that matter

| Variable | Fact | Source |
|---|---|---|
| `CLAUDE_CODE_SESSION_ID` | Set for hooks and Bash, "updated on `/clear`". A stdio MCP server keeps its spawn id. "On `--continue` or `--resume` without an explicit ID it may receive the initial startup ID instead." | [ENVV] |
| `CLAUDE_CODE_PLUGIN_DIR_WATCH` | Reload is "on by default in interactive sessions". `1` turns it on in non-interactive sessions; `0` turns it off everywhere. Needs 2.1.287. | [ENVV] |
| `CLAUDE_CODE_SYNC_PLUGIN_INSTALL` | In `-p`, waits for plugin install. "Without this, plugins install in the background and may not be available on the first turn." | [ENVV] |
| `CLAUDE_CODE_ENABLE_BACKGROUND_PLUGIN_REFRESH` | Refreshes plugins at turn boundaries in `-p`. Off by default because it invalidates the prompt cache. | [ENVV] |
| `CLAUDE_CODE_FORCE_TERMINAL_IMAGES` | `1` draws mod `Image` elements as pictures in undetected kitty-protocol terminals. Not inside tmux. | [ENVV] |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | Also turns off feature-flag fetching. Network policy covers `$.http.fetch`. The docs do not say whether `$.model.complete` is refused. | [ENVV; A] |
| `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` | Ignored at any value from 2.1.287. | [A] |
| `CLAUDE_CODE_REMOTE`, `CLAUDE_CODE_BRIDGE_SESSION_ID` | Set in cloud sessions, and while Remote Control is connected. | [ENVV] |

- Live (2.1.295 terminal, names only): `CLAUDE_CODE_ENTRYPOINT` (value `cli`), `CLAUDE_CODE_EXECPATH`, `CLAUDE_CODE_SESSION_ATTENDED` and `CLAUDE_PLUGIN_DATA` are set but have no row in the env-vars page.
- The env-vars page classes the VS Code extension as non-interactive: "a non-interactive session such as `claude -p`, the Agent SDK, or the VS Code extension". [ENVV#first-session-after-an-install-or-upgrade]

### Trust in headless and desktop sessions

- "Claude Code shows the trust dialog in interactive sessions only. A `claude -p` run or an SDK session never shows it." [P#project-allow-rules-and-workspace-trust]
- The mod trust gate covers "an interactive session in a directory the user hasn't trusted yet". [A#know-which-controls-still-apply] Inference: it does not apply in desktop Code mode. Not verified.

### Host-supplied policy

- An embedding host ("Claude Desktop delivering a gateway's egress allowlist") can supply managed settings. With no admin tier, "the host's settings then apply as the only managed tier, still filtered to restrictive values." [SETR#parentsettingsbehavior]
- Claude Code ignores host policy "whenever an admin source is present". [SETR#disabledesktoplocalsessions]
- Inference: if host policy counts as "managed settings" for the guard's load rule ("The machine has managed settings" [A#know-what-happens-by-default]), a Pro user in Code mode would get the guard. Unknown.

### Install and update settings

- `extraKnownMarketplaces.autoUpdate`: "`claude-plugins-official` and most other official Anthropic marketplaces default to `true`, and third-party marketplaces default to `false`." [SETR#extraknownmarketplaces] So inbox users stay on their installed version until they update by hand.
- `strictKnownMarketplaces` `github` entries match `owner/repo` exactly. [SETR#strictknownmarketplaces]
- `pluginConfigs` ignores project and local entries since 2.1.207. A `--plugin-dir` plugin is keyed `<name>@inline`. [SETR#pluginconfigs; R#settings-and-environment-variables]
- `prependPlugins` and `appendPlugins` are read from user settings "only on a machine with no managed settings, for a user who isn't signed in with a Team or Enterprise plan". [SETR#prependplugins]
