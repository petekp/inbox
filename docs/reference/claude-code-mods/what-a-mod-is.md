# What a mod is, and its versions

Part of [Claude Code mods](../claude-code-mods.md).

## What a mod is

- A mod is a plugin made of JS or TS event handlers. A handler "can watch the event, change it, or take it over". [O#mods-overview]
- The mods docs call a mod's handler a "hook". A hook defined in a settings file is a "settings hook". [O, top of page]
- A mod can do what settings hooks, skills, status lines and MCP servers can't. [O#what-a-mod-can-do]
  - Draw "a pane beside the transcript or a band above the prompt, with tabs, buttons, and text fields".
  - Redraw Claude Code's own rows: tool rows, the spinner, the AskUserQuestion dialog.
  - Hold a tool call, answer it without running the tool, or call another model.
  - Register a `/command` that runs "at once, with no Claude turn, even while Claude is working".
  - Share variables between hooks.
- "Claude Code runs your hook before it acts on the event, so the hook decides what happens next." A hook can observe, rewrite or answer the event. [O#what-a-hook-can-do-with-an-event]
- "To do anything outside its own code, such as draw, add a command, call a model, read a file, start a process, or make a network request, a hook calls the mods API. A hook has no other way to do those things." This is why `claude plugin validate` can list what a mod does without running it. [O#what-a-hook-can-do-with-an-event]
- A minimal mod has three files: `.claude-plugin/plugin.json`, `hooks/hooks.json` (which names the code under `modules`) and the hooks module, such as `hooks/register.js`. [O#how-a-mod-works]
- Only a mod can draw. The comparison table marks "Can it draw in the interface" as "Yes" for a mod and "No" for settings hooks, skills and MCP servers. One plugin can hold a mod, a skill and an MCP server together. [O#compare-mods-settings-hooks-skills-and-mcp-servers]
- Some built-in features are mods, such as `/diff`. [O#get-a-mod]

The inbox's files (live, this repo):

| File | What it holds |
|---|---|
| `.claude-plugin/plugin.json` | `name`, `description`, `types`. No `version` or `author`. |
| `hooks/hooks.json` | `{ "modules": ["./register.tsx"] }` |
| `.claude-plugin/marketplace.json` | One entry, `{ "name": "inbox", "source": "./" }` |
| `.claude-plugin/types/claude-code/index.d.ts` | Engine types. Gitignored. Rewritten by whichever engine last loaded the mod. |

## Versions and turning mods on or off

- "Mods are on by default. In the terminal, use Claude Code v2.1.287 or later. The Desktop app includes its own copy of Claude Code, and mods work there from v2.1.286." [O#turn-mods-on-or-off]
- The admin page says "Mods are on by default in Claude Code v2.1.286 and later", with no split by app. [A, top of page] See "Where sources disagree".
- The reference describes "the Claude Code CLI and the Desktop app as of v2.1.290". [R, top of page]
- `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` was an early-access switch. "Claude Code v2.1.287 and later ignores it, so setting it to `0` doesn't keep mods off." [O#turn-mods-on-or-off; A]
- Check the terminal engine with `claude --version`. Check the desktop engine "in a local session in the Code tab, enter `/status` and read the **Claude Code** row". [O#turn-mods-on-or-off]
- The desktop app runs its own engine copy. It "can differ from the `claude` command in your terminal, and updating one doesn't update the other". Update it with Claude → Check for Updates, then "start a new session". [desktop#claude-code-version-in-the-code-tab]
- A mod can read its engine version at run time: `$.session.version()` returns `{ version, base, builtAt }`. [T: `session.version`]
- Ways to turn mods off: [O#turn-mods-on-or-off]

| Scope | How |
|---|---|
| One mod | Disable or uninstall it on the Installed tab of `/plugin`. |
| All installed mods, one session | `--safe-mode`, which "also disables your other customizations". |
| Every installed mod, every session | `"disableAllHooks": true` in `~/.claude/settings.json`. Settings hooks and the custom status line stop too. "What your organization manages keeps running." |

- "`disableAllHooks` and your organization's `allowManagedModsOnly` stop a mod and leave the rest of its plugin in place: the plugin stays installed, and its skills, commands, agents, and MCP servers load. Other settings and flags reach further." [O#turn-mods-on-or-off]
  - Inference: the inbox registers its tools and `/inbox` from mod code (`$.tool.register`, `$.command.register`), so they go away with the hooks. Not verified.
- See which mods a terminal session loaded: `/plugin` shows "a dim line under the tabs" such as `1 mod active · first-mod`. The doc names only "a terminal session". [O#see-which-mods-a-session-loaded]
- After installing or updating from a shell while a session is open, "run `/reload-plugins` in that session to load it. Otherwise it loads the next time you start Claude Code." [O#install-or-update-a-mod]
- Sample mods live in `claude-code/mods` of anthropics/claude-code-playground, shared "as they are, without support": `token-weather` draws a band, `blast-radius` holds risky shell commands behind proceed and cancel buttons, `replay-theater` adds `/replay`. [O#try-a-sample-mod]

### Built-in mods

Built-in mods show under **Built-in** in `/plugin` → Installed. They can't be updated or uninstalled. The `mods active` line leaves them out. [O#mods-built-into-claude-code]

| Built-in mod | What it does | When it is on |
|---|---|---|
| `cc-plugin-agents-md` | Loads `AGENTS.md`. Has a userConfig option. | Every session that can read AGENTS.md. |
| `cc-plugin-diff` | "Takes over `/diff` and draws its pane". Its source shows buttons bound to keyboard actions and scrolling the mod handles itself. | "Interactive terminal sessions". Disabling it leaves the built-in `/diff`. |
| `cc-plugin-plugin-authoring` | A skill, no mod code. | "Unless Anthropic has turned installed mods off remotely". |
| `cc-plugin-sec-default` | The guard (see "Admin policy that can stop the mod"). | Can't be turned off by the user. |
| `cc-plugin-telemetry` | Analytics for Claude Code and built-in mods. Adds methods other mods can call. | Off with `DISABLE_TELEMETRY`. |
| `cc-plugin-you-should-know` | "Runs a side agent that watches your back while Claude works on longer tasks. When it finds something worth knowing that you might miss, it shows you a note above the prompt." | "Disabled by default". Enable with `/plugin enable cc-plugin-you-should-know@builtin`. |

- "The settings and flags that stop installed mods, such as `disableAllHooks`, `--bare`, and `--safe-mode`, don't stop built-in mods." [O#mods-built-into-claude-code]
- Public source for `diff`, `agents-md`, `sec-default` and `telemetry` is in `mods/` of anthropics/claude-code. Not for `you-should-know`. [O#read-the-source-of-built-in-mods]
- `$.telemetry` records are "sent only when Claude Code or a built-in mod makes the call". [R]
- Inference for the inbox: `cc-plugin-you-should-know` also spends model calls and draws above the prompt. It overlaps the inbox's findings and band. Built-in mods run after the ones a user installs [E#the-order-mods-run-in], so its band drawing reaches the inbox through `next(e)` and draws under the inbox's lines.
