# Shipping and testing

Part of [the Herdr look plan](../herdr-look.md).

Status: proposed.

## How it ships

A Herdr mod is a folder in `<app home>/mods/<name>/`. Herdr loads a new folder at once and reloads a mod when a file in it is saved. A mod the person copies in never updates by itself. Herdr lists shared mods at herdr.dev/mods, from public GitHub repos with the topic `herdr-mod`, and the person's agent copies the files.

The inbox's three hosts each install the inbox from this repo, so each install already holds the built mod, `herdr/mod/inbox/`. Two ways to get it into Herdr, for Pete to choose:

1. **The hosts install and update it.** A host that runs in a Herdr app terminal compares its bundled mod's version with the one in `<app home>/mods/inbox/`. When its own is newer, it copies its copy in, and Herdr reloads the mod in place. The first install asks the person once, in the inbox, before writing into Herdr's folder. The look then updates with the inbox, and every host carries the same files.
2. **herdr.dev/mods.** The repo takes the `herdr-mod` topic, and the person's agent copies `herdr/mod/inbox/`. The mod never updates unless the person copies it again, and the listing covers the whole repo, not the mod alone.

The recommendation is 1. A mod that falls behind the hosts breaks when the envelope's `format` moves, and the person has no reason to copy it again by hand. When two hosts carry different versions, the newer one wins, and the mod reads older envelopes through `upgradeSession`.

### Minimum Herdr version

Herdr 0.1.10, the version the spike ran. `herdr.d.ts` was byte-identical from 0.1.6 through 0.1.10, and the elements' typings did not change from 0.1.6 through 0.1.9, so earlier versions would likely work. Across the six tags before 0.1.10, the one change that broke mods came in 0.1.5, when `focused().pane` and `focused().terminal` became nullable. The mod reads `updates().app.version`, and below 0.1.10 it says which version it needs.

### When Herdr's mod API changes

Herdr makes no stability promise for the mod API, rewrites its `.d.ts` files at each start, and asks its own contributors to keep released versions working.

- The repo keeps copies of `herdr.d.ts` and `gpui-kit.d.ts` from the minimum version. `herdr/build.ts` type-checks against them.
- The release pass runs `herdr-app check` on the bundle with the newest Herdr. The check loads the mod, renders it once and runs `init`, including its tasks, without a window. It works over SSH, so it runs in the VM.
- A render that throws draws a short message with the error instead of a blank pane.
- Herdr keeps a mod's last good version running when a saved file fails to load, so a bad update shows in `herdr-app status` rather than as a dead pane.

## How it is tested

### Unit tests

In `herdr/tests/`, with `bun test`, as omp does:

- `follow`: each focus case in [the look](look.md#following-the-focused-pane), from fixed `focused()`, `panes()` and `terminals()` values.
- `files`: an envelope from each host's state type reads back, an older `format` upgrades, a newer one is refused, and a press file round-trips with its holds.
- `draw`: the buttons of every plan come out in the plan's order, as `tests/hooks.test.ts` checks for the terminal and desktop looks and `omp/tests/panel.spec.ts` checks for the panel.
- `hooks/text.ts`: the fallback cuts text as `Intl.Segmenter` does for combining marks and joined emoji, run with `Intl.Segmenter` hidden.

### Host tests

Each host's tests drive its publish and press watch through its `SessionHost`:

- A saved change publishes the envelope and sets the labels. A change that moves no count sends no label report.
- A press file is applied once with `press()`, then deleted. A malformed file or an unknown `format` is deleted and logged, and changes nothing.
- A Done press from the Herdr path wakes the agent after the settle window, as a Done in the host's own look does.
- Nothing is published or watched when `HC_TERMINAL_ID` is unset.

The mod's tests use `world()` in `tests/hooks.test.ts`, which answers every engine event. Codex's and omp's use their own harnesses.

### Live checks in the VM

In the `inbox-ui` VM, with Herdr installed only there, as the spike did:

1. Start each host in an app terminal with no model access: a placeholder key, a closed `ANTHROPIC_BASE_URL` for Claude Code, and the Codex and omp equivalents. Seed the demo rows.
2. Open the look beside it. Press Done, Dismiss and Undo with real clicks over VNC, and check each round trip in both logs.
3. Check every state and every move in the look, in Herdr's light and dark themes, at a narrow and a wide pane, with window shots during each move.
4. Switch focus between two agents in one tab, end a session, and reload the mod.
5. Time a press made while the agent works, and the first press after a start.

### The release pass

`docs/release.md` gains a Herdr step: `herdr-app check` on the bundle, then one press round trip per host in the VM. Gaps the pass finds go to `docs/plans/release-pass-follow-ups.md`.

## Out of scope

- **A cross-session inbox.** One list of what waits across every session. The published files already hold what it needs, so it can come later without changing the hosts.
- **Agents with no inbox integration.** Herdr cannot act as the host for an agent the inbox does not run in. It sees only the agent's screen and status report, and the inbox would have to scrape the screen.
- **Other machines.** Herdr can show terminals on other machines. The session and press files are local, so the look covers this computer's terminals only.
- **Delegates started with `hc run`.** Tracking them as the Status's children is separate work.

## Open questions

- Does `codex queue --thread <id>` reach a Codex CLI session running in a terminal, with a sent record?
- Can a `keys.json` binding carry a command's arguments, so a key could open the look?
- How does the host find its pane's id from its terminal, to open the look beside itself?
- Does a `height` transition on a row measured with `on_size_change` collapse it smoothly?
- Does Herdr expose, or plan to expose, the system's reduced-motion setting to mods?
- May the inbox write under Herdr's app home, or should Herdr name a folder for a mod's data?
- How does the look behave on Linux, where the spike did not run?

## Order to build

Nothing merges into code before 0.3.0 ships. After that, each step merges on its own and leaves every look working:

1. **Shared code.** The `Intl.Segmenter` fallback, `Look` gains `'herdr'`, the row machine moves to `hooks/row-motion.ts`, and `hooks/herdr.ts` gains the app target, labels, envelope and press file.
2. **Counts.** All three hosts set the labels in Herdr app terminals. This is useful on its own once Herdr's sidebar draws them.
3. **The look, read-only.** `herdr/` draws the Asks, Finds and Status of the focused session from the published files.
4. **Presses from Claude Code**, with the poll or the wake label, and the press follow-ups moved out of `runPress`.
5. **Presses from omp, then Codex.**
6. **Motion, keys, the PRs tab and Help.**
7. **Install and update, docs and the release pass.**
