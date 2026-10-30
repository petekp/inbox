# Counts

Part of [the Herdr look plan](../herdr-look.md).

Status: proposed.

Each host labels its own Herdr terminal with what waits on the person. Herdr then knows, for every terminal, which inbox session runs there and how much waits in it.

## The labels each host sets

A label is a `key=value` pair that herdr-core keeps on a terminal. `hc label <terminal> key=value …` sets several at once, and an empty value removes one. Each change re-renders every mod once: the probe saw exactly one render per `hc label` call, with no timer in the mod. Herdr's own labels start with `herdr.`, so the inbox's start with `inbox.`:

| Label | Value | Set when |
| --- | --- | --- |
| `inbox.session` | The session id | Always, while the host runs. The look finds the session's file by it. |
| `inbox.needs-you` | The Asks count, as "2" | Asks has rows that wait. Removed at 0. |
| `inbox.findings` | The Finds count | Finds has rows. Removed at 0. |
| `inbox.prs` | The PRs count | The PRs tab has rows. Removed at 0. |
| `inbox.status` | One line: a stop, a dialog, the first ask, or the session's focus | Always. The same line the `inbox` token carries today. |
| `inbox.stop` | The stop, as "! Signed out: /login" | A stop is set. A stop also removes the three counts, as the token report does today. |

The values come from `hooks/herdr.ts:herdrTokens`, the function that builds today's pane tokens, so the TUI and the app say the same thing. The spike set `inbox.session`, `inbox.needs-you` and `inbox.findings` from the Claude Code mod with one `hc label` call per change. Herdr showed them on the terminal at once: `inbox.needs-you=8` and `inbox.findings=4` for the demo rows.

### When a host reports

- After every saved change, in the same step that publishes the session file. A report that would change nothing is skipped, as `herdrReporter` does today.
- At session end, every `inbox.` label is removed. Claude Code reports at `session.end`, and omp when it shuts down. Codex has no hook for a session's end, so its labels stay until the terminal runs something else. The look and the counts treat a terminal whose foreground program is a shell as having no inbox, whatever its labels say. `terminals()` gives the foreground program.
- `hc label` takes no sequence number, unlike `herdr pane report-metadata --seq`. Codex writes from several processes: hooks, the detached update and the server. Codex already keeps the last report's write time in the session as `herdrReport.seq`. A report goes out only when its write is newer, and the check and the record happen under the session's lock. Two reports can still leave out of order between the check and the send, and the next write corrects that. Holding the lock through `hc label` would stall the server's presses, as `codex/src/hook.ts` notes for the Herdr call there.

## Replacing the `HERDR_PANE_ID` reporting

Today `hooks/herdr.ts` reports to Herdr's terminal multiplexer with `herdr pane report-metadata`, only when `HERDR_PANE_ID` is set. The app sets no `HERDR_PANE_ID`. Its terminals get `HC_TERMINAL_ID`, `HC_TERMINAL_SOCKET` and `HC_SCOPE`, and the probe found that a Claude Code hook inherits them.

`hooks/herdr.ts` gains one function that reads the environment and returns where to report:

```ts
type HerdrTarget = { kind: 'pane'; pane: string } | { kind: 'terminal'; terminal: string } | null
```

- `HERDR_PANE_ID` set: `pane`, reported with `herdr pane report-metadata` as today.
- `HC_TERMINAL_ID` set: `terminal`, reported with `hc label`, and the session file is published.
- Neither: `null`, and nothing is reported.

The three callers switch from reading `HERDR_PANE_ID` to this function: `hooks/register.tsx:publishStatus`, `codex/src/host.ts:herdrOnWrite` and `omp/src/host.ts:reportCounts`. Each reporter keeps its own queue, so one report runs at a time and the last one reads the newest state.

`hc` is found on `PATH`, then at `~/.local/bin/hc`, where Herdr's installer puts it. A host where neither exists reports nothing and logs why once. The spike called `~/.local/bin/hc` by its full path.

Delegate tracking, `hooks/herdr.ts:delegatesInHerdr`, asks `herdr agent list`, which only the multiplexer answers. Tracking agents a session starts with `hc run` is separate work and is not in this plan.

## What Herdr's sidebar and tabs show

Nothing yet. Herdr 0.1.10's shipped `agents` sidebar and `tabs` bar draw each agent's status from its OSC 7501 report: a spinner while it works, "Needs you" while it is blocked, a dot when it is done. Neither reads any other label. So the labels reach Herdr, but the person sees them only in the inbox look.

Three ways to show them, for Pete to choose:

1. **Herdr draws them.** Herdr's shipped `agents` and `tabs` mods show a count from a label. That could be a convention for any program, such as `badge.count` and `badge.tone`, or the `inbox.` labels themselves. Every Herdr user gets it with Herdr's updates, and no layout is cloned. This needs a change in Herdr.
2. **The inbox ships clones.** The inbox ships copies of `agents` and `tabs` that also draw the counts. A shipped layout is read-only, so the person must switch to a cloned layout, and the clones stop getting Herdr's fixes.
3. **Only the look shows them.** The look draws the counts of the session it follows. The sidebar shows no more than it does today.

The recommendation is 1. The counts exist so the person can see which sessions need them without opening each one, and only the sidebar shows every session at once. The OSC 7501 status is the wrong channel: the app reads only its root `state` and `app`, so an inbox report there would overwrite the agent's own.
