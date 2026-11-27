# UI fuzz: the Codex tab and the mod's looks

Status: building.

This is part of [the UI fuzz plan](ui-fuzz.md). It covers the two looks that run outside the fuzzer's own process: the Codex tab in a headless browser, and the mod's terminal and desktop looks in Claude Code's plugin test engine.

## Codex tab

`./scripts/fuzz.sh --look codex [--seed N] [--runs N]` serves the built tab with `codex/scripts/tab-page.sh` on port 4795. It drives the page in a headless Chrome through agent-browser, in the session `inbox-fuzz-codex`, and closes both when it ends. It serves the bundle in `codex/plugin/dist`, so a branch that changes the tab builds it first with `./scripts/bundles.sh build`. A case is a theme, a width of 360, 520 or 800 pixels, reduced motion on or off, and a list of events: waits, keys, typing, and clicks on the n-th row, button or tab.

`drive` in `fuzz/codex-page.ts` runs inside the page. It opens a new thread, so each case starts from the demo session. It fires each event at the tab's iframe, then samples every animation frame until the page has been still for 1.5 s. A click sends pointer and mouse events before the click, as a person's does. It checks these rules on each frame:

- `cut`: no text that shows at 0.2 opacity or more (`CUT_OPACITY` in `core/view/row-motion.ts`) has between 5% and 95% of its own text rect inside a box whose height is changing and that clips, or inside a clipping box that holds still after the text showed whole in the frame before, as when a line above the text grows in one draw. Frames within 50 ms of a tab or Help switch are left out, since a new page draws at rest.
- `jump`: no box moves by a spike, a step of 8 px or more that is over three times the steps before and after it. The detail says whether the box grew, shrank or moved. A box pushed by a spike in a box above it is left out. A stall in a box above, a frame where its height stood still during its glide, is named as the cause.
- `reduced`: with reduced motion, no box moves in three frames in a row.
- `bad-text` and `no-throw`: no text holds `NaN`, `undefined` or `[object Object]`, and the page throws no error.

Each new kind of failure, a rule and its issue or the kind of box, is shrunk by dropping events, then rerun three times. The report gives the case, the replay command and a capture of the frame where the rule first failed. To make the capture, the driver pauses every running animation at that frame.

Positions add the page's scroll offset, so a scroll does not count as a move. Runs are in real time, so a failure can come and go between runs. `--look all` leaves the Codex tab out for that reason.

Results so far, on seeds 1 to 3 with 30 to 50 cases each. The fixed seeds for #834 to #837 run before the generated cases, in `fuzz/seeds-codex.ts`:

- #834: a press's new line, or a PR comment's line from its thread, pushes full-opacity lines past the edge of its growing box.
- #835: Explain on a row that is still opening makes the row 24 px taller in one frame.
- #836: a row's height glide that starts again mid-move stands still for one frame, in about two of three runs.
- #837: Cancel on the Reply field brings the row's buttons back below the edge of its growing box.
- #863: a closing row's box cuts lines that are still fading out, at 21% to 42% opacity. Seed 2, case 9 finds it.
- #864: Copy's result on an open task wraps after the title and moves the buttons 20 px in one frame. Seed 2, case 28 finds it.
- Not filed: once, a 12 px shrink and then a cut of "Reply" at 0.27 opacity, after ArrowUp, a 120 ms wait and a click on the open row. It came back in 1 of 3 replays.

The Codex run exits 0 only when every failure is known (`KNOWN` in `fuzz/seeds.ts`) and no seed fails differently from its issue. A seed whose issue is open but that now passes fails the run, and its line says to close the issue and mark the seed closed. A case whose tab page did not load, as can happen when the machine is under load, is judged neither passed nor failed. Its line says it could not run and why, and the run exits 2 when nothing failed. The seed for #836 fails in about 2 of 3 runs, so it can pass and fail the run. `check.sh` does not run this look, since it runs in real time.

Every seed for #834 to #837, #959 and #968 now passes. #982, #983 and #987 have open seeds. #772 and #783 (open or close just after Undo) have no seed yet.

Not built yet: `vanish` and `plan-order`. The driver sends no agent events, so the seeds for #798 (Status subjects move into milestones) and #806 (Dismiss after Explain drops the result line) cannot run there. The driver also does not check that the server answering port 4795 is the one it started: a tab page server left running there from an earlier check serves its older bundle, and the run then reports failures the build under test does not have.

## Terminal and desktop

`./scripts/fuzz.sh --look mod [--seed N] [--runs N]` writes the cases into one fuzz file, `fuzz/out/<run>/mod/cases.fuzz.ts`. It runs that file with `scripts/test-files.sh`, which copies a `fuzz/*.fuzz.ts` file into the test folder as a test. The plugin test engine passes no environment variables to a test, so the cases go in the file itself.

`fuzzMod` in `fuzz/mod-look.ts` starts a session in `tests/hooks-world.ts`, makes the agent's `record` calls, and mounts the pane in the terminal or desktop look. The pane is 30, 50, 80 or 120 columns wide, with room for every row. On the Asks and Finds tabs it checks:

- `drawn`: the pane draws its tabs. A pane that draws nothing at all was #830, where one control character in a row's text made Claude Code refuse the whole pane.
- `title`: each recorded row shows the first 8 letters and digits of its title, which a cut title still shows.
- `bad-text` and `raw-escape`: no drawn text holds `NaN`, `undefined` or `[object Object]`, or a control character.

The shrinker drops records. On seeds 1 and 2 with 40 and 150 cases, no generated case fails. A fixed seed in `MOD_SEEDS` (`fuzz/seeds.ts`) holds the escape case of #830, which is closed, so it must pass, and the run fails when it does not. An open issue's seed is expected to fail, and the run fails when it passes. `check.sh` does not run this look, since its fuzz step covers the Herdr look, the omp panel and the row stepper.

The terminal does not glide, and the test engine lays out no pixels, so neither look has motion rules. Desktop pixels need the VM. Plan order in both looks is already checked on the demo by the demo test in `tests/hooks.test.ts`. Next: presses, keys and widths of drawn lines in the terminal.
