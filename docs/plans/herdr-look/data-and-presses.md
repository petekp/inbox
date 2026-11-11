# Data and presses

Part of [the Herdr look plan](../herdr-look.md).

Status: built in every host. The Herdr mod's side is building.

The Herdr look is drawn by a program that is not the host. Every other look runs inside its host, but the Herdr mod runs in Herdr's process. So the session state crosses a process boundary in one direction, and presses cross it in the other.

## The data path

Each host publishes its session to a file. The mod reads that file and builds the view itself.

- **Where.** `<app home>/inbox/sessions/<session id>.json`. The app home is `$HERDR_APP_HOME`, or `~/.config/herdr-app` when that is unset. A host publishes nothing when the app home is not an absolute path, since the mod's file calls and its `mv` resolve a relative path against different folders. An app terminal inherits `HERDR_APP_HOME` when the app was started with it, as the spike's was. One folder holds both directions, because a mod may read anywhere in the home folder but may write only under the app home.
- **When.** After every saved change to the session, at session start, and at session end. A host publishes only when `HC_TERMINAL_ID` is set, which means it runs in a Herdr app terminal. At session end the host deletes its file and the session's press folder, so no press for it waits. Claude Code deletes it at `session.end`, and omp at shutdown. When omp switches to another session, it deletes the old session's file before it publishes the new one. Codex has no hook for a session's end, so its file stays. Codex publishes from its hooks, the update a hook starts and its MCP server, so a record or close during a turn reaches the file at once.
- **What.** A versioned envelope around the shared `Session` from `types/index.d.ts`:

  ```json
  { "format": 1, "host": "claude-code", "agent": "Claude", "sessionId": "…", "terminal": "t1", "writtenAt": 0, "session": {} }
  ```

  `session` holds only the shared fields. Each host drops its own fields, such as Codex's `herdrReport` or the mod's `revision`. `agent` is the name the shared texts use, as in "Tell Claude". After the host applies a press from the look, the envelope also carries `"lastPress": { "id": "…", "outcome": "applied" }`, where `outcome` is `stale` when `press()` found the row already changed. It comes from the session's saved `lastHerdrPress`. A host that knows its session's folder sets `"projectFolder": "/…"`, the absolute path it opens a relative path against: Claude Code and omp from the session's `place`, Codex from its `root`. The envelope leaves it out when it is not an absolute path, and the look then sends an open to the host. `hooks/herdr.ts` also exports the paths `publishedSessionPath` and `pressFolder`.
- **How.** Write to a temporary file in the same folder, then rename it over the old one, so the mod never reads half a file. The temporary file is named `<session id>.json.<writtenAt>-<random>.tmp`, so it never ends in `.json`, and the mod skips it when it lists the folder. A write or rename that fails removes the temporary file. Codex and omp rename with Node's `fs.rename`. Claude Code's `$.fs` has no rename or delete, so the mod renames with `$.process.run(['mv', …])`. The spike wrote with `$.fs.write` straight to the file and did not check for torn reads. Its mod retried a parse that failed.
- **Size.** Herdr's `readTextFile` reads at most 1 MiB. The demo session is 7.7 KB. The mod's saved sessions are already pruned by `pruned()`. A host that would publish more than 1 MiB publishes the session without the closed items the view does not show, and sets `trimmed: true` in the envelope so the look can say so. `hooks/herdr-app.ts:publishedText` does this for every host. A session still over 1 MiB without them, which only open items can cause, is published whole, and the host logs it.

### Who computes the view

The mod calls `sessionView(session, Date.now(), SETTLED_MS, holds)` at each draw, from the published session. A host could publish a finished view instead, but a view is stale the moment it is written: ages, Undo countdowns, settle windows and running marks all depend on the time of the draw. Publishing the session keeps them live without a host waking up.

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

**Holds travel with the press.** `press()` decides whether a press is stale from the rows the look drew, which the look's holds describe. `shownSince` is when the look showed the tab. The look does not report the person's use of its list, so the host reads its holds with `listInput: null`. Without it, a closed row leaves the list at once instead of settling in place with Undo. The spike's first working click ran without holds, and the row vanished mid-fade.

**The host applies it** with `hooks/session-host.ts:press()`, the function every other look's press goes through. Then it deletes the file, and its next publish carries the result. Each host does the follow-ups its own look's press does, outside the look: the mod's `runPress` schedules `wakeForDone` after a Done, for example. That part of `runPress` moves into a function both the terminal pane and the Herdr path call. A press file the host cannot read, or whose `format` it does not know, is deleted and logged, with the file's text clipped to 100 characters. Codex and omp read only a regular file of at most 64 KiB, so a pipe named `x.json` cannot block the drain.

**One process applies each press.** Two processes can run one session, as when a Claude Code session is resumed in a second terminal. A host first checks that the session's published file names its own host and terminal. It then takes each press file by renaming it to `<name>.<random>.taken`, a name only it uses and no list keeps, and reads it from there. A rename is atomic, so when two processes try, one fails and skips the file. A press the host does not take goes back under its own name. `hooks/herdr-app.ts:pressDrainer` does this for every host. A host that dies between taking a file and applying it leaves the `.taken` file, and the look reads "Not confirmed". The press folder goes when the session ends in Claude Code and omp. Codex leaves it.

