# UI fuzz: pressure-test every look and its motion

Status: building. The omp panel, the Herdr look, the shared row stepper, the Codex tab and the mod's terminal and desktop looks run, with the rules marked built below. [The Codex tab and the mod's looks](ui-fuzz-looks.md) has those two passes. The arbitrary-state pass comes next.

## What it is for

The looks are tested on the demo session and a few hand-picked states. Bugs such as #771, #772, #783, #798, #806 and #811 came from states and timings nobody wrote a test for: a press during a move, an Undo then an open 60 ms later, a title that wraps. The fuzzer generates many varied sessions and event sequences. It runs them through each look's own code and the hosts' own press and publish code. It checks rules on every resting draw and every animation frame, and shrinks a failing case to the smallest input that still fails. Its report names the look, the rule, the input and the frame, so an issue can be filed from it.

## Running it

`./scripts/fuzz.sh [--look omp|herdr|rows|codex|mod|all] [--seed N] [--runs N] [--time S] [--shrinks N] [--replay <case.json>]`

- Bun runs `fuzz/run.ts`. Case `i` of a run draws every choice from a PRNG seeded with `(seed, i)`, so `--seed N --case i` runs that case again. `--time` stops after that many seconds, `--runs` after that many cases.
- Each failure writes `fuzz/out/<run>/<look>-<rule>-<n>.json`, the shrunk case, which `--replay` runs again. Beside it, a `.md` gives the look, the rule, what it saw, the time of the draw or frame, the drawn lines or the frame's boxes, the case's size before and after shrinking, and the replay command. Each rule is shrunk at most `--shrinks` times a run, and a shrunk case already written is not written again. With `--shrinks 0`, the first failing case of each rule is written as it is. `fuzz/out/` is Git-ignored.
- A failure that an open issue already describes is known: `KNOWN` in `fuzz/seeds.ts` names each one by look, rule and a text in its detail. Known failures are counted but not shrunk or written, unless `--known` asks for them. A run exits 0 when every failure is known and no seed fails differently from its issue, and 1 on anything else, except that a Codex run or replay exits 2 when a case's tab page did not load and nothing failed. A seed whose issue is open but that now passes also fails the run, and its line says to close the issue and mark the seed closed in `fuzz/seeds.ts` in the same PR. A known failure that no case hit does not fail the run.
- `check.sh` runs a short fixed-seed run of it, described under "A fixed-seed run for check.sh" below.
- No model calls, no screen, no VM. Everything is headless and in one process.

## The case

A case is plain JSON: the look, the session it starts from, a list of events, and the drawing settings. Plain JSON is what lets a report replay a case and lets the shrinker cut it field by field.

### Starting sessions

- The demo session (`demoSession` in `core/view/demo.ts`), keeping all, none or some of its rows and findings, with texts replaced from the corpus below in none, some or all of them. Its PRs stay as the demo has them.
- A session from `emptySession` that the agent fills through its own tool calls at the start of the event list (see `record` below), so every row is one the record code built.
- Last actions on rows in each press state the view reads come from presses, not from hand-written state: the host's delivery outcomes below make them.

### Texts

Long sentences, one huge word with no spaces, CJK, emoji and ZWJ sequences, flags, RTL (Arabic, Hebrew) and mixed direction, combining marks, zero-width characters, tabs and newlines, markdown, ANSI escapes, the looks' own glyphs (`✓`, `·`, `…`, `↵`, `❯`), and empty strings. Each text draws from these classes and from mixes of them.

### Settings

- omp: widths from 10 to 220 columns, with no terminal height. A height is next.
- Herdr: the frame stand-in in `herdr/tests/frames.ts` lays out at a fixed pane width and wraps text at a fixed count of characters. It models the layout and does not measure glyphs, so Herdr's width rule is not checked. Its glyph rule runs on the painted text.
- Reduced motion: Herdr has none. The shared row stepper (`stepRow` in `core/view/row-motion.ts`) takes `isReduced`, and the Codex tab reads it. The stepper has the reduced-motion rule; the Codex tab gets it next.
- Themes: omp's line layout does not depend on its theme. Herdr's paint reads its theme for colors only, so the rule there, next, is that every tone a block names has a color in both themes.

### The host

One in-memory host (`fuzz/host.ts`) holds the session and a virtual clock, as `tests/session-script.ts` does. It is a `PressHost`, so omp's presses run through `press` in `core/runtime/host-press.ts`, and Herdr's press files through `startHerdrFile` in `core/remote/herdr-app.ts`, as the hosts run them. Its `deliver` answers accepted, rejected or unconfirmed, and holds a message until the turn ends in some cases, by the case's seed. Its `perform` opens and copies succeed or fail by the seed. A press whose outcome asks for it wakes the host 250 ms after the settle window, as `wakeLater` in `omp/src/host-sessions.ts` does, and `wakeAfterSettle` sends held answers and Done's message.

