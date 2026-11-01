# Data and presses

Part of [the Herdr look plan](../herdr-look.md).

Status: proposed.

The Herdr look is drawn by a program that is not the host. Every other look runs inside its host, but the Herdr mod runs in Herdr's process. So the session state crosses a process boundary in one direction, and presses cross it in the other.

## The data path

Each host publishes its session to a file. The mod reads that file and builds the view itself.

- **Where.** `<app home>/inbox/sessions/<session id>.json`. The app home is `$HERDR_APP_HOME`, or `~/.config/herdr-app` when that is unset. An app terminal inherits `HERDR_APP_HOME` when the app was started with it, as the spike's was. One folder holds both directions, because a mod may read anywhere in the home folder but may write only under the app home.
- **When.** After every saved change to the session, at session start, and at session end. A host publishes only when `HC_TERMINAL_ID` is set, which means it runs in a Herdr app terminal. At session end the host deletes its file.
- **What.** A versioned envelope around the shared `Session` from `types/index.d.ts`:

  ```json
  { "format": 1, "host": "claude-code", "agent": "Claude", "sessionId": "…", "terminal": "t1", "writtenAt": 0, "session": {} }
  ```

  `session` holds only the shared fields. Each host drops its own fields, such as Codex's `herdrReport` or the mod's `revision`. `agent` is the name the shared texts use, as in "Tell Claude".
- **How.** Write to a temporary file in the same folder, then rename it over the old one, so the mod never reads half a file. Codex and omp rename with Node's `fs.rename`. Claude Code's `$.fs` has no rename or delete, so the mod renames with `$.process.run(['mv', …])`. The spike wrote with `$.fs.write` straight to the file and did not check for torn reads. Its mod retried a parse that failed.
- **Size.** Herdr's `readTextFile` reads at most 1 MiB. The demo session is 7.7 KB. The mod's saved sessions are already pruned by `pruned()`. A host that would publish more than 1 MiB publishes the session without closed items beyond those the view shows, and the look says when it does.

### Who computes the view

The mod calls `sessionView(session, Date.now(), SETTLED_MS, canCatchUp, holds)` at each draw, from the published session. A host could publish a finished view instead, but a view is stale the moment it is written: ages, Undo countdowns, settle windows and running marks all depend on the time of the draw. Publishing the session keeps them live without a host waking up.

The mod learns of a write from `watchFolder`, which reported each write about 170 ms after it in the spike. That was the largest fixed part of a press's delay. A host that already sets labels could also set `inbox.revision` after each write: a label change re-renders the mod with no file watch in between, and the mod then reads the file. The probe saw one render per label change but did not time it. Whether that is worth one `hc label` call per write is for the build to measure.

The mod schedules its own redraws:

- At the end of each settle window and Undo countdown, as the spike did with `cx.timer.after`.
- At the next minute boundary of the youngest age it shows.
- Never for running marks, which draw with GPUI's native `.frames()`.

### Versions

The mod bundles the shared modules from its own build, and each host bundles them from its own. They can differ by a release.

- The mod runs the published session through `upgradeSession`, the shared function that reads an older build's state. An older host's session then reads as current.
- A `format` the mod does not know is from a newer host. The look then says the inbox's Herdr mod needs an update, and draws nothing else.
- A field a newer host adds within the same `format` is ignored, as the hosts already ignore unknown saved fields.

## The press path

A press is the person acting on a row: Done, Dismiss, an answer, a reply and the rest. The Herdr mod writes each press to a file, and the host applies it.

**The press file.** `<app home>/inbox/presses/<session id>/<press id>.json`, written with `writeTextFile(path, text, null)`. The spike confirmed that this call creates the folders, writes atomically and refuses an existing name. It holds:

```json
{ "format": 1, "id": "…", "pressedAt": 0, "press": { "action": "done", "id": "q3" }, "holds": { "replies": {}, "discarded": {}, "shownSince": 0 } }
```

**Holds travel with the press.** `press()` decides whether a press is stale from the rows the look drew, which the look's holds describe. `shownSince` is when the look showed the tab. Without it, a closed row leaves the list at once instead of settling in place with Undo. The spike's first working click ran without holds, and the row vanished mid-fade.

