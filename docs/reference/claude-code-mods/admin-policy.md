# Admin policy that can stop the mod

Part of [Claude Code mods](../claude-code-mods.md).

Terms:
- **Managed settings**: settings an organization delivers "as a file, through MDM, or from the claude.ai admin console". Users can't override them. [A]
- **The guard**: the built-in mod `sec-default@builtin`. "`/plugin` and the debug log list it as `cc-plugin-sec-default`." Its options are keyed `cc-plugin-sec-default@builtin` in `pluginConfigs`. It runs ahead of user mods and limits what they may change. [A#know-what-happens-by-default; A#set-options-on-the-built-in-guard]
- **Tier**: where a mod runs in the order. `e.tier` is one of `prepend|user|append|builtin`. "Every mod a person installs is `user`". [A#enforce-a-policy-with-a-mod-of-your-own]

## When the guard loads

- Only when "The machine has managed settings" or "The user is signed in to Claude Code with a Team or Enterprise plan". Users on an API key, Bedrock, Agent Platform or Foundry get it only with managed settings. [A#know-what-happens-by-default]
- Where the guard loads, it keeps a user's mod from changing "what your managed hooks receive or decide, the system prompt, your managed `CLAUDE.md` and other managed instructions, what any mod reads as settings, or the tools and descriptions of your managed MCP servers." "Everything else is allowed." [A#know-what-happens-by-default]
- Where the guard loads, a user's mod can't approve a call that a `deny` rule refuses, "whichever settings file holds the rule", and a managed `PreToolUse` block is final. "Neither applies to a mod's own `$.fs` and `$.process` calls." [A#know-what-happens-by-default]
- A user mod can still override `ask` rules and non-managed `PreToolUse` blocks. "In auto mode, a call the mod approves runs without a classifier check." [A#know-what-happens-by-default]
- "The guard fails closed: if the guard can't read managed settings, it refuses every user's mod at load. If it can't check the deny rules for a call that a user's mod approved, it refuses the call." [A#set-options-on-the-built-in-guard]

## What the guard's source skips (not in the docs)

These rows come from the guard's public source, anthropics/claude-code `mods/sec-default/` on main at commit `684800b` (2026-09-29): `hooks/register.ts` and `README.md` "The rows". On 2026-10-08 that was still the latest commit touching the folder (`gh api`). That branch may be ahead of the guard in a shipped engine. The engine types don't describe the rows.

- The guard calls `next.to(e, 'append')` on `classic.*`, `prompt.section`, `prompt.context`, `prompt.compose`, `skill.prompt`, `attribution.text` and `settings.read`. That skips every user-tier hook on those events. [G `hooks/register.ts` L24-32]
- `prompt.compose` row: "A person's plugin neither drops, reorders nor rewrites a section, nor changes the facts the list is composed from, nor answers a list of its own in its place." [G README]
- `prompt.context` row: "managed CLAUDE.md, rules and policy skills reach the model as written. A person's plugins keep `prompt.submit` and its additive context." [G README]
- `tool.register` row: "A `user`-tier caller is refused by name while managed settings hold `allowedMcpServers` (set at all, empty included); otherwise it passes." [G README; `hooks/register.ts` L39-50]
- `tool.describe` row, shared with `command.describe`, `agent.offer` and `agent.spawn`: "a subject provided by `user`, `builtin` or `core` passes". [G README]
- These pass untouched: `prompt.submit`, `turn.*`, `tool.call`, `command.run`, `command.register`, `session.*`, `ui.*`, `fs.*`, `http.fetch`, `process.run`, `store.*`, `clock.*`, `model.*`, `mcp.call`, `audio.*`, `agent.list`, `engine.create`. [G README]
- Under `allowManagedModsOnly`, a module is refused "whenever it loads or reloads (one already running when the option is set keeps running until then)". [G README "Options an administrator sets"]

Live, 2026-10-21, Claude Code 2.1.307, on a Team sign-in with `--setting-sources ''` and a disposable mod that logged its events:
- The guard loads in a `claude -p` run. The debug log lists `hooks module cc-plugin-sec-default@builtin loaded (native, environment 1, tier prepend)`, with `tool.describe` among its events. It also says `inbox: classic.SessionStart bypassed by cc-plugin-sec-default (tier user); beneath runs`. A session on this sign-in reproduces the guard.
- `tool.describe` hooks run, and the model reads their text. Claude Code sends only the first 4096 characters of a mod tool's description when the tool is pinned (`isDeferred: false`), and the first 16384 once the model loads the tool through tool search. A 3652-character description arrived whole and a 4110-character one was cut. `$.tool.register` warns at register time: "the description of longdesc (4925 characters) reaches the model up to its first 4096 characters, or its first 16384 once the model loads the tool through tool search".
- `/clear`, `/resume <id>` and `/branch` in a running session raise `session.end` (reason `clear`, `resume`, `resume`) and no `session.start` or `session.attach`. The first `prompt.submit` and `turn.start` after each carry the new session id. `/resume` and `/branch` give the same reason, so a hook that sees only these events cannot tell them apart.
- A start with `--resume <id>` or `--resume <id> --fork-session` raises `session.start` with the conversation's id, a new one for a fork. `classic.SessionStart` is skipped there too.
Live, 2026-10-21, Claude Code 2.1.307, same setup, logs of the probe in `.scratch/logs/` (not committed):
- `classic.PermissionRequest`, `classic.Stop` and `classic.StopFailure` were skipped by the guard in a `claude -p` run, except that `classic.StopFailure` was seen skipped only in the `-p` run that ended on an API error. In an interactive session `classic.PermissionRequest` and `classic.Stop` were skipped. `classic.StopFailure` was not caused interactively. The engine appends a notice row ("its classic.X hook was skipped") each time.
- `turn.step` passes. Its result has `answer`, `toolUses`, `stopReason`. With a Stop settings hook that blocked once, step 0 ended `tool_use` (Bash), step 1 ended `end_turn` with no `toolUses` and a reply, and step 2 of the same turn followed with the reply the Stop hook asked for. `turn.complete.answer` held only the last step's text.
- A turn that ended on an API error (`--model` with an id that does not exist) raised `turn.complete` with `reason: error`, an empty `answer` and no error code. `$.session.messages()` ended on an assistant row with the error text. The row carries `role`, `text` and `toolUses` only, and the `as: 'api'` form ended on the preceding user row. The error code, a usage-limit message and a sign-in message were not caused on purpose, so the text patterns in `hooks/claude.ts:stopOfMessage` come from message strings in the 2.1.307 binary and an earlier probe, not from live runs.
- `tool.check` passes, with `tool_use_id`, `approver: 'person'` in an interactive session and none under `-p`, and `next(e)` resolving to `{ decision: 'ask', reason }`. In manual mode a permission dialog was open right after it. In auto mode the same ask arrived, no dialog opened, and the tool result followed about 0.5 s later: the classifier settled it. Nothing on `e` or in the verdict tells the two apart. A hook that answers `ask` itself makes the dialog certain (the ask becomes the person's and no classifier settles it), so the inbox cannot use that without changing what the person is asked.
- `ui.render` for `ToolUse` carries `isRunning`. Live, 2026-10-22, Claude Code 2.1.308: in manual mode it stayed false for the whole time a dialog was open (about 13 s) and turned true when the dialog was answered, about 0.5 s after `tool.check` in auto mode. It stayed true while a `sleep 10` Bash call ran, and went false when the result row was stored. A render hook can't write state ("drawing is pure"), so a write after it must come from a later tick. Log: `.scratch/logs/run6-auto10s.events.log`, plus the manual-mode run in the same probe.

Inference, from the guard's source. In any session where the guard loads (every Team or Enterprise sign-in):
- The system-prompt section `inbox:guidance`, which the inbox once added through `prompt.compose`, never reaches Claude. The guidance now rides in the `close` tool's description (`hooks/register.tsx:on('tool.describe')`).
- The carry block, which the inbox once added through `prompt.context`, never reaches Claude. The mod now sends the card with the first prompt of each conversation through `prompt.submit` (`hooks/register.tsx:on('prompt.submit')`).
- The reload after `/clear`, `/resume` and `/branch` doesn't fire from `classic.SessionStart`. The mod also reloads at the first prompt after the switch, when the session id differs from the conversation it holds (`hooks/register.tsx:on('prompt.submit')`).
- The band, pane, per-turn model call and tools still run, unless `allowedMcpServers` is set. Then `record` and `close` don't register.

## Policies that stop or limit user mods

| Setting (managed) | Effect | Source |
|---|---|---|
| `allowManagedModsOnly` (guard option) | "No mod a user brings runs its hooks": installed plugins, `--plugin-dir`, mods Claude writes. The org's own mods and built-ins still run. Users' settings hooks, plugins' `hooks/hooks.json`, status lines and `/goal` keep working. | [A#stop-user-installed-mods-from-loading] |
| `allowManagedHooksOnly` | "Only your organization's mods and the mods built into Claude Code load". It "also blocks hooks in users' own settings files". | [A#choose-how-much-to-allow] |
| `disableAllHooks` (managed) | The widest. "stops the mods in every installed plugin, yours included", all settings hooks including managed `PreToolUse`, status lines and `/goal`. Built-in mods keep running. | [A#choose-how-much-to-allow] |
| `disableSideloadFlags` | Rejects `--plugin-dir`, `--plugin-url`, `--agents`, `--mcp-config`, and mods Claude writes. `--plugin-dir` exits with "`--plugin-dir is disabled by your organization's managed settings (disableSideloadFlags)`". Also blocks `CLAUDE_CODE_PLUGIN_DIRS` [SETR#disablesideloadflags]. | [A#choose-how-much-to-allow] |
| `allowModsToOverrideDenyRules` (guard option) | Unset: "Deny rules take precedence over users' mods". | [A#set-options-on-the-built-in-guard] |
| `strictKnownMarketplaces` and other plugin controls | Cover mods. | [A#know-which-controls-still-apply] |
| Network policy | Refuses `$.http.fetch` when web fetching is off or "nonessential network traffic is turned off for the session". It "doesn't cover a program the mod starts with `$.process.run`". | [A#know-which-controls-still-apply] |

- Set the guard option this way: `"pluginConfigs": { "cc-plugin-sec-default@builtin": { "options": { "allowManagedModsOnly": true } } }`. Options are read only under that key in managed settings. `prependPlugins` also accepts `sec-default@builtin`; `pluginConfigs` doesn't. "Where the guard doesn't load, neither option applies." [A#set-options-on-the-built-in-guard]
- `allowManagedModsOnly` is read from managed settings only. Users can't undo it. File or MDM delivery works on Bedrock, Agent Platform and Foundry. Console delivery has its own "Platform availability". [A#stop-user-installed-mods-from-loading]
- None of these settings affect built-in mods. [A#choose-how-much-to-allow]
- `--safe-mode` turns off installed mods, the org's included. Settings hooks are not deprecated. Managed `PreToolUse` hooks run before any mod, and again on a rewritten call. Other `PreToolUse` hooks "run after the last mod", so a mod that answers a call keeps them from running. [A#know-which-controls-still-apply]
- What a user can load: no controls → any marketplace, `--plugin-dir`, or a mod Claude writes. A marketplace allowlist → allowed marketplaces plus `--plugin-dir`; a mod Claude writes only if `skills-dir` is allowed. Allowlist plus `disableSideloadFlags` → allowed marketplaces only. [A#decide-whether-to-leave-mods-on]

## What counts as the organization's mod

- All three must hold: managed `enabledPlugins` sets it `true`; managed settings name the marketplace as "a directory on the user's machine, by absolute path" (`extraKnownMarketplaces` with source `directory`); the marketplace lists the plugin "by a relative path, so Claude Code loads it in place". [A#install-your-organizations-mods]
- Device management must copy that directory to the same path on every machine. "Managed settings you deliver from the claude.ai admin console can carry the keys, but they can't put the directory on a machine." [A#install-your-organizations-mods]
- "A plugin that Claude Code copies into its cache counts as a user's, even when managed `enabledPlugins` enables it. That covers every plugin from a GitHub, git, URL, or npm source." `prependPlugins` and `appendPlugins` skip it. Its debug line contains `is enabled by managed settings, but`. [A#apply-your-plugin-controls-to-mods]
  - So the inbox, installed from GitHub, is always a user's mod, even when an org enables it on claude.ai. [A#stop-user-installed-mods-from-loading]
- Order: a mod in `prependPlugins` "sees every event before any user's mod and every result after. It can change the event, refuse it, or skip the users' mods." A mod in `appendPlugins` "sees only the events those mods pass on". Setting `prependPlugins` replaces the default list, so it must name `sec-default@builtin`. Repositories can't set either key. A user's own list "neither adds nor removes the built-in guard" and works only with no managed settings and no Team or Enterprise sign-in. [A#install-your-organizations-mods]
- Debug lines that show the tier: `hooks module X loaded` with `tier prepend` means the org's; `tier user` plus `…not an enabled managed plugin with a hooks module; skipped` means not. [A#install-your-organizations-mods]

## Policy mods

- Before each mod loads, a mod in `prependPlugins` gets the `claude plugin validate` list in the `plugin.register` event and "can read that list and refuse the mod". `e.uses.calls` lists calls as `namespace.method`. Returning `{ refuse }` blocks the load. [A#enforce-a-policy-with-a-mod-of-your-own]
- A hook named after a method, such as `fs.write`, sees "every `$.fs.write` call" from other mods. Returning `{ deny }` blocks one call. `next.origin.plugin` names the caller. [A#enforce-a-policy-with-a-mod-of-your-own]
- A `plugin.register` hook that "throws or exceeds its time limit" is skipped, so the check fails open. A `.catch()` handler makes it fail closed. [A#refuse-mods-when-your-check-fails]

## How a refusal shows

- "A user whose mod was refused or didn't load finds the reason in their debug log." [A]
- The refusal comes after a `loaded` line: "An earlier line says that mod's hooks module `loaded`, so look for the refusal." Example: `refused by cc-plugin-sec-default: mods are limited to your organization's by policy (allowManagedModsOnly)`. [A#allow-only-your-organizations-mods]
- A refusal reaches the transcript only "in a session that hot-reloads a plugin directory". [A#enforce-a-policy-with-a-mod-of-your-own]
- Inference: the person sees only a missing band. The inbox can't report its own absence.
