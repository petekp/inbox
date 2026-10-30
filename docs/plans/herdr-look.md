# The Herdr look

Status: proposed. Nothing is built. Nothing merges into code before 0.3.0 ships.

## Summary

The inbox gets a fifth look, drawn inside Herdr's desktop app. [Herdr](https://herdr.dev/) runs terminals and coding agents in one window. The look is a Herdr app mod: JavaScript that Herdr runs to draw native panels.

Pete decided three things:

- **Per session.** The look shows one session's inbox, as every look does today. Focus a terminal, and the look shows that terminal's session. An inbox across sessions comes later.
- **Counts per session.** Each session labels its Herdr terminal with what waits on the person, so Herdr can show which sessions need them.
- **Native to Herdr.** The look should feel like Herdr's own panels, not a copy of the Codex tab.

The look works with the three hosts the inbox has: Claude Code, Codex and omp, each running in a Herdr app terminal. Each host keeps running its own session.

## How it works

1. Each host **publishes** its session to `<app home>/inbox/sessions/<session id>.json` after every change. The app home is Herdr's settings folder.
2. Each host **labels** its terminal with `inbox.session` and the counts, using `hc label`.
3. The mod shows the session of the focused terminal. It reads the file and **builds the view itself** with the shared `sessionView`, so ages and countdowns stay live.
4. A press in the mod writes a **press file**, carrying the look's holds. The host applies it with the same `press()` every look uses, and its next publish carries the result.

## What the spike showed

[The spike](herdr-look/spike.md) ran this path in a VM with Claude Code, with no model calls:

- **It works.** Of 59 driven presses, the host applied all 59 exactly once, and the mod logged 58 as drawn. The one miss is unexplained, so the look gets a fallback.
- **Delay.** With Claude Code idle and a 1000 ms poll, a press takes a median of 760–800 ms from click to redraw. At 250 ms it takes 392 ms. At 1000 ms, about 200 ms of that is outside the poll's wait, and most of it is Herdr's file-watch delay of about 170 ms. A press during a turn was not measured.
- **CPU.** A poll tick costs Claude Code about 1 ms of CPU, which is 0.1% of a core at 1000 ms, and at most 0.22% by a cautious interval.
- **A faster wake.** `hc events` reports a terminal's label change in 11–17 ms. A press could wake Claude Code that way with no poll at all.
- **Motion.** GPUI's native opacity transition runs in the app.

## Decisions

Pete made each of these. The linked part gives the reason. A decision that still rests on an unchecked behavior names it, and [the open questions](herdr-look/shipping-and-testing.md#open-questions) list it.

1. **[Where the files live](herdr-look/data-and-presses.md#the-data-path).** Under Herdr's app home, its settings folder. This works today because a mod may write only there.
2. **[How a press wakes Claude Code](herdr-look/data-and-presses.md#claude-code).** A wake label: the look changes a label on the session's terminal, and Claude Code reads the change through `hc events`. It costs nothing at idle, and a shell saw each change in 11–17 ms. Still to check: running `hc events` from the Claude Code mod.
3. **[Where the look opens](herdr-look/look.md#where-it-opens).** In a pane to the right of the agent's terminal.
4. **[How the person opens it](herdr-look/look.md#where-it-opens).** The host's `/inbox` command opens the pane when it runs in a Herdr app terminal. Still to check: how the host finds its pane's id from its terminal.
5. **[Counts in Herdr's sidebar and tabs](herdr-look/counts.md#what-herdrs-sidebar-and-tabs-show).** Herdr's own `agents` and `tabs` mods draw a count from a label. This needs a change in Herdr. [Counts](herdr-look/counts.md#draft-request-to-herdrs-maintainers) holds a draft request to Herdr's maintainers, which is not filed. Until Herdr draws the counts, they show only in the look.
6. **[Install and update](herdr-look/shipping-and-testing.md#how-it-ships).** Each host copies its bundled mod into Herdr when its copy is newer, after asking the person once.

## Parts

- [The spike](herdr-look/spike.md): what ran, the numbers, and what it found for the plan.
- [Data and presses](herdr-look/data-and-presses.md): what each host publishes, and how each host applies a press.
- [Counts](herdr-look/counts.md): the labels, the reporting that replaces `HERDR_PANE_ID`, and the sidebar.
- [The look](herdr-look/look.md): where it opens, following focus, controls, motion, keys and themes.
- [Code and docs](herdr-look/code-and-docs.md): the new folder, shared-code changes, feature entries and look-map rows.
- [Shipping and testing](herdr-look/shipping-and-testing.md): install, update, tests, scope, open questions and the order to build.

## Terms

- **Herdr app.** Herdr's desktop app, as opposed to `herdr`, its terminal multiplexer, which today's Herdr sidebar reporting talks to.
- **App home.** The app's settings folder: `$HERDR_APP_HOME`, or `~/.config/herdr-app`.
- **App terminal.** A terminal the app runs through herdr-core. It has `HC_TERMINAL_ID`, `HC_TERMINAL_SOCKET` and `HC_SCOPE` set.
- **Label.** A `key=value` pair herdr-core keeps on a terminal. Mods read them with `terminals()`.
- **Published session.** The file a host writes for the look: the shared `Session` in a versioned envelope.
- **Press file.** The file the look writes for a press: the press, its id and time, and the look's holds.
- **Wake label.** A label the look sets after writing a press file, which a host following `hc events` reads as "a press is waiting".