**The host applies it** with `hooks/session-host.ts:press()`, the function every other look's press goes through. Then it deletes the file, and its next publish carries the result. Each host does the follow-ups its own look's press does, outside the look: the mod's `runPress` schedules `wakeForDone` after a Done, for example. That part of `runPress` moves into a function both the terminal pane and the Herdr path call. A press file the host cannot read, or whose `format` it does not know, is deleted and logged.

**The look waits for the result.** A pressed button draws as out at once. It stays out until a publish shows the press's result, either the row's new state or the press's last action. After 5 seconds with no result, the look reads the session file again. After 15 seconds the row reads "Not applied: Claude's inbox did not answer". The spike shows why. Of 59 driven presses, the host applied one whose result the mod never logged as drawn.

### Claude Code

The mod cannot watch a folder, so a **wake label** tells it a press is waiting. After writing a press file, the Herdr mod sets a label on the session's terminal: `hc label <terminal> inbox.press=<press id>`. The Claude Code mod keeps one `hc events` process running with `$.process.spawn`, and reads the press folder when a label event names its terminal. Nothing runs while no one presses. A slow poll, every 10 seconds, catches a missed event. The mod listens and polls only while `HC_TERMINAL_ID` is set.

The spike checked the signal from a shell: `hc events` reported each label change 11–17 ms after the `hc label` call started. Running `hc events` from the mod with `$.process.spawn` is the step still to check.

The other way was a poll alone, which the spike ran: `$.clock.every(P)` lists the press folder with `$.fs.list`. A tick costs about 1 ms of CPU, or 0.1% of a core at P = 1000 ms, and a press waits P/2 on average. [The spike](spike.md) gives the numbers. The wake label answers about 0.5 s sooner at P = 1000 ms and costs nothing at idle.

Delivery is unchanged. The mod's `deliver` already sends a message with a sent record and holds the press as Queued until it runs.

### Codex

The Codex host runs a long-lived MCP server per Codex CLI session, and that server already applies presses: `onPress` in `codex/src/server.ts` calls `press()` under the session's file lock.

- The server needs the terminal. `codex/plugin/.mcp.json` passes the server only the variables in `env_vars`, so `HC_TERMINAL_ID`, `HC_TERMINAL_SOCKET` and `HERDR_APP_HOME` join that list.
- The server watches its press folder with Node's `fs.watch` and passes each press to `onPress`. No poll.
- Hooks, the detached update and the server all write state. Each write goes through the `OnWrite` that `codex/src/host.ts:herdrOnWrite` builds today, which publishes the envelope too.
- Codex delivers a message with `codex queue --thread <id>`, as the tab does. Whether `codex queue` reaches a CLI session in a terminal is not checked. See [the open questions](shipping-and-testing.md#open-questions).
- In the Codex app, outside Herdr, nothing changes: no variable is set, so nothing publishes.

### omp

omp runs the host in its own long-lived process. It watches the press folder with `fs.watch` and applies each press through the same path its panel's keys use, with `press()` and omp's `SessionHost`. Its in-process lock already orders the writes, and each write publishes.

## Presses the mod runs itself

Some presses only open or copy something, with no message to the agent: Open a link or a file, Copy text. The mod runs these itself, so they act at once and on the person's screen:

- **Open a link:** `exec('open', [url])` on macOS, `xdg-open` on Linux.
- **Open a file:** in the person's editor, as the other looks do, or in a Herdr pane beside the agent. Herdr ships a `files` mod, but whether it opens one file from props is not checked.
- **Copy:** GPUI's clipboard write.

The host still records the press's last action, such as "✓ Opened plan.md", so it shows after a reload and in every look. The press file carries the mod's result, and the host's `perform` returns that result instead of opening the link a second time.

## Presses that send a message

Answer, Reply, Explain, Discuss, Hand off and the PR fixes send the agent a message. They travel as press files like any other press, and the host delivers the message with its own `deliver`, which saves a sent record. The Herdr look never types into the terminal with `hc send`. That arrives as typed input, so the host would record it as the person's own message, with no sent record and no Queued state.

A reply's draft stays in the look until the person sends it. The press carries the words, as the `type` press does in every look.
