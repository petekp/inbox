# The spike

Part of [the Herdr look plan](../herdr-look.md).

Status: proposed.

The data path was likely to work: a host writes a file, and the mod watches it. The press path back was not proven, least of all for Claude Code, whose mod cannot watch files. The spike ran that path end to end, with no model calls. Its code and logs stayed out of the repo.

## Setup

The `inbox-ui` VM, macOS 15.7, with Herdr 0.1.10, hc 0.1.15 and Claude Code 2.1.312. Herdr was installed in the VM only, and removed afterwards.

- **Claude Code** ran in a Herdr app terminal, with a patched copy of the mod and a throwaway config. A placeholder key and a closed `ANTHROPIC_BASE_URL` kept it from reaching any model. On start, the copy put the demo ledger into the real session. It labeled its terminal, wrote the session to a file on every change, and listed a press folder every P ms. It applied each press with `press()` and the holds the press carried.
- **A Herdr mod** drew the focused session's rows with `sessionView` and `rowKeyPlan`, loaded with an `Intl.Segmenter` stand-in. A click on Done or Undo wrote a press file. `watchFolder` reloaded the session file.

The method was written before the runs. An independent reviewer checked how the numbers were taken, and the figures here include its corrections. Every press was made with Claude Code idle at its prompt.

## The round trip works

A real click on Done, sent over VNC at a 1000 ms poll, showed its result in the mod 601–655 ms later, between two window shots. Then 59 driven presses, Done and Undo in turn:

- The host applied all 59, each exactly once, with no stale press and no error.
- The mod logged the result of 58 as drawn.

The one miss was the first press of a run, after a restart and four idle minutes. The host applied it within 125 ms. The mod never logged it as drawn, and showed no error. A missing log entry does not prove a missing draw, because the mod's log can lag what it shows. That run used an earlier build of the Herdr mod, which was not kept. The later build ran 40 presses with no miss, and it would have drawn the same press late rather than never. With so few presses, a miss rate of up to about 9% fits the data.

The cause is unknown, so the look rereads the file and times out a press that shows no result. [Data and presses](data-and-presses.md#the-press-path) gives the details. The first press after a start was also slow on the host: `press()` took 140–294 ms, against a median of about 6 ms.

## Delay

Median, with the range, from the press to the render that shows the result:

| Poll | Presses | Total | The poll's wait |
| --- | --- | --- | --- |
| 1000 ms | 38 | 760–800 ms (233–1188) | 550–600 ms |
| 250 ms | 20 | 392 ms (215–780) | 108 ms |

At 1000 ms, the total is the poll's wait, which is uniform from 0 to P, plus about 200 ms:

- **Apply.** The host takes a median of 6–16 ms to apply the press with `press()` and start writing, and 1–2 ms to write.
- **Watch.** Herdr's `watchFolder` takes about 170 ms to report the write, and never less than 156 ms. It is the largest fixed cost.
- **Render.** The mod takes a median of 15–29 ms to render.

At 250 ms that second part grew to a median of 227 ms, with a tail to 598 ms. The cause is not isolated: that run also pressed more often and started cold.

A press made while the agent works, or right after a reply, is likely slower, because the poll, `press()` and the publish wait on the same process as the turn. That case was not measured.

## The wake label

`hc events --terminal <t>` prints a line for each change to a terminal's labels, with all its labels. Over ten `hc label` calls, each line arrived 11–17 ms after the call started. So a press could wake Claude Code within about 15 ms, with nothing running at idle. Not checked: spawning `hc events` from the mod with `$.process.spawn`.

The same signal could replace `watchFolder` in the other direction. If the host also set a revision label after each write, the mod would re-render on the label change at once, instead of about 170 ms later.

## Idle CPU of the poll

Each poll tick costs Claude Code about 1 ms of CPU: about **0.1% of a core at 1000 ms** and 0.4% at 250 ms.

That comes from a 50 ms poll, 20 ticks a second, measured against the runs on either side of it with the poll off. Its 95% interval puts a 1000 ms poll at 0.06–0.14% of a core, or at most 0.22% when each run counts as one sample. Measured directly, a 1000 ms poll is lost in the noise: windows with the poll off read from 0.27% to 2.18%, and the 250 ms run read lower than the 1000 ms run.

The estimate assumes a tick costs the same at every rate, which was not tested. A tick at one a second would have to cost about 5 times the estimate to reach 0.5% of a core.

Herdr's own CPU showed no change with the poll.

## Native motion

The pressed row faded with `.transition('opacity', { duration: 1500 })`. Window shots read its title's brightness out of 255 while a control row stayed at 238:

| ms after the press | −34 | 84 | 481 | 601 |
| --- | --- | --- | --- | --- |
| Brightness | 238 | 224 | 146 | 132 |

So GPUI transitions run in the app.

The result arrived by the shot at 655 ms. The press carried no holds, so the closed row left the view and cut its fade short. Later presses carried the look's holds, and closed rows settled in place with Undo.

## What it found for the plan

- A press must carry the look's holds, or a closed row leaves at once.
- A row must stay drawn until its move ends.
- The look needs a fallback when a press shows no result.
- When nothing in its tab has focus, the look needs a terminal to follow. Reloaded while focused itself, it showed no inbox.
- Bun's browser target replaced `fs/promises` with an empty object, even marked external, and the first click failed on it.
- `writeTextFile` creates the folders it writes into.
- `herdr.d.ts` in 0.1.10 is byte-identical to 0.1.9's, and so are the element typings.
- Done's message to the agent must still go out. The spike left it out, since `press()` alone schedules nothing.
- The first press after a start, and a press during a turn, need their own live checks.
