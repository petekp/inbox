# Live checks

Part of [The Claude desktop app](../claude-desktop-app.md).

## Live probe of a Code-mode session

On 2026-10-08, a throwaway mod logged one new local Code-mode session in the app (version 2.31226.0). The mod loaded through `CLAUDE_CODE_PLUGIN_DIRS`, ahead of the inbox. Times are seconds from the first event.

| Time | Event | What it showed |
|---|---|---|
| 0.00 | `classic.SessionStart` | `source: 'startup'`. `e.session_id` and `$.session.id()` match. It fires before `session.start`, as it does in the terminal. |
| 0.02 | `session.start` | `isInteractive: false`, `surface: null`, `$.session.surfaces()` empty. |
| 0.14 | `session.attach` | `{ surface: 'desktop', clientId: 'desktop-2', viewport: { columns: 106, rows: 48, isFullscreen: true } }`. `surfaces()` is now `['desktop']`. |
| 0.17 | `prompt.submit` | The first typed prompt, `origin: { kind: 'composer' }`. The mod's tool was not registered yet. |
| 0.19 | `$.tool.register` resolves | 20 ms after the first prompt. |
| 0.26 | `turn.start` | Its input has `text` and `turnId`. |
| 3.65 | `tool.call` | Claude called the mod's tool in that first turn. |

What follows from it:

- **Turning on in this probe.** Inbox activated at `session.attach`. The first prompt arrived before its setup finished. Current Inbox registers its command during `session.start` and waits for initialization when the command runs.
- **Tools on turn one.** A tool registered at attach was still offered on the first turn, because the turn starts after registration finishes. The margin was 70 ms. This is one run, not a guarantee.
- **The person's words.** A typed prompt is `composer`, the same as in the terminal.
- **`$.process.run`** works. `git --version` and `gh auth status` succeeded, and `gh` used the keychain sign-in. The session's `PATH` matched the login shell's.
- **`$.ui.copy`** returned `{ isCopied: true }` with `surface: 'desktop'`.
- **`$.prompt.submit({ text, asUser: true })`** started a turn at once, with `origin: { kind: 'plugin', name, asUser: true }`.
- **The pane** opened with `placement: 'dock'` and `isFocused: true`. Its `bodyColumns` changed from 36 to 69 as the person widened it, and the viewport narrowed from 106 to 70 columns to match. `bodyRows` was 42.
- **The band** had `maxRows: 12`. The terminal at 49 rows gave 19. Its `bodyColumns` shrank as the pane widened.
- **Button presses** carry `surface: 'desktop'`. Native buttons drew and clicks worked.
- **Hotkeys do nothing.** With the pane focused, pressing a `Button`'s `hotkey` (`g`, `j`, `k`) logged no press. Only clicks reached the mod.
- **Not covered:** `keybindings.json`, `/clear` and `/resume` in the app, `Link` targets and `session.detach`.

## Live checks on desktop 3.1623.0

On 2026-10-21, inbox 0.2.10 ran in local Code-mode sessions of Claude desktop 3.1623.0, in a test VM. The app held engine copies 2.1.299 and 2.1.304, and the sessions ran 2.1.304. Claude ran on Haiku 5.5.

- **Clicks.** A tab, a question's option, Dismiss, a finding's Explain and Undo each took the first click. One click at the lower edge of Undo did nothing. It was not repeated, so whether the hit area is short there is open.
- **Typed answers.** An answer typed in the message box closed the open question with the typed words as its answer. So the inbox still counts a typed prompt as the person's words. The transcript row of that prompt has `origin` `{"kind":"human"}`, and a press's row has `{"kind":"plugin","name":"inbox","asUser":true}`.
- **Layout.** The docked inbox pane takes the right-hand column, where the app's session cards (Environment, Context, Connectors) sit. The cards can open at the same time, as a floating panel beside the pane. A Plan pane stacks under the inbox pane.
- **Band.** It draws while a permission request shows in the conversation. It draws nothing while the "Claude proposed a plan" card is at the end of the conversation, and comes back once the plan is rejected.
- **A press during a running turn.** The row read "Delivery unconfirmed" at once, and the transcript got a `queue-operation` enqueue row that was never dequeued. Quitting the app before the turn ended lost the message: on reopening, the app sent its own "The app was quit while you were working" message, and did not bring the press's message back as a held message. Pressing again while Claude was idle delivered the message once, but the row then kept reading "Queued" ([#22](https://github.com/petekp/inbox/issues/22)).
- **Subagents.** The app ran a background subagent and a fork subagent in the background. The saved `turnsStarted` rose once per main reply, and each main reply ran one inbox update. An item a subagent recorded landed in the session's inbox. Stop while a subagent still ran left nothing reading "working" in the pane or the band.
- **Nested sessions.** A task Claude started in a nested session turned the inbox on there, with its own band and its own saved session. Its question stayed out of the parent session's inbox. Each nested session takes one of the 40 sessions the store keeps (`KEPT_SESSIONS`).
- **Not seen:** a Copy action, and the sidebar.

## Live checks on desktop 3.6556.2

Checked on 2026-10-23 in the `inbox-ui` VM, twice. The VM's Claude Code loads
the inbox from `~/inbox`, the folder its directory marketplace points at, and
not from the copy under `~/.claude/plugins/cache`. The first pass copied the
build into the cache copy, so it ran the older `~/inbox` build labelled 0.2.9.
The second pass installed a build with main's drawing code in `~/inbox`; its
footer read v0.2.10. The results below are from the second pass, and say where
the first differed. The app was `3.6556.2`. The 3.6556.1 release notes say
"Bundled Claude Code version: 2.1.308.", and the sessions ran engine 2.1.308,
with Haiku 5.5 in Auto permission mode. The terminal `claude` in the VM is
2.1.309 and was not used.

