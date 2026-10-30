# Subagents, lifecycle, the hook function and events

Part of [Claude Code mods](../claude-code-mods.md).

## Subagents and the inbox's tools

Checked on 2026-10-21 in the inbox-ui VM with Claude Code 2.1.306 (Haiku 5.5, a Claude Max sign-in, so the guard in key constraint 5 did not apply), in a tmux session in Terminal. The mod was a copy of `main` with the guidance in the `close` tool's description (#24, 6232d53), loaded with `CLAUDE_CODE_PLUGIN_DIRS` through a `--settings` file that disabled the installed inbox for that run. The main agent started one `general-purpose` subagent with the Agent tool.

- **A subagent is offered the inbox's tools.** Its request carried 11 tools, including `mcp__inbox__record` and `mcp__inbox__close`. [live 2.1.306] Source: the `prompt_snapshot` attachment in the subagent's transcript, `step0/logs/cc1/7758fbd2-fd20-44e9-98c7-4213110b1ccb/subagents/agent-aa65ed97556a5c396.jsonl` in the VM share folder.
- **Its `close` description carries the guidance.** The description was 4,055 characters and held the "# Inbox" guidance, as the main agent's did. The `record` description (1,329 characters) did not. The subagent's system prompt mentioned no inbox. [live 2.1.306] Same transcript. The main agent's session is `step0/logs/cc1/7758fbd2-fd20-44e9-98c7-4213110b1ccb.jsonl`.
- **A subagent gets no `inbox:` card.** No card message appears in its transcript. The string `inbox:` there comes only from the `close` tool's description and the model's own quote of it. That it receives no `prompt.submit` is inferred; no event log was kept. [live 2.1.306] Same transcript.
- **The main agent's quote of the description matched the subagent's** in the paragraphs I compared. The wire-level size and content come from the subagent's `prompt_snapshot` only.
- **The tools a `step` tool would sit beside are `record` and `close`.** The other tools in that list were the engine's and the connectors'.
- **Not checked:** whether `prompt.context` or `prompt.compose` run under a guard, and the Claude desktop app. The sign-in here was not a Team sign-in.

## Lifecycle: what fires and what resets

Terms:
- **Reload**: the engine loads the hooks module again (a save under `--plugin-dir`, `/reload-plugins`, an enable, or a worker respawn). It runs `register` again.
- **Conversation switch**: `/clear`, `/resume` or `/branch`. The process keeps running with another conversation.