### Events

The person's events are each look's own input, so the look's own key handling and its shared UI controller decide what they do:

- omp: a key name, as `handleKey` in `omp/src/panel-keys.ts` takes it, through the real panel controller (`createPanel` in `omp/src/controller.ts`) with a source backed by the in-memory host.
- Herdr: a key, as `keyMove` in `herdr/src/keys.ts` takes it, a click on the n-th drawn row or tab, or a click on the selected row's n-th drawn button, through the stand-in's `press` and `click`. Typing goes into the open text field. A press goes through the look's real `PressQueue`, which writes a press file to an in-memory folder. The host takes the file after a seeded delay and runs it with `startHerdrFile` in `core/remote/herdr-app.ts`. The look reads the session back from `publishedText` through `readSession` and draws it with `screenOf`. So "Sending…", a press nobody took and the give-up time all happen as they do live.

Shared events, the same for every look:

- `wait`: 16 ms to 2 s, or past the settle window.
- `record` and `close`: the agent's tool calls, through `recorded` in `core/runtime/session-presses.ts`, with generated questions (0 to 12 options, a recommendation or none, notes, context, steps of each kind, design choices), tasks and findings. These are how rows enter and leave.
- `order`: the agent's `order_prs` call, setting or clearing the PR order.
- `prs`: a PR fetch result that changes what a PR shows (conflicts resolved, threads addressed, checks passing), applied as a fetch saves it, which is what ends a "… again" button.
- `turn`: the agent's turn starts (`turnStarted`) or ends (`turnEnded`). A message the host held until the turn ended is sent then.
- `status`: a generated Status answer (`NEW`, `SET`, `DONE`, `DROP`, `GOAL`, `MILESTONE` and the rest `parseStatus` reads), applied with `appliedStatus`, so subjects move between the list and the milestones.
- `end`: the session ends. In Herdr, the terminal goes back to its shell, so the look draws "The session ended" (`followed.is === 'ended'` in `herdr/src/screen.ts`). The mod's `/clear` (`cleared` in `core/runtime/session-turns.ts`) comes with the mod's looks.

Next, a separate pass, `--look arbitrary`, will build sessions with no regard for whether they can be reached: fields at edge values, optional fields missing, ids that repeat, times in the future or before the session began, empty lists. Its only rules will be that drawing never throws and never draws `NaN`, `undefined` or `[object Object]`.

## Looks

| Look | Drawn through | Rules built | Next |
| --- | --- | --- | --- |
| omp | `createPanel` in `omp/src/controller.ts`, over a `PanelSource` the in-memory host backs, `render(width)` after every event and timer | `no-throw`, `bad-text`, `width`, `raw-escape`, `glyph-cut`, `plan-order`, `counts` | `press-steady`. omp draws no glides. |
| Herdr | the real `Inbox` view in `herdr/src/main.ts`, opened with `openPanel` from `herdr/tests/gpui-stand-in.ts`, with virtual timers, press files and session files kept in memory. Its blocks before motion then go through `framesOf` in `herdr/tests/frames.ts` at 16 ms frames. | `no-throw`, `motion-id`, `bad-text`, `glyph-cut`, `plan-order`, `counts`, `cut`, `jump`, `connector-gap`, `vanish`, `rest-space` | `overlap`, `flicker`, `animates` |
| Shared row stepper | `stepRow` over generated targets, draw gaps, new rows and reduced motion, 50 cases for each `--runs` case | the four stepper rules below | the same rules on the Codex tab's drawn rows |
| Codex tab | the built tab in a headless browser page, as `codex/scripts/tab-page.sh` serves it, with its boxes and text rects sampled each animation frame, in both themes and with reduced motion emulated | `cut`, `jump`, `reduced`, `rest-space`, `bad-text`, `no-throw` | `vanish`, `plan-order`, agent events |
| Terminal and desktop | the mod's render path as `tests/hooks-world.ts` drives it, in the plugin test engine, read as the drawn tree | `drawn`, `title`, `bad-text`, `raw-escape` | presses, keys and line widths in the terminal. The terminal does not glide. Desktop pixels need the VM, so desktop stays on the drawn tree. |

`fuzz/look-herdr.ts` imports `herdr/tests/gpui-stand-in.ts` before any `herdr/src` module, since the stand-in replaces the app's modules as it loads. It wraps `moveRows` in `herdr/src/motion.ts` to record whether the view drew each frame as the person's input, and gives `framesOf` the same flag, so the replay moves rows as the view did. A key or click targets the tree of the last draw and comes 1 ms after it, so the view takes it as the person's move, as it always is live. `fuzz/look-omp.ts` wraps `drawPanel` in `omp/src/panel.ts` the same way, to read the screen and UI state each draw came from. Neither changes `frames.ts` or a look's code. The view draws a new page, a tab, Help or a session, at rest, which `framesOf` cannot know, so the driver records each draw where `moveRows` was told it is the first, and the rules replay each page from its first draw.

