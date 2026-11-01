# The `$` API and its limits

Part of [Claude Code mods](../claude-code-mods.md).

## The `$` API

Namespaces and methods. [R#mods-api-methods; T]

| Namespace | Methods | Notes |
|---|---|---|
| `$.plugin` | `name`, `root` | |
| `$.ui` | `resolve`, `invalidate`, `open`, `close`, `panes`, `focus`, `scroll`, `toast`, `status`, `log`, `notice`, `ask`, `copy`, `selection`, `blit`; `notify` in 2.1.295 types only | See below |
| `$.command` | `register`, `run`, `list` | `register` "throws for a taken name" |
| `$.tool` | `register`, `call`, `check`, `list` | Claude sees `mcp__<plugin>__<name>` |
| `$.agent` | `register`, `spawn`, `list` | `idle`, `waiting` statuses need 2.1.289 |
| `$.model` | `complete`, `fork`, `classify` | Bills the user's plan or API key |
| `$.prompt` | `submit`, `read`, `fill`, `suggest`, `compose` | |
| `$.turn` | `abort` | |
| `$.session` | `messages`, `cwd`, `root`, `model`, `turns`, `id`, `repo`, `surfaces`, `usage`, `version`, `compact`, `send`, `append`, `authorize` | `surface()` deprecated |
| `$.config` | `list`, `set` | |
| `$.settings` | `read` | |
| `$.env` | `get`, `set` | Name must be a string literal |
| `$.fs` | `read`, `write`, `list`, `exists`, `stat`, `ancestors` | 4 MiB per file; "`write` isn't atomic" |
| `$.store` | `get`, `set`, `delete`, `keys` | Shared, 4 MiB |
| `$.state` | reactive `get`, `set`; helpers `atom`, `read`, `update`, `derive`, `memberOf` from `claude-code` | Per session |
| `$.clock` | `now`, `sleep`, `after`, `every` | |
| `$.http` | `fetch` | Resolves `{ status, ok, headers, text }` "once the body is read" |
| `$.process` | `run`, `spawn` | No shell |
| `$.mcp` | `call`, `connect` | `connect` only for servers in your own manifest |
| `$.audio` | `play`, `speak` | |
| `$.telemetry` | `log`, `mark` | Sent only for Claude Code or built-in mods |

- The module has "no Node.js APIs, no timer globals such as `setTimeout`, and no network or file access of its own". It has `URL`, `TextEncoder`, `AbortController` and `crypto.subtle`. Relative paths resolve against the session's working directory. [A#reach-files-processes-and-the-network]

### `$.ui`

- `toast`: 4 s by default. "a box at the top right in fullscreen rendering, and one line at the right under the prompt in the classic renderer." Draws the first 2,000 characters, "10000 remotely". [A#show-something-without-starting-a-turn; T: `ui.toast`]
- `status`: "One line under the prompt that stays until you change it. It starts with `⚠` and the mod's name". One per plugin. [A]
- `log`: "A dim line in the transcript that Claude doesn't read". "a `-p` or SDK host receives it as `ui_log`". `{ to: 'debug' }` sends it to the debug log only. [A; T: `ui.log`]
- `ask`: 2-4 options. Adds a free-text row and a **Chat about this** row. "resolves to the label the user picks", or typed text. Rejects "when the user dismisses the question or picks **Chat about this**, and in a `claude -p` run". Its wait doesn't count against the hook's time limit. [E#hold-a-tool-call-until-the-user-decides]
- `copy`: "The terminal writes as `/copy` does; a remote surface has no path yet." Returns `{ isCopied: false, reason }` there. [T: `ui.copy`] The inbox copies with `surface: press.surface` (`hooks/register.tsx:perform`) and `perform` returns `COPY_FAILURES[reason]` on failure, which the row shows in red. It raises no toast. Inference: copy fails on desktop. Not verified.
- `selection`: "what the person last selected with the mouse … `undefined` … where none is seen: fullscreen off, -p, a surface that answers none". [T: `ui.selection`]
- `panes`: "The engine's record, not the module's". [T]
- `notify(text, { title })` (2.1.295 types only): a native notification through the user's `preferredNotifChannel`; resolves `{ isSent, channel }` or `{ isSent: false, reason }`. [T 2.1.295]

### `$.prompt`

- `submit({ text })` "waits until the session is idle and then starts a new turn. It resolves when that turn starts, so don't `await` it in a handler that runs while Claude is working." Claude reads it "after a sentence that names your mod as the sender"; `asUser: true` drops that sentence. [A] The inbox uses `asUser: true` at `hooks/register.tsx:send`.
- Headless behavior: `read` returns `{ text: '', cursor: 0 }` "where the session draws no box (a -p run, an SDK host)"; `fill` returns `isFilled: false` "under a dialog or headless"; `suggest` returns `isShown: false` "while the box holds text, a turn runs, or headless". [T] Inference: these may be inert in desktop Code mode, which runs headless. Not verified.

### `$.tool.register` and `$.command.register`

- "Register both in a `session.start` hook. Claude Code waits for that hook before the first prompt, so what you register is available from the first turn." [A#add-a-command-or-a-tool]
  - Seen in [#97](https://github.com/petekp/inbox/issues/97): a session the desktop app reopened had no inbox tools on its first prompt, because the inbox registered them at `session.attach`. The resumed transcript had announced them, so that prompt's `deferred_tools_delta` retracted them with cause `not_configured`. The inbox now turns on in `session.start` for a process the app started. The details and a repro are in [desktop](../claude-desktop-app/live-checks.md#a-reopened-sessions-first-prompt).
- `register` "Rejects until the session binds, at `session.start`". "a name registered again is replaced". With `isDeferred` left out, "the engine's rule places it: behind ToolSearch … A `tool.describe` hook's answer is read first." [T: `ToolSpec`]
- `$.tool.register({ isDeferred: false })` "requires Claude Code v2.1.293 or later, and earlier versions ignore it". [A#add-a-tool] `tool.describe` returning `isDeferred: false` has no stated version gate. [R#tools] The inbox registers with `name`, `description` and `inputSchema` only (`hooks/register.tsx:initializeInbox`) and sets `isDeferred: false` through `tool.describe`.
- A command hook that throws is skipped, "so the rest of your `session.start` hook doesn't run either. Register commands last … or wrap the call in `try` and `catch`." `immediate: true` lets the command run mid-turn. The returned `{ text }` "prints in the transcript and Claude reads it", "after the plugin's name". [A#add-a-command]

### `$.model`

- `complete` "sends one prompt to a model with your session's credentials … It has no conversation history." "These calls use the user's plan or API key." [A#call-a-model]
- What is sent: "No tools, no history, no system prompt beyond the CLI's identity block and `request.system`." [T: `model.complete`]
- `model`: "An alias (`haiku`) or a full model id; resolved and allowlist-checked like a `--model` value." "The call rejects for a request Claude Code won't send, such as a model your organization blocks." [T; A]
- `maxTokens`: "1024 by default, up to 64,000 or the model's output limit"; "The reply comes back whole, not streamed". `effort`: low, medium, high, xhigh, max; "dropped where it does not" apply. `timeoutMs` has no default. [R#limits; T]
- Results: `isAnswered: true` with `{ text, usage }`, or a `reason`: `api-error` (with `status` and an error kind: rate_limit, overloaded, invalid_request, authentication_failed, server_error, unknown), `empty-reply`, or `aborted` (escape on the calling turn, the environment unloaded, `signal`, or timeout). "What the provider did never rejects the call". `usage` comes back on every arm. [T: `ModelCompleteResult`]
- Caching: "Put the text every call repeats first and mark its last block (`cache`); whatever follows the last mark is paid for whole on every call." "a call within five minutes that opens with the same text reads it there". Both cache counts at zero means "text under the model's minimum, or caching switched off". "On Bedrock, Vertex, Foundry or behind a gateway the text is found again only while `prompt` opens the same way." "Marks go uncounted: one too many is the API's own `api-error` (status 400)." [T: `ModelTextBlock`]
- `fork` "asks one question over the current conversation instead, with the same model and system prompt, so the Claude API serves most of it from the prompt cache". Types: "every tool denied … the prefix billed afresh once the entry lapsed or after `/model`". `nothing-to-fork` covers "before the first response and after `/clear`". [A#call-a-model; T: `model.fork`]
- `classify` defaults to "the engine's small fast model". [T]
- The inbox: `MODEL = 'sonnet'` (`hooks/register.tsx:MODEL`); `askInboxModel` sends a `cache: true` system block with `maxTokens: 1600`, `effort: 'low'` (`hooks/register.tsx:askInboxModel`) and a 45 s timeout (`hooks/register.tsx:runUpdate`); `$.model.fork` in `hooks/register.tsx:catchUp`. See "What the inbox's model calls cost".

### `$.store` and `$.state`

- `$.store`: "A key-value store that every session on the machine shares" [R]; "A JSON key-value store of your plugin's own, kept between sessions" [A]; "kept between sessions and hot reloads … A JSON file of the plugin's own under the user's Claude Code configuration directory" [T]. "A `get` followed by a `set` isn't atomic." It lasts until the mod deletes it, "or no session reads or writes the store for `cleanupPeriodDays`". [IF#keep-state]
- `set` round-trips through JSON (a Date becomes a string, a Map becomes `{}`). It "Rejects a function, a cycle, or a store over 4 MiB". [T: `store`]
- Live, file names only: store files are `~/.claude/plugins/store/<name>_<source>-<hash>.json`, where `<hash>` is the first 12 hex characters of sha256 of `<name>@<source>`. Verified for `inbox@inline` → `7e8589075f50`. So the store is keyed by plugin id, not name. Every folder copy named `inbox` shares `inbox@inline`. Inference: a marketplace install would be `inbox@<marketplace>` with a separate store, so a move to marketplace installs needs a store migration. The file was about 70 KB on 2026-10-08.
- Inference: "every session on the machine" holds only for one `CLAUDE_CONFIG_DIR`.
- The inbox saves per session under `s:${owner.id}` (`hooks/register.tsx:save`) and prunes to `KEPT_SESSIONS = 40` (`hooks/register.tsx:KEPT_SESSIONS`, used in `hooks/register.tsx:save`).
- `$.state`: "Named values held by the host for the session, each with a version: plain data that survives a hot reload of the plugin's code." A `get` in `ui.render` subscribes that render. "Any plugin reads any value; its owner alone writes it. Persist through `$.store`." `set` is refused during render and takes `ifVersion`. `plugin` and `key` must be literals. [T: `state`]

### `$.process`, `$.fs`, `$.http`, `$.session`

- `$.process.run` "uses no shell. It resolves to `{ exitCode, stdout, stderr }` whatever the exit code. It rejects if the program can't start or is still running at the timeout". 30 s default, 10 min max. Each stream capped at 4,194,304 bytes with `isStdoutTruncated`. [A; R#limits; T] The types mark it "CLI only". Whether it runs in a desktop Code-mode session is unknown.
- `$.process.spawn` is an async generator: leaving the loop, `return()`, `next.signal` or unload kills the child, "and nothing else does". [T]
- `$.fs.list` "returns one directory's entries as `{ name, kind, size, isLink }` and isn't recursive". [A]
- `$.session.usage()` is `{ startedAt, context, rateLimits, cost }`; `context` has `tokens`, `window`, `percent`; `rateLimits` is a list of `{ kind, percentUsed, resetsAt }`. `$.session.messages()` returns `{ role, text, toolUses }`, newest 4,096. [R#mods-api-methods; A]
- `$.session.authorize()`: "Null with no first-party credential (a 3P provider, a gateway, no login)." [T]
- `$.session.append`: "A user-role row the person does not see as typed or a notice, of text blocks alone in this release". [T]
- `$.session.send({ to, text })` makes "the same delivery the SendMessage tool makes". `session.receive` sees `origin.kind` peer, peer-send-message, task-notification or scheduled-trigger; `{ consumed }` hides the message from Claude. "A message that's held for your approval reaches the hook first". "The sender's name on a received message is whatever the sender wrote, so don't base a decision on it." [A#send-and-receive-messages-between-sessions]
- Timers: `$.clock.every(ms, fn)` and `after` return `cancel()`. "If the callback throws, the error goes to the debug log and the timer runs again". "Timers stop when the module reloads." [A#stop-background-work]

## Limits

From [R#limits] unless marked. "Claude Code skips a hook that exceeds a time limit."

| Limit | Value |
|---|---|
| A hook's own time per event | 10 s, not counting time in `next` or a `$` call other than `$.clock.sleep`. 50 ms for `prompt.edit`. |
| `.catch` handler | 1 s |
| All `session.end` hooks together | 1.5 s by default (`CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`) |
| `$.process.run` | 30 s default, 10 min max; 4 MiB per stream [T] |
| `$.model.complete` `maxTokens` | 1024 default, up to 64,000 or the model's limit |
| `$.fs.read`, `$.fs.write` | 4 MiB per file |
| `drop` or `deny` reason | 4,096 characters, end cut (2.1.292+) |
| Text in one tree | First 100,000 characters drawn |
| `Code` language or path, `Select` value, `Client` module | 10,000 characters; longer makes Claude Code draw its own site |
| `Link` `href` | 2,048 characters; longer "keeps the whole tree from drawing" |
| `Svg` `source` | 131,072 characters |
| `$.store` | 4 MiB of JSON in total |
| `$.session.messages()` | Newest 4,096 entries |
| Redraws | 10 a second; 30 in the terminal for the visible pane, expanded band and hint line |
| `$.ui.toast` | 4 s unless `timeoutMs` (1 to 60,000) |
| Pane opened unasked | Placed from 144 columns, 110 after the user opened it once |
| Command, tool, subagent type, pane names | Letters, digits, `_`, `-`, up to 64 characters |
| One `claude plugin test` test | 5 s unless `timeoutMs` |
| Prompt `context` | 100,000 characters (200,000 together), then head and path [T] |