| Event | When it fires | Source |
|---|---|---|
| `session.start` | "Once for each loaded mod, before the first prompt, and again after a reload of that mod. Not after `/clear`, `/resume`, or `/branch`." Types: "once per process for each loaded plugin … then once per fresh load of one (never `/clear`)"; a later firing comes from "an enable, a worker respawn, or a reload". "The first firing is awaited". | [R#session; T: `session.start`] |
| `session.end` | `e.reason` is `clear`, `resume`, `logout`, `prompt_input_exit` or `other`. "`/branch` reports `resume`." `other` covers "a `-p` run finished or the process got SIGINT, SIGTERM or SIGHUP". | [R#session; T: `SessionEndInput`] |
| `session.attach` / `session.detach` | "Another app connects to or disconnects from the session". Return only `next(e)`. Types: fields `surface`, `clientId` ("A client that never named itself is `<surface>:default`"), `viewport?`; observe only. Detach `reason` is `'detach' \| 'end'`; with `end` "it runs inside `session.end`'s one short bound". | [R#events; T: `SessionAttachInput`, `SessionDetachInput`] |
| `classic.SessionStart` | The settings-hook event. Fires with `source` `clear`, `resume` or `fork` on a conversation switch, and also for a start with `--resume`. Fires "whether or not any settings hook is configured". | [IF#load-a-saved-value-again-after-clear; T: classic events] |

- On `/clear`: "the conversation ends, the process goes on under a new session id, and no `session.start` fires for it." [T: `SessionEndInput`]
- The `session.end` bound: "One short wall-clock bound (1.5 s by default) covers every hook, its `$` waits and core … at it `next.signal` aborts, a `$` call in flight with it; only a process a command let go of outlives it." [T: `SessionEndInput`] The reference counts the budget "from when your settings `SessionEnd` hooks finish" and names `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`. [R#limits]

What survives what:

| Kept in | Reload | `/clear`, `/resume`, `/branch` | New session | Source |
|---|---|---|---|---|
| Module variable | Reset | Kept (same module) | Reset | [TS#a-value-resets-when-the-module-reloads] |
| Timers (`$.clock.every`, `after`) | Stopped | Kept | Gone | [A#stop-background-work] |
| `$.state` | Kept: "A value in `$.state` also survives a reload of the module, which a variable doesn't." | Reset to defaults | Reset | [IF#keep-a-value-in-$-state; TS#a-value-resets-after-clear-resume-or-branch] |
| `$.store` | Kept | Kept | Kept, shared by every session | [IF#keep-state] |

- To reload after a switch, hook `classic.SessionStart` with `source: ['clear','resume','fork']`. [IF#load-a-saved-value-again-after-clear]
- The inbox does this at `hooks/register.tsx:on('classic.SessionStart')`. `$.session.id()` still names the previous conversation there, so the inbox reads the new id from `e.session_id` (commit `f23d9ad`; see the comment in that handler). Live on 2.1.295: a `--debug-file` log of an in-session `/resume` showed `$.session.id()` returning the old id, even after `next(e)`.
- The inbox's `session.end` (`hooks/register.tsx:on('session.end')`) runs four `$.state` updates plus `publishStatus($, true)`. `publishStatus` runs `herdr pane report-metadata` through `$.process.run` with `timeoutMs: 5000`, only when `HERDR_PANE_ID` is set (`hooks/register.tsx:publishStatus`). Inference: that 5 s timeout exceeds the 1.5 s bound, so the call can be cut off at session end.
- A worker crash ×3 unloads every non-built-in mod until `/reload-plugins`. [A]

## The hook function

- `on(event, matcher?, hook)` returns a registration with `.catch(handler)`. `e` is "deeply frozen plain data. To change it, pass a copy to `next`." [R#the-hook-function]
- `next(e)` runs the later hooks, then Claude Code's own behavior, and resolves to the result. `next.signal` aborts when the event is abandoned, "for example when the user interrupts". `next.origin` is `{ plugin, tier }`; the engine is `{ plugin: 'engine', tier: 'core' }`. `next.budget` has `.ms` and `.remainingMs`. `next.to(e, tier)` skips ahead; "Only a mod in `prependPlugins` or `appendPlugins` can call it." [R#the-hook-function; A#stop-background-work]
- Three ways to handle an event: observe (return `next(e)`), rewrite (pass a copy; "assigning to a field throws"), answer (return without `next`, which "short-circuits the chain"). [E#how-a-hook-handles-an-event]
- Matchers: a field can be a value, an array or a RegExp; every field must match. `'classic.*'` matches every settings-hook event. `'*'` matches all but telemetry. "Register each event once per matcher". [E#filter-which-events-a-hook-handles]
- Order: [E#the-order-mods-run-in]
  1. `sec-default@builtin`, then `prependPlugins`, then other org mods.
  2. User-installed mods.
  3. `appendPlugins`.
  4. Other built-in mods.
  - "Within one module, hooks run in the order `register` called `on`." "The first mod is outermost … A later mod can't stop an earlier one from seeing an event."
- Settings hooks in the order: managed `PreToolUse` runs before the first mod and its block is final. All other `PreToolUse` hooks, including a plugin's `hooks/hooks.json`, run "after the last mod calls `next`". [E#where-settings-hooks-run-in-the-order]
- To make a blocking hook fail closed, "add a `.catch` error handler that answers in its place." "At `tool.check` and `plugin.register`, a refusal returned after `next` resolved still holds". [E#handle-a-hook-that-fails]
- `next.error` (in `.catch` only): `kind` `throw` or `timeout` with `message`; `re-entry` "when the hook was skipped because the event came from inside one of its own mods API calls"; `cause` `lent` when another mod's added method fired it. `re-entry` and `cause` need 2.1.292. [R#the-hook-function]
- Every mods API method is also an event. "A hook on one intercepts calls from the mods that run after it, and can return `next(e)`, `{ deny: reason }`, or `{ value }`." [R#mods-api-calls] So an earlier mod (an org mod, the guard) can see, rewrite or refuse the inbox's calls, including `model.complete` prompts that carry session content.
- The types say: "EARLY ACCESS: this surface may change between releases without notice." [T header]

## Events the inbox uses or could use

From [R#events] unless marked.

| Group | Events and returns |
|---|---|
| Tools | `tool.call` → `next(e)`, `{ deny }`, `{ result }`. Arguments are fields of `e` (`e.command`). Fires for subagent and MCP calls. `{ result }` means "no permission prompt appears and the tool doesn't run". `tool.check` fires "after the permission rules and the settings hooks have decided"; arguments in `e.input`; returns `{ decision, reason? }`. `tool.describe` fires "Once for each tool, when its description is first sent to Claude"; returns `{ description, isDeferred? }`. [E#guard-or-change-a-tool-call; E#approve-or-refuse-a-tool-call-before-the-user-is-asked] |
| Prompts | `prompt.submit` → `next({...e,text})`, `next({...e,context})`, `{ drop }`. `context` is "text only Claude reads, after the prompt". `prompt.compose` → `{ sections }` of `{ id, text, scope }`. `prompt.section` → `{ text }` or `{ text: null }`. `prompt.context` fires "Once for each conversation", returns `{ blocks }`. `prompt.attachment` → `{ text }` or `{ text: null }`. `prompt.mention` (2.1.290). `prompt.fill`, `prompt.suggest`, `prompt.edit` (50 ms), `skill.prompt`, `attribution.text`. Types add `prompt.autocomplete`. |
| Commands | `command.run` → `{ text }`, `{}`, `next(e)`. `command.describe` → `{ description, argumentHint, isHidden }`. `config.set`, `config.describe`. |
| Turns | `turn.start`; `turn.step` (async generator, can change `model` or `effort`; `result.usage`); `turn.complete` (`isAborted`, `answer`, `durationMs`, `usage`, `agentId`; can return `{ text }` "to show a line under the answer"). Server tools such as advisor fire no `tool.call` or `tool.check`. [E#follow-a-turn] |
| Session | `session.start`, `session.end`, `session.compact` (`{ skip }`), `session.receive`, `session.send`, `session.append` ("Once for each row the conversation keeps … before it's stored"), `session.attach`, `session.detach`, `session.measure`. |
| Subagents | `agent.offer`, `agent.spawn` (`next({...e, model})` or `{ deny }`). |
| Interface | `ui.render`, `ui.resolve`, `ui.press`, `ui.input`, `ui.select`, `ui.focus`, `ui.scroll`, `ui.close`, `ui.message`, `ui.fault` (2.1.289). |
| Other mods | `plugin.register` (`{ refuse }`; `e.uses`), `engine.create`. |
| Settings hooks | `classic.<Event>`: "`e` is the hook's stdin JSON". |

- `prompt.submit` notes: "If your hook returns a `drop` after its `next(e)` call let the prompt through, the turn still runs, and the hook fails". "Text from these hooks that changes between requests invalidates the prompt cache." [E#rewrite-or-add-to-a-prompt]
- `PromptSubmitInput` is `{ text, attachments?, context?, turnId?, wait, origin }`. `origin` is set by the engine, and "no hook may set one". Context "past 100,000 characters (200,000 together)" is cut to a head and a path. [T: `PromptSubmitInput`]
- `session.append`: `door` is one of prompt, command, response, tool-result, tool-message, delivery, attachment, hook-context, note, compaction, notice. A hook may rewrite `message.content` only. [T: `session.append`]
- The inbox hooks as of commit `286257d` (`on(...)` calls in `hooks/`): `command.run`, `config.set`, `prompt.submit`, `session.append`, `session.attach`, `session.end`, `session.start`, `classic.SessionStart`, `classic.PermissionRequest`, `classic.StopFailure`, `tool.call` ×3, `tool.describe` ×2, `turn.complete`, `turn.start`, `turn.step`, `ui.close`, `ui.message`, `ui.press`, `ui.render` ×2, `ui.scroll`.

### Prompt origin (who sent a prompt)

- `prompt.submit`'s `origin.kind` says where a prompt came from. The inbox treats a prompt as the person's own words only for `composer`, `bridge`, or `plugin` with `asUser` (`hooks/register.tsx:isPersonsWords`), and skips prompts its own plugin sent (`hooks/register.tsx:on('prompt.submit')`).
- Which `origin.kind` a desktop Code-mode prompt has is unknown. Inference: an SDK host may send prompts as `sdk`. If so, the inbox would not treat desktop prompts as the person's words. This is the largest open risk for desktop.