## Rules

Each rule has an id that names it in reports.

### Resting

- `plan-order`: the selected open row's buttons are its plan's, in order (AGENTS.md "Drawing in each look"). omp reads them from its lines after the cursor, as `omp/tests/panel.spec.ts` does, at 80 columns or more. Herdr reads each open row block's `buttons`, as `herdr/tests/draw.spec.ts` does. Both skip a row whose text field is open, and omp skips a row that is collapsed, has a press out or a reply sending, or was handed off and not opened again.
- `width`: no omp line is wider than the panel, measured with `visibleWidth` from omp's TUI (`pi-tui`), which cuts a line that is too wide. The panel measures with `cellWidth` in `core/domain/text.ts`, so this checks that the two agree.
- `raw-escape`: with every omp style drawn as plain text, no line holds an escape other than the reset the panel puts after an ellipsis.
- `glyph-cut`: no drawn text holds half a surrogate pair, ends inside a ZWJ sequence, or starts with a combining mark or variation selector. It runs on omp lines and on Herdr's painted text.
- `counts`: the shared view's Asks and Finds counts equal the waiting rows `listWaits` gives, and omp's tab line draws the same counts. Herdr's drawn tab counts are not read yet.
- `no-throw` and `bad-text`: nothing throws, and no drawn text holds `NaN`, `undefined`, `Infinity` or `[object Object]` the input did not hold. In Herdr, a gpui-kit motion-id restart is its own rule, `motion-id`.
- Next: `overlap`, in the stand-in's layout no box has a negative or non-finite top or height, and no two boxes in one column overlap.

### Motion

Motion rules run on the frames `framesOf` draws from 0 ms, the case's start. The stand-in's frames before 0 warm its springs up.

- `cut`: no text is cut by its box while it shows at 0.2 opacity or more (`CUT_OPACITY`), as `framesOf` reports `cuts`.
- `jump`: no box moves off its spring, as `framesOf` reports `jumps`. A panel whose row's form or panel has faded to 0.02 opacity or less is left out, since nothing of it shows.
- `connector-gap`: the tree connectors leave no gap, as `framesOf` reports `gaps`. A stroke draws nothing once its fade to no opacity, or its box's, has ended, or when it is first drawn at none. It joins no column, so a stroke that shows and ends against it leaves a gap.
- `rest-space`: 1.5 s after the case's last event, when every move has come to rest, no clipped box is taller than its content and no blank line's worth of space sits between two lines a block draws. In Herdr it reads the last frame's `rest` from `framesOf`: each clipped box with a set height beside its content's height, and the lines each list block draws at `CUT_OPACITY` or more. In the Codex tab the page sets each clipped box's height to auto for a moment to measure its content, and reads the text, controls and fields each `[data-motion]` box draws, its nested boxes' included. A control counts by its drawn shape, so a button's padding is not blank space. The other rules miss this: `cut`, `vanish` and `jump` look at text and moves, and a line kept hidden at rest moves nothing.
- `vanish`: a text that shows at 0.2 or more of opacity times share does not go in one frame with no draw then, while its block still shows. A text that goes on as a longer or shorter text in its block, or whose block shows as many texts in the next frame, changed rather than went.
- Next: `press-steady`, a button whose press is out keeps its place and size while nothing above it changed. `flicker`, within one move a text's opacity does not rise, fall and rise again. `animates`, a box whose resting height changes passes through a height between the two.
- Built for the shared row stepper (`--look rows`, also in `--look all`): `stepper-time`, no track has a `since` after its draw or a `since` that is not finite. `stepper-rest`, a moving state comes to rest within `moveMs` plus one frame of its last change, drawn every 16 ms toward the same target. `stepper-form-left`, `drawsFormLeft` holds only within the move. `stepper-reduced`, with `isReduced` every target is reached in the draw that asks for it. `stepper-form`, a resting row rests in the form it was asked for, and only `gone` drops it. Each rule fails on a broken `stepRow` that breaks it: one that ignores `isReduced`, sets `since` ahead, restarts an opening move each draw, or rests a closed row open. The stepper passes all of them on 10,000 cases.
- Next, with the Codex tab: the same rules on the rows it draws, read from its `[data-motion]` rects.

`vanish` and the next motion rules leave out the one-draw changes that `docs/looks/differences-herdr-motion.md` keeps on purpose:

- A status a press brings, such as "Sending…", shows in that press's draw, and goes at once when a press takes it away.
- A text field's lines hide at once.
- Banner words appear and go without a fade.
- A newly shown tab, Help page or session draws at rest.
- A box whose height changed with its width takes its new height at once.
- A close held for less than `LEAVE_FADE_MS` swaps form at once.
- A block that moved takes new ids (`MOVED_TO` in `herdr/src/heights.ts`).

### Seeds

Recent bugs are seed cases in `fuzz/seeds.ts`, and the Codex tab's in `fuzz/seeds-codex.ts`, which every run checks before its generated cases. A seed for a closed issue must pass, and the run fails when it does not. A seed for an open issue is expected to fail with its rule, and the run says so without failing. When it passes, the run fails and says to close the issue and mark the seed closed.

A known failure in `KNOWN` matches on part of its detail, so keep that part as narrow as its issue. #832's part, any cut in a panel's box, also matched a cut that a tab shown again makes. That cut was found only once #832's seed closed, and is now #898.

- Herdr: #771 (a row that settles while it opens), #811's second Copy press, #827's four seeds, #828's leave just after Explain, #832's collapse just after Explain, #833's fold of every Status fold, #950's, #956's Reply after an option and #957's Fix whose refresh fails, pass. #967, #971 and #972 have open seeds. #811's collapse right after Undo is not reproduced: the stand-in shows no cut of the title's second line.
- From the first runs: #827, #828, #830, #831, #832 and #833, each with its seed. #898 has its seed too. #829 was a false report from the frame replay animating a tab switch, and is closed.

## Shrinking

When a case fails, the shrinker tries smaller cases and keeps one when the same look fails the same rule:

1. Drop events, in chunks from half the events down to one.
2. Drop the starting session's items, findings, closed rows and PRs.
3. Shorten typed and recorded texts, drop Status lines, and move waits toward simple values.
4. Move the width to 80.

It stops after 200 tries or when no step shrinks the case. Each rule is shrunk at most `--shrinks` times per run, 2 by default, and a shrunk case already reported is not reported again.

## Dependencies

None. A seeded PRNG is ten lines, and the shrinker works on the case's own JSON. A property-testing library such as fast-check brings generators and shrinking, but its shrinking works on its own generator values. A report needs the case as plain JSON that replays alone, which the library would not give without the same conversion code. It would also be the first runtime dependency of a test tool here.

## Files

`fuzz/` at the repo root, since it spans looks and runs outside each look's test runner:

- `run.ts`: arguments, seeds, the loop and reports.
- `case.ts`, `rng.ts`, `texts.ts`, `gen.ts`: the case format and its generator.
- `host.ts`: the in-memory host. `agent.ts`: the agent's events through the shared code.
- `look-omp.ts`, `look-herdr.ts`: each look's driver. `look-codex.ts` and `codex-page.ts`: the Codex tab's driver and the code it runs in the page. `look-mod.ts`, `mod-look.ts` and `mod-case.ts`: the mod's looks, with `tsconfig.mod.json` to type-check the part that runs in the test engine. `look-rows.ts`: the shared row stepper, with its own generator, rules and shrinking, since a case there is a list of draws rather than a session.
- `rules-text.ts`, `rules-omp.ts`, `rules-herdr.ts`, `failure.ts`: the rules.
- `shrink.ts`, `seeds.ts`, `seeds-codex.ts`, `tsconfig.json`.

`scripts/fuzz.sh` runs it. Reports go to `fuzz/out/`, which Git ignores. Each file stays at 5,000 tokens or under.

`check.sh` type-checks only the root, `codex`, `omp` and `herdr` projects, so it does not check `fuzz/`. Until it does, run `./herdr/node_modules/.bin/tsc -p fuzz` and `./herdr/node_modules/.bin/tsc -p fuzz/tsconfig.mod.json` after a change there. It needs the Herdr app's types, which `bun herdr/herdr-types.ts` copies in.

## A fixed-seed run for check.sh

`./scripts/fuzz.sh --seed 1 --runs 12 --shrinks 0` runs the seeds, 12 cases in all, alternating between the Herdr look and the omp panel, and 600 stepper cases in about 6 to 12 seconds on a Mac. `check.sh` runs it as its "fuzz" step, after the Herdr checks, and only where Bun and the omp and herdr tools are installed. It finds only known failures, so it exits 0, and it fails on a new failure, a seed that fails differently from its issue, or a seed whose issue is open but that passes. It leaves out the Codex tab, which runs in real time, and the mod's looks, which take about 10 seconds for 20 cases. CI does not run `check.sh`, so CI does not run it. Each run leaves a `summary.txt` in a new folder under `fuzz/out/`, which Git ignores. When an issue is fixed, mark its seed closed in the same PR, and its known failures then count as new.