**The look waits for the result.** A pressed button draws as out at once, with every other press button on its row. The look sends no second press on a row while one is out. It says why on the row instead, and keeps a reply's text. The row stays out until a publish shows the press's result: the row's new state, the press's last action, or `lastPress` naming the press. A stale press changes no row, so only `lastPress` shows it, and the look can say the row had already changed. After 5 seconds with no result, the look reads the session file again. A press a host took, whose result never came, reads "Not confirmed" once `lastPress` names a later press, or 15 seconds after the file was written. A press still in its folder after 15 seconds, the look takes back by renaming it to a name no host lists, then deleting it, so it cannot apply later. Only then does the row read "Not applied: Claude's inbox did not answer". When the rename fails, a host took the file, and the press waits as taken. The spike shows why the look gives up at all. Of 59 driven presses, the host applied one whose result the mod never logged as drawn.

### Claude Code

The mod cannot watch a folder, so a **wake label** tells it a press is waiting. After writing a press file, the Herdr mod sets a label on the session's terminal: `hc label <terminal> inbox.press=<press id>`. The Claude Code mod keeps one `hc events` process running with `$.process.spawn`, and reads the press folder when a label event names its terminal. An `hc` that fails to start, or ends before it prints, as one without `events` does, gives way to `~/.local/bin/hc`. Nothing runs while no one presses. A slow poll, every 10 seconds, catches a missed event. The mod listens and polls only while `HC_TERMINAL_ID` is set.

The spike checked the signal from a shell: `hc events` reported each label change 11–17 ms after the `hc label` call started. Running `hc events` from the mod with `$.process.spawn` is the step still to check.

The other way was a poll alone, which the spike ran: `$.clock.every(P)` lists the press folder with `$.fs.list`. A tick costs about 1 ms of CPU, or 0.1% of a core at P = 1000 ms, and a press waits P/2 on average. [The spike](spike.md) gives the numbers. The wake label answers about 0.5 s sooner at P = 1000 ms and costs nothing at idle.

Delivery is unchanged. The mod's `deliver` already sends a message with a sent record and holds the press as Queued until it runs.

### Codex

The Codex host runs a long-lived MCP server per Codex CLI session, and that server already applies presses: `onPress` in `codex/src/server.ts` calls `press()` under the session's file lock.

- The server needs the terminal. `codex/plugin/.mcp.json` passes the server only the variables in `env_vars`, so `HC_TERMINAL_ID`, `HC_TERMINAL_SOCKET` and `HERDR_APP_HOME` join that list.
- The server cannot tell which session it serves until a tool call names one. It watches the whole presses folder with Node's `fs.watch`, and applies the presses for each session whose published file names Codex and this terminal. It also reads the folder every 10 seconds, in case the watcher missed a press. `codex/src/server-herdr.ts:followCodexPresses` does this.
- Hooks, the detached update and the server all write state. Each write goes through the `OnWrite` that `codex/src/host.ts:herdrOnWrite` builds today, which publishes the envelope too.
- Codex delivers a message with `codex queue --thread <id>`, as the tab does. Whether `codex queue` reaches a CLI session in a terminal is not checked. See [the open questions](shipping-and-testing.md#open-questions).
- In the Codex app, outside Herdr, nothing changes: no variable is set, so nothing publishes.

### omp

omp runs the host in its own long-lived process. It watches the shown session's press folder with `fs.watch`, reads it every 10 seconds, and applies each press through the same path its panel's keys use, with `press()` and omp's `SessionHost`. Its in-process lock already orders the writes, and each write publishes.

## Presses the mod runs itself

Some presses only open or copy something, with no message to the agent: Open a link or a file, Copy text. The mod runs these itself, so they act at once and on the person's screen:

- **Open a link:** `exec('open', [url])` on macOS, `xdg-open` on Linux.
- **Open a file:** in the person's editor, as the other looks do, or in a Herdr pane beside the agent. Herdr ships a `files` mod, but whether it opens one file from props is not checked.
- **Copy:** GPUI's clipboard write.

The host still records the press's last action, such as "✓ Opened plan.md", so it shows after a reload and in every look. The press file carries the mod's result as `result: { error }`, where `error` is null for a success. When `result` is present, the host's `perform` returns it instead of opening or copying a second time. When it is absent, the host opens or copies as for any other look. `hooks/herdr-app.ts:applyLookPress` does this for every host. Codex's own copy does nothing, because its tab copies, so the look always sends `result` for a Copy.

## Presses that send a message

Answer, Reply, Explain, Discuss, Hand off and the PR fixes send the agent a message. They travel as press files like any other press, and the host delivers the message with its own `deliver`, which saves a sent record. The Herdr look never types into the terminal with `hc send`. That arrives as typed input, so the host would record it as the person's own message, with no sent record and no Queued state.

A reply's draft stays in the look until the person sends it. The press carries the words, as the `type` press does in every look.
