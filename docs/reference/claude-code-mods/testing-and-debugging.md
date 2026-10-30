# Testing and debugging

Part of [Claude Code mods](../claude-code-mods.md).

## Testing with `claude plugin test`

- Tests run "with no session, sign-in, or network". Each test file imports `claude-code/testing`. [C#test-the-mod; TT]
- Test files end in `.test.ts` or `.test.tsx` [R#files]. The test page says "save it anywhere in the plugin directory". [TT#write-a-test] Live: files under `.claude/worktrees/` did not run, so hidden folders are skipped.
- Live, 2026-10-08: the repo's 5 test files ran, 174 passed.
- Exit status 1 on failure "so it works in CI". A file with no `test()` fails with `declares no test(): nothing ran`. One test times out after 5 s unless it sets `timeoutMs`. [TT#write-a-test; R#limits]
- Live: in an empty folder it prints "no hooks module to load" and exits 1, although the troubleshoot page reads that message as "Mods can load". A script must parse the text.
- The test's `$` "acts as Claude Code. It isn't the mods API that a hook receives". Each method fires the event of that name: `$.tool.call`, `$.command.run`, `$.prompt.submit`, `$.session.start`, `$.turn.complete`, `$.classic.*`. "A test can't fire a mods API call such as `ui.close` directly." [TT#stub-what-claude-code-would-answer]
- Stubs: `on('<call name without $.>', …)` returns `{ value }` or `{ deny }`. A bare value gives "`returned neither { value } nor { deny }`". A missing stub gives "`no implementation for <name>`". Errors show under `the engine reported:`. "A stub that throws is skipped instead". [TT]
- Kit rules: [TT#follow-the-test-kits-rules]
  - "Register every stub before the test's first call on `$`." Otherwise "`on(\"ui.render\") after the test first called $`".
  - "`session.start` doesn't run by itself." Fire it with `$.session.start({ surface: 'terminal', isInteractive: true, cwd })`, with a `session.start` stub that answers `next(e)` and a stub for each call the hook makes.
  - If a call's stub is missing, "the kit skips your hook, so nothing after the call in the hook runs. The test doesn't fail at that point." It shows only if a later check fails. Assert the outcome after every model-driven path.
  - "A hook that returns `next(e)` needs a stub to answer."
- The kit answers `$.ui.invalidate`, `$.state` and `$.session.append` itself. Mocks: `mock.clock(on, {now})` (`advance`, `set`, `now`, `settle`, `sleep`), `mock.store(on, entries)` ("It returns nothing"), `mock.env(on, vars)`, `mock.session(on).appended()` (2.1.293+). [TT]
- Stub shapes: `$.model.complete` → `{ value: { isAnswered: true, text, usage } }`; `$.ui.open` → `{ value: { isPlaced: true } }`; `$.process.run` → `{ value: { exitCode, stdout, stderr } }`; `$.ui.ask` is stubbed as a `tool.call` to `AskUserQuestion`. [TT]
- Drawing tests: `$.ui.mount({ plugin, component, requestId, viewport, props, surface })` returns `press({key})`, `input({key,text,kind?})`, `select`, `find(...)`, `unmount()`. "To cover several apps in one test, set `surface` to the app to draw for." "A drawing test checks the tree your hook returns and whether it's valid for that app. It doesn't check how the app paints it". [TT#test-a-drawing]
- Mount surfaces in the types: "terminal, desktop, vscode or mobile: never assumed". `input` and `select` exist on every surface except mobile. `key` and `pointer` exist only where `Client` does. [T: testing types]
- The types have more than the docs list: `describe`, `findAll`, `drawn`, `key`, `pointer`, `post`, `advance`, `resize`, `test(name, { options })` for `userConfig`, and about 15 more matchers. [T: testing types]
- After `/clear`: fire `$.classic.SessionStart({ source: 'clear' })`, not `session.start`. [TT#test-a-drawing-after-clear]
- Policy mods: `tier('prepend'|'append'|'builtin')` and `test(name, { plugins: [...] }, body)`. A refusal throws `<mod>: refused by <policy-mod>: <reason>`. [TT#test-a-mod-that-judges-other-mods]
- Repo: most band tests mount only `terminal`. `tests/hooks.test.ts` tests "the desktop app turns the mod on when it attaches before the start" and "… after the start" fire a desktop attach in both orders and mount the band with `surface: 'desktop'`. `world()` stubs `session.attach`.

## Troubleshooting and the debug log

- "When a mod's module or one of its hooks fails, Claude Code skips it and the session continues, so a broken mod can look like one that does nothing." [TS]
- Where a failure line goes: [TS#find-out-why-a-mod-does-nothing]

| Session | Where |
|---|---|
| Hot-reloads a plugin folder (`--plugin-dir`, or Claude-written mods enabled) | "a dim line in the transcript" |
| "Any other interactive session, such as one that runs a mod you installed from a marketplace" | "the debug log only" |
| `claude -p` with `--plugin-dir`, text output | stderr. A refusal by another mod goes to the debug log only. |
| `-p` with json or stream-json | Debug log [skill] |
| Desktop-hosted session with the watch variable | `ui_log` messages to the host, plus the debug log [skill]. Whether the app shows them is unknown. |

- Debug log: `claude --debug` or `--debug-file <path>`. A loaded mod logs `hooks module first-mod@inline loaded (worker, environment 2, tier user); events: …`. [TS#read-the-debug-log]
- `$.ui.log('msg', { to: 'debug' })` writes to the debug log. Without the second argument it writes a dim transcript line. [TS]
- `hook skipped`: the hook "threw, exceeded its time limit, or returned a result of the wrong shape". "The line appears once for each event and kind of failure until the mod reloads." "The debug log has a line for every occurrence." [TS#hook-skipped]
- Check whether mods can load: run `claude plugin test` in a folder with no mod. [TS#check-whether-mods-can-load]

| Message | Meaning |
|---|---|
| `no hooks module to load` | Mods can load (exits 1 anyway, live) |
| `hooks modules are turned off here` | `disableAllHooks` or org policy |
| `…the rollout switch served off` | "Anthropic has turned installed mods off remotely" |
| `…saved off by an earlier session` | Stale saved value. "Start `claude` once to refresh it." |

- It does not report `allowManagedModsOnly`. [TS#check-whether-mods-can-load]
- Refusal lines read `hooks module <name> not loaded: <reason>`. Reasons: `hooks modules are turned off for installed plugins in this process: the rollout switch served off` (or `saved off by an earlier session`); `disableAllHooks in managed settings`; `only managed plugins and built-in plugins run`; `installed plugins that are not managed load no hooks module in this mode (--bare)`; `another plugin of that name loads first`. [TS#refusal-messages]
- `hooks module did not load:` plus a reason means, for example, top-level code threw. [TS#hooks-module-did-not-load]
- Guard messages: `mods are limited to your organization's by policy (allowManagedModsOnly)`; `tried to lift a deny rule in your settings` (once per mod per session); `the deny rules in your settings could not be checked for this call, so it is refused`. [TS#messages-from-the-built-in-guard]
- Drawing failures: an invalid tree gives `ui.render (Pane) refused: … the engine drew its own`; "the engine drew its own" means the site shows Claude Code's usual content. `threw while drawn` falls back the same way. [TS#a-uirender-line-says-threw-while-drawn] "A drawing works in the terminal and not in the Desktop app": "The site or element isn't available there". [TS#a-drawing-works-in-the-terminal-and-not-in-the-desktop-app]
- `$.ui.open` places no pane when the call didn't come from a user action and the terminal is narrow. Check `isPlaced`. [TS#uiopen-runs-and-no-pane-appears] `focus: false` on `$.ui.open` can make a command hook be skipped. [TS#no-commandrun-hook-answered-it]
- Toasts (documented for the terminal only): a debug line per call, as in `$.ui.toast (first-mod): build finished`; refused ones log why. Fullscreen draws at most 3. In the classic renderer a toast is one line under the prompt that starts with the mod's name. Debug endings: `gave way, cut short`, `gave way, unseen`, `left the stack, never drawn`. [TS#a-toast-doesnt-appear]
- Hotkeys need focus: ctrl+x then tab, or a click. Open the pane with `focus: true` from a command. [TS#hotkeys-do-nothing]
- Module variables reset on each reload. "`/clear`, `/resume`, or `/branch`" reset `$.state` to defaults "and `session.start` doesn't fire again". Reload in `classic.SessionStart`. [TS#a-value-resets-when-the-module-reloads; TS#a-value-resets-after-clear-resume-or-branch]
- Auto mode: a hook that changes a tool call's input after the classifier reviewed it gets the call denied: "a hook changed this call's input after the model wrote it". The hook can be a mod's `tool.call` or `turn.step` hook, or a `PreToolUse` settings hook. "The message doesn't say which." It "tells Claude to issue the call once more as recorded." [TS#a-hook-changed-this-calls-input-after-the-model-wrote-it]
- Command replies: "Claude Code puts the plugin's name in front of the command's text". [C] So `/inbox` replies read `inbox: …`.

### The hooks worker

- "Installed mods share one worker thread." A mod traced to a crash is unloaded: "`first-mod was unloaded: it crashed the hooks worker`". One cause is "a loop that never awaits". [TS#it-crashed-the-hooks-worker]
- After 3 crashes not traced to one mod, Claude Code "unloaded every mod that isn't built in, including mods your organization installs". The line "`mods that run in the hooks worker are off for this session: it crashed 3 times`" "reaches the transcript in every interactive session". Fix: `/reload-plugins` or a new session. [TS#mods-that-run-in-the-hooks-worker-are-off-for-this-session; A]
- A fresh copy after a worker replacement re-runs `session.start`. Since 2.1.292, a `$.prompt.submit`, `$.command.run` or `$.agent.spawn` already made "resolved with the result of its first run instead of running again". [TS#its-sessionstart-ran-again-in-a-fresh-copy] The skill limits this: "a call made after the hook returned (a later timer, a continuation) … is made again", and "its timers and state gone".
- A hook with no `.catch` that fails before `next`: "Claude Code skips it, and the next handler runs in its place" (fails open). After `next` resolved: "that result stands, and nothing runs a second time". [E#handle-a-hook-that-fails]
- `on(...).catch(handler)`: `next.error.kind` is `throw`, `timeout` or `re-entry` (2.1.292+); `next.called` says whether `next` ran. The handler has 1 s. "If the handler itself throws or times out, Claude Code skips the hook as if it had no handler". [R#the-hook-function; E]
- Inference for the inbox: setup in `session.start` (tools, command, timers, store load) must be safe to run again after a worker respawn and after `session.attach`. Recovery state belongs in `$.state` or `$.store`, not module variables.

### Version gates seen in these pages

| Behavior | Version | Source |
|---|---|---|
| `mock.session` | 2.1.293+ | [TT#stub-what-claude-code-would-answer] |
| Fresh copy de-duplicates `prompt.submit`, `command.run`, `agent.spawn` | 2.1.292+ | [TS#its-sessionstart-ran-again-in-a-fresh-copy] |
| `next.error` kind `re-entry` and `cause` | 2.1.292+ | [R#the-hook-function] |
| 4,096-character cut on a drop or deny reason (earlier: the hook fails) | 2.1.292+ | [R#limits] |
| A toast within 2 s of the last is no longer dropped | 2.1.290+ | [TS#a-toast-doesnt-appear] |
| A `threw while drawn` in a transcript row no longer ends the session | 2.1.289+ | [TS#a-uirender-line-says-threw-while-drawn] |
| A Client failure with no message no longer shows "Error" | 2.1.289+ | [TS#the-module-failed-without-a-message] |

Inference: a desktop app still on engine 2.1.289 lacks the first four. Declare the oldest supported engine, or check `$.session.version()`.

### Rollout switch and third-party providers

- Live, from `strings` of the 2.1.295 binary: the rollout flag is `tengu_plugin_hooks_modules`, read from GrowthBook (Anthropic's feature-flag service). Its value can come "from a local override", "from GrowthBook (this session's payload)", "from GrowthBook (the disk cache of an earlier session)", "from the default (GrowthBook is off for this session: a third-party provider, or telemetry opted out)", or "from the default (a cold GrowthBook cache, no payload yet)". The default is unknown.
- Live: `DISABLE_TELEMETRY=1 claude plugin test` in an empty folder still printed "no hooks module to load". Not conclusive.
- Changelog 2.1.290: "Fixed mods staying off for people who reach Claude through a gateway (`ANTHROPIC_BASE_URL` with `ANTHROPIC_AUTH_TOKEN`) and have no Anthropic account". [CL#2-1-290] So before 2.1.290 mods stayed off for those users. Inference: that bug may be the binary's "default" path when GrowthBook is off. No doc says mods are off on Bedrock, Agent Platform or Foundry today.