- **Pane width.** The Claude Code 2.1.305 changelog says: "Changed a mod's
  docked pane to stay within 45% of the terminal's width, including a width
  kept from a wider terminal". It names the terminal. In the desktop app the
  pane opened at 41% of the window (the width the app remembered; 37% on the
  first pass), dragged to 90% (87%), and to 28% at its narrowest. At 90% the
  conversation column shrank to a sliver and its band and composer were cut
  off. The inbox's rows and buttons read well at all widths, and nothing
  clipped.
- **Band, presses, copy, end.** The AbovePrompt band drew with "Nothing
  needed", the demo counts and real counts, and during a running turn. Explain,
  Done and answer presses showed their result at once. A real Explain read
  "Explaining…" then "✓ Explained" and moved no button. A real Done sent its
  message with `origin` `{kind: 'plugin', name: 'inbox', asUser: true}`,
  enqueued and dequeued 1 to 2 ms apart, and Claude replied. `$.ui.copy` put the
  command on the VM's clipboard (`pbpaste`). `/clear` ended the engine process
  and the pane and band went with it; the saved session had no running turn, no
  pending update and no stop, and the app log showed no error.
- **Buttons move after a press.** On main's code a demo Explain adds "Sample
  entry: nothing was sent." under the title and moves the buttons down 30 pt,
  and they move back at about 5 s. A demo answer puts the note above the list
  and moves every row. A real Copy adds "✓ Copied … Run it in
  Terminal." and moves the buttons down 50 pt. That line was gone within 1 s in
  one session and stayed 7 s or more in another, on the same code. What decides
  it is not known. A demo Done scrolled the pane about 225 pt to bring the next
  open task into view.
- **`allowManagedPermissionRulesOnly`.** The 3.1623.4 notes say: "Changed
  plugins that the app loads to ask before using the tools they pre-approve
  when your organization's Claude Code managed settings, such as
  `managed-settings.json`, set `allowManagedPermissionRulesOnly`." The inbox
  pre-approves nothing in its manifest. With that key set in a managed file, the
  model's `record` and `close` calls completed with no permission prompt, a Done
  press sent its message as a prompt and the model replied, and Copy worked. The
  managed file seated the guard, and a "its … hook was skipped" notice reached
  the conversation and the model once: four of them (`classic.SessionStart`,
  `prompt.context`, `prompt.compose`, `classic.Stop`) on the first pass, one
  (`classic.SessionStart`) on the second. In the second pass's managed session
  the band did not draw after the first turn, which had recorded two items, nor
  after `/inbox` opened the pane. It drew once the next turn started. The cause
  is not known. The settings reference says the key makes managed settings the
  only source of permission rules and drops `--allowedTools`.
- Not checked: a permission dialog for an ordinary tool under that key (`echo`
  runs without one even in Manual mode); Talk and answer presses under it;
  Undo in time; a press while a turn runs; quitting the app with a session open;
  the light theme.

## A reopened session's first prompt

[#97](https://github.com/petekp/inbox/issues/97) reports it on app 3.6556.2 with engine 2.1.308. The person quit the app and reopened a saved Code session with `claude --desktop --resume <id>`. The first prompt went out without the inbox's tools, and the band was missing until that prompt.

- **What the model read.** The transcript's `deferred_tools_delta` for that prompt retracted `mcp__inbox__close` and `mcp__inbox__record` with cause `not_configured`, and the model was told the inbox server had disconnected. It replied that it could not record. The next prompt's delta restored both tools.
- **Cause.** The inbox turned on at `session.attach`, and its tools were not registered when Claude Code built the first prompt. Claude Code compares the tools a resumed transcript announced with the tools it holds, and retracts each missing one with cause `not_configured`. Claude Code waits for a `session.start` hook before the first prompt, so a tool registered there is offered on the first turn. It does not wait for a registration that starts at the attach.
- **Repro outside the app, 2026-10-28.** Engine 2.1.308 ran with the app's stream-json flags, `CLAUDE_CODE_ENTRYPOINT=claude-desktop` and a stand-in API. A resumed conversation whose first prompt came 2 s before `ui_attach` got the same retraction, and the next prompt restored the tools. The model's text for the first prompt read "do not call these tools", "MCP server removed from the configuration" and "The following MCP servers have disconnected", followed by `inbox`. With the inbox turning on in `session.start`, the first prompt kept both tools and the transcript had no retraction.
- **Live, 2026-10-28, app 4.29.0 with engine 2.1.309.** A test VM blocked `api.anthropic.com`, so no prompt reached a model, and a probe mod logged event times.
  - `claude --desktop --resume <id>` opened the session in the app with no engine running. The engine started at the first prompt. `session.start` read `isInteractive: false`, no surfaces, `CLAUDE_CODE_ENTRYPOINT=claude-desktop` and no `CLAUDE_CODE_CHILD_SESSION`. The attach came about 280 ms later, and the prompt 4 ms after the attach.
  - With the inbox turning on at the attach, that prompt's `deferred_tools_delta` removed `mcp__inbox__close` and `mcp__inbox__record`, and its `mcp_instructions_delta` removed the `inbox` server. With the inbox turning on at `session.start`, the first prompt kept both tools.
  - Opening a saved session from the app's search started its engine at once. The attach came about 250 ms after `session.start`, before any prompt, so both builds offered the tools on the first prompt.
  - In a new session, the attach came 3 ms before the first prompt, and the inbox's tools still reached that prompt's request.
