# Launch video: how an agent should make the animatic

Status: built. The animatic it recommends is the `launch` video in the Remotion project in `videos/`.

This is research for the [launch video](launch-video.md). It covers how a coding agent can build the video's animatic, check it and hand it off to the final recording. Sources were read on 2026-10-13, and the table at the end gives each one's date. "Older" marks a source from before 2025-10. "Undated" marks one with no date.

The closest prior work is Pete's own trailer for Vignette, made by an agent in 2026-09. [Vignette's trailer](#vignettes-trailer) says what it proved and what carries over.

## Recommendation

- **Build the animatic in Remotion, as a trial.** Remotion is a framework that renders React components to video, one frame at a time. Its free license covers evaluating it. Publishing the finished video for a company needs a paid license. See [Decisions](#decisions).
- **Use stills of the real inbox in all three apps,** and keep the captions as a text layer.
- **Keep one timeline file, modeled on Vignette's `beats.toml`.** It holds each beat's caption and timing, and the press times. For the animatic, times are planned. Once a take exists, each beat is anchored to an event logged in that take. The file reads the UI's own timings from the code, so the animatic moves when they change.
- **Capture the stills by script.** Beat 8 uses the demo rows in `hooks/demo.ts`, which all three apps read, so its stills can be captured again exactly whenever the UI changes. Beats 1 to 7 show rows the demo doesn't have, such as "Keep the old API for one release?". Take their stills from the scripted sample session. Those differ between runs, because the model's replies vary.
- **Have the agent check every render.** It renders stills at each press and caption frame, a contact sheet and a caption-timing report. For beat 8 it confirms that all three columns change on the same frame. A person then watches at full speed, because the checks cannot judge pace.
- **Record the final footage the way Vignette's trailer was recorded.** Capture each app's window with ScreenCaptureKit. The driver logs every press on the recorder's clock. For beats 1 to 7, record one continuous take of the real session, keep spans of it at real speed, and dissolve where the cut skips Claude's working time.
- **Hand off inside the same project.** Replace each beat's stills with its recording, trimmed so every press lands on the timeline's frame.
- **Don't use AI image or video models for the product UI.** No source shows they can reproduce a specific app's interface. OpenAI's own docs say its image model struggles with exact text and layout.

Two findings change the shot list before anything is built:

- **The UI's settle time doesn't fit beats 5, 7 and 8.** A closed row stays in place for 5.12 s. See [The UI's own timing](#the-uis-own-timing).
- **The plan for keeping the columns in sync needs two changes.** Align each press separately, and use pointer clicks for the desktop app's tabs and rows. See [Keeping the three columns in sync](#keeping-the-three-columns-in-sync).

## Terms

- **Animatic**: a rough version of the video with real timing. Stills or placeholders stand in for the final footage, and the captions are in place. It exists to settle timing before anything is recorded.
- **Still**: one image of one UI state, such as the Needs you tab with the question open.
- **Composition**: a video defined in code. Each frame is computed from its frame number.
- **Deterministic render**: the same inputs always give the same frames, however fast or slow the machine is.
- **Wall-clock capture**: a recording taken in real time. Its timing depends on how fast the app and the machine run, so frames can be dropped or repeated.
- **CFR and VFR**: constant and variable frame rate. Screen recorders often write VFR. Editing and frame math need CFR.
- **WAAPI**: the Web Animations API, `element.animate(...)`. The Codex tab animates its rows with it.
- **Take**: one continuous recording of the screen while a script drives the apps.
- **Span**: a stretch of a take that the cut keeps and plays at its real speed.
- **Cast**: an asciinema recording of a terminal session. It stores the terminal's output with the time of each event.
- **EDL and OTIO**: formats for moving a timeline into a video editor. An EDL, or edit decision list, is a plain list of cuts. OTIO, or OpenTimelineIO, is a richer open format.

## What this video needs from the tools

### How each app's footage can be made

The three apps differ in what can be rendered outside the app. The repo shows how each one draws:

| App | How its inbox draws | Ways to get footage |
| --- | --- | --- |
| Claude Code in the terminal | Claude Code draws it as terminal text. | Capture the terminal window, as Vignette's trailer did. Replaying the terminal output through a terminal emulator is possible, but the renderer would have to be built. |
| Claude desktop app | Native controls in the app's pane, with no CSS. | Capture the window. Nothing else can draw it. |
| Codex | A Preact page. Rows animate with WAAPI and some CSS transitions. The Undo countdown reads `Date.now()`. Data comes from the host frame over `postMessage`. | Capture the window, or host the built tab in a local page and render it there. A local page lacks the Codex window around the tab. |

Beat 8 opens on "a wide shot of the three app windows, each whole". The final footage therefore needs each real window, at least for that shot.

### The UI's own timing

`SETTLED_MS` in `hooks/view.ts` is 5,120 ms. It is how long a closed row stays in its place before it leaves, and Undo counts down over the same time. All three apps use it: the terminal and desktop through `hooks/register.tsx`, and Codex through `codex/src/tab.tsx`. In Codex a leaving row then takes another 200 ms, set by `EXIT_MS` in `codex/src/rows.ts`.

The shot list's times leave too little room for it:

- **Beat 5, 26–32 s,** ends with "press Done. The row settles and Undo drains." Draining takes 5.12 s. To finish inside the beat, Done must land by 26.9 s, before copying and running the command. The beat can show only the start of the drain.
- **Beat 7, 40–46 s,** needs the finding to close and then drop into "1 Closed". In the terminal the drop comes 5.12 s after the close, so the close must land by about 40.9 s. That close waits on Claude finishing the fix, so its time varies from take to take.
- **Beat 8, 10–16 s:** if Done lands at 10.0 s, Undo is still draining through the 13–16 s hold. The row leaves at about 15.1 s in the terminal and desktop app, and finishes leaving at about 15.3 s in Codex. That is under the caption, so the lists are still moving during the hold.

Inference: an animatic exists to catch problems like this. It catches this one only if the timeline reads these constants from the code and holds each settled still for their real length. An animatic that cuts straight from one still to the next would hide it.

### Keeping the three columns in sync

The shot list plans to drive each app from one timed script, start each take with a visible mark, and line the takes up on that mark.

Sources state:

- The macOS SDK header for `AXUIElementPerformAction`, the accessibility press, says it can block until the app's handler returns. It can also time out with `kAXErrorCannotComplete` even though the action happened. The header is undated.
- The ScreenCaptureKit header `SCStream.h` says a frame is sent only when the screen changes, and each frame carries the time it was shown. Undated.
- ffmpeg 9.0.1's built-in help says the `fps` filter forces a constant frame rate, rounding each frame to the nearest slot. Undated.

The repo's [looks map](../looks.md) lists the desktop pane's Client regions: the tab bar, each closed row, the "N Closed" line, an open row's follow-ups, and Undo. A Client is a region that takes clicks over its whole shape. Row actions, such as an answer or Done, are Buttons. A check of the desktop app on 2026-10-09, which isn't recorded in the repo, found that the tab bar exposes no accessibility button. The other Clients weren't checked, but they likely behave the same.

Inference:

- **Log every press on the recorder's clock.** Vignette's recorder writes the host time of its first frame, and its driver logs each action on the same clock. Each take then gives every press's time directly, so the takes don't need a visible start mark.
- **Align every press, not only the first.** Press latency varies, so a single alignment drifts over a 16-second beat. The log gives the time a press was sent. On desktop, confirm it by the first frame that column changes, then trim or hold frames so the three match.
- **Drive the desktop tabs and rows with posted pointer events.** At 7–10 s, beat 8 switches all three apps to Findings and opens a finding. At 10–13 s it presses Done on a task, and tasks are on Needs you, so a switch back to Needs you comes first. The shot list doesn't name that press. On desktop, all three of these need a posted click. AXPress reaches only Buttons, such as an answer or Done.
- **Let the timeline file produce the press schedule.** Each app's driver reads its press times from the file the animatic uses, so the animatic and the recording cannot disagree.
- **One take of all three windows is an alternative.** Vignette recorded one screen with two apps on it. Beat 8 could put all three windows on one screen and record them in one take, on one clock. But only one window can have focus, so two would show inactive window chrome. The terminal and Codex both take keys, so the driver would have to move focus between them.
- After conversion to 60 fps, alignment is accurate to half a frame, about 8 ms.

### Numbers at 60 fps

| Span | Frames |
| --- | --- |
| The whole 70 s video | 4,200 |
| The 0.3 s stagger between columns | 18 |
| The 2 s caption minimum | 120 |

Netflix's English subtitle guide allows adult viewers at most 20 characters per second. Every caption in the shot list fits in 2 s at that speed except two, and both beats are long enough for them:

- Beat 1, "Agents ask questions. Then they scroll away.", has 44 characters and needs 2.2 s.
- Beat 4, "It catches what the agent noticed on the way.", has 45 characters and needs 2.25 s.

## Vignette's trailer

An agent made the trailer for Vignette, Pete's screenshot tool, in 2026-09. Real Claude Code ran in a terminal on screen, as it will in beats 1 to 7 here. Its pipeline is in `media/trailer/` in [petekp/vignette](https://github.com/petekp/vignette), described in [its pipeline doc](https://github.com/petekp/vignette/blob/main/docs/trailer-pipeline-2026-09-26.md) and [its v3 run notes](https://github.com/petekp/vignette/blob/main/docs/trailer-v3-overnight-2026-09-29.md).

What its docs and code state:

- **The animatic is an HTML page.** `storyboard/animatic.html` plays every shot at real timing. Each shot in `story.js` gives the screen and caption at any time `t`. The same code draws the storyboard, so each storyboard panel is a frame of the animatic. Pressing `C` hides the captions, to check that the screen proves each caption. Its brief held recording until Pete had watched the animatic and approved it.
- **The timeline is a data file.** `beats.toml` holds the captions, the camera moves and the spans of the take the cut keeps. Its times are written against events the driver logs, such as `send.press+0.5`. Rewording or retiming needs only a new cut, about half a minute.
- **Takes run on one clock.** `record.swift` records the screen with ScreenCaptureKit and writes the host time of the first frame. The driver logs each action on the same clock, so the log lines up with the frames exactly.
- **The whole story is one take.** Reaching a late beat's state needs the earlier beats anyway. The cut picks each span from the take by its events. Inside a span the take plays at its real speed. Where the cut skips ahead, such as over Claude's working time, the next span dissolves in.
- **Real Claude Code is isolated.** It runs with its own `CLAUDE_CONFIG_DIR` in a copy of a sample app, and the driver waits on Claude's turns.
- **One tempo.** One beat is 0.5 s. The driver presses on beats, and the cut puts caption changes and camera moves on half beats.
- **The cut is rendered in Swift.** `cut.py` turns a take and `beats.toml` into a plan of frames. `cut.swift` renders crops, dissolves, captions and key caps into a ProRes master. For each output frame it shows the last recorded frame at or before that time, since the recorder writes a frame only when the screen changes.
- **It was checked frame by frame,** at 2 and 10 frames a second. Every large change between two frames was traced to the app, a camera move or a planned dissolve.

What its notes record as lessons:

- **The real take ran longer than the animatic.** The animatic was 41 s, and the v3 trailer was 60 s. The app's own motion and the pace of the hand play at real speed.
- **Hard cuts read as sudden.** The first cut joined beats with hard cuts. The second played the take continuously and dissolved only where it skipped time.

Inference, for this video:

- **The recording method carries over.** It answers how to film beats 1 to 7 when the model's timing varies: one take, events on the recorder's clock, spans and dissolves. It also gives beat 8's press times without a start mark.
- **The cut doesn't carry over as is.** It crops one take with one camera. Beat 8 composites three takes side by side, each with its own push-in and an 18-frame stagger. That needs a compositor with several layers, which Remotion has.
- **Expect the real cut to run long.** Vignette's ran 46% over its animatic. Holding each settled still for `SETTLED_MS` makes this animatic closer to real speed, but it can't time the pointer or Claude.

## Techniques

### Code-driven video

Sources state:

- **Remotion** is at [v4.0.535](https://github.com/remotion-dev/remotion/releases), released 2026-10-12.
  - **License:** its [license](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md) is free for individuals, non-profits and for-profit companies with up to 3 employees. Everyone else needs a paid Company License.
  - **Agent support:** it has first-party [Agent Skills](https://github.com/remotion-dev/skills) for Claude Code and Codex, installed with `npx skills add remotion-dev/skills`. The skills repo was created 2026-01-19 and updated 2026-10-12. The docs are also served as Markdown and through `/llms.txt`. The [docs-only MCP server](https://www.remotion.dev/docs/ai/mcp) is deprecated in favor of a docs skill.
  - **Determinism:** the [docs](https://www.remotion.dev/docs/troubleshooting/css-animations) say every frame must be computed from `useCurrentFrame()`, because frames can render out of order or more than once. CSS animations and transitions flicker or show the wrong progress. The only workaround, `--concurrency=1`, is slow and "doesn't guarantee correct animation timing". The docs don't mention WAAPI. A site embedded with [`<IFrame>`](https://www.remotion.dev/docs/iframe) should have no animations.
  - **Timing and checking:** `<Sequence from>` starts a scene at a frame, and `<Series>` and `<TransitionSeries>` chain scenes. [`npx remotion still <composition> <out> --frame=N`](https://www.remotion.dev/docs/cli/still) renders one frame, and `render --frames=0-99` renders a range. The Studio preview shows each Sequence on a timeline you can scrub.
  - **Recordings and captions:** [`<OffthreadVideo>`](https://www.remotion.dev/docs/offthreadvideo) pulls the exact frame from a video file with FFmpeg. Captions have their own package, `@remotion/captions`.
- **HyperFrames** is HeyGen's HTML-to-video renderer. Its [repo](https://github.com/heygen-com/hyperframes) describes it as "Write HTML. Render video. Built for agents." It is Apache 2.0, created 2026-03-10, and at v0.8.155 on 2026-10-13, with several releases a day.
  - **How it renders:** its [determinism page](https://github.com/heygen-com/hyperframes/blob/main/docs/concepts/determinism.mdx) says it moves every animation to `frame / fps`, captures each frame with Chrome's `beginFrame`, and encodes with FFmpeg. A page must not read `Date.now()`, use `requestAnimationFrame`, or fetch during the render.
  - **Animation libraries:** it can seek GSAP, CSS animations, Anime.js, Lottie, Three.js and WAAPI. Its [WAAPI notes](https://github.com/heygen-com/hyperframes/blob/main/skills/hyperframes-animation/adapters/waapi.md) ask for animations created when the page loads, with a finite length and `fill: "both"`.
  - **Agent tools:** the CLI has `snapshot --at t1,t2`, `check --snapshots`, `lint` and `render --fps 60`. A `--docker` render pins Chromium and fonts. Local renders can differ by a pixel.
  - **Its own caveats:** its [comparison page](https://github.com/heygen-com/hyperframes/blob/main/docs/guides/hyperframes-vs-remotion.mdx) calls Remotion "older and much more established". It says HyperFrames "breaks quietly" when its rules are missed. Its [frame adapters page](https://github.com/heygen-com/hyperframes/blob/main/docs/concepts/frame-adapters.mdx) calls the adapter API "experimental v0".
- **Motion Canvas** looks dormant. Its [last stable release](https://github.com/motion-canvas/motion-canvas), v3.17.2, came out 2024-12-14, and it has had one commit since 2025-10.
- **Revideo** is maintained. [v0.11.0](https://github.com/midrender/revideo) came out 2026-07-10. Like Motion Canvas, it draws scenes from TypeScript code, and it adds a headless `renderVideo()`.
- **Shotstack** is a hosted JSON-timeline API with an [MCP server](https://shotstack.io/docs/guide/agents/mcp-server/) in beta. It renders in the cloud.
- **Other tools checked:**
  - Editly hasn't been updated since 2025-05.
  - MoviePy's last release, 2.2.1, came out 2025-05-21.
  - Manim is active, but it draws math animation, not UI.

Inference:

- **Remotion can't run the real Codex tab with its motion.** WAAPI runs on the page's real clock, and Remotion's docs offer no way to drive it from the frame. Using the tab in Remotion would mean rewriting its row motion as a function of the frame. That second copy of `codex/src/rows.ts` could drift from the real one. An animatic made of stills doesn't need any of this.
- **HyperFrames is the only video framework found that documents seeking WAAPI.** Its WAAPI code also hooks `Element.prototype.animate`. That suggests it can track animations started mid-render, such as one a press triggers. This is my reading of `packages/core/src/runtime/adapters/waapi.ts`, not a documented feature.
- **The Codex tab breaks HyperFrames' rules in three ways.** It reads `Date.now()` for the Undo countdown. It polls with `setTimeout`. It waits on `postMessage` replies for every press.
- **Motion Canvas and Revideo can't host a web panel.** They draw their own scenes, so they add nothing over Remotion here.

### Terminal recording

Sources state:

- **VHS** is at [v0.12.1](https://github.com/charmbracelet/vhs/releases), released 2026-09-24.
  - **Script commands:** a script, called a tape, uses `Type`, `Sleep`, `Wait /regex/` with a 15 s timeout, `Screenshot`, and `Set Framerate`, `Width`, `Height` and `Theme`. Output can be GIF, MP4, WebM or a folder of PNG frames.
  - **How it captures:** its source file `vhs.go` runs the terminal in a headless browser, and a real-time ticker grabs the canvas. The default rate is 50 fps.
- **asciinema 3**, a Rust rewrite, came out 2025-09-15, which is older. The [latest release](https://github.com/asciinema/asciinema/releases) is 3.2.1, from 2026-06-16.
  - **The cast format:** in [asciicast v3](https://docs.asciinema.org/manual/asciicast/v3/), each event stores the seconds since the previous event, as plain text. Events are output, input, marker, resize and exit.
- **agg** turns a cast into a GIF, and outputs nothing else. Its latest is [v1.9.0](https://github.com/asciinema/agg/releases), from 2026-05-29. No documented tool turns a cast into a 60 fps MP4.
- **Terminal emulator libraries:** `@xterm/headless` 6.0 runs a terminal emulator with no screen. xterm.js 6.0.0 came out 2025-12-22. pyte, a Python terminal emulator, was last updated 2025-09-02, which is older.

Inference:

- **VHS timing is wall-clock.** `Wait` lets it drive Claude Code through replies of varying length, but each take's timing differs.
- **A cast replayed through `@xterm/headless` at a fixed 1/60 s step is deterministic by construction.** Its timing is data you can edit. A long model pause can be shortened, or the scroll-away in beat 1 moved to an exact frame, without running the model again. Nobody ships this renderer, so it would have to be built. Earlier checks on this project already replayed raw tmux output through pyte, to find glitches that lasted one frame.

### Browser capture of the Codex tab

Sources state:

- **Playwright** is at [v1.64.0](https://github.com/microsoft/playwright/releases), released 2026-10-07. `recordVideo` defaults to 25 fps. Its source file `videoRecorder.ts` forces a constant rate by having ffmpeg repeat frames. [`page.clock`](https://playwright.dev/docs/clock) controls `Date`, timers, `requestAnimationFrame` and `performance`. Its docs don't mention CSS animations or WAAPI.
- **Seeking animations in a page:** MDN says [`document.getAnimations()`](https://developer.mozilla.org/en-US/docs/Web/API/Document/getAnimations) returns CSS animations, CSS transitions and WAAPI animations. Each one's `currentTime` can be set while it is paused.
- **Chrome DevTools options:** `HeadlessExperimental.beginFrame`, the `Animation` domain and `Emulation.setVirtualTimePolicy` can control frame timing. All three are experimental.
- **timecut and timeweb** were last updated in 2023, which is older.

Inference: a frame-exact render of the real tab is possible, but it has to be built. It needs four parts: a host page that answers the tab's calls with demo data, `page.clock` for its timers, `getAnimations()` to seek each animation, and a screenshot per frame. The result shows the tab with no Codex window around it, so the final cut would still need a capture of the real app. Settled stills are much simpler: take the screenshot after the animations finish.

### macOS screen capture

Sources state:

- **ScreenCaptureKit**, per the macOS SDK headers, which are undated:
  - It captures one window or display at a default minimum frame interval of 1/60 s.
  - It sends frames only when the screen changes.
  - `SCRecordingOutput`, on macOS 15 and later, writes H.264 MP4 and has no frame-rate setting of its own.
- **`screencapture`** records video with `-v` or `-V <seconds>` and captures one window with `-l`. Its man page, which is undated, doesn't state the frame rate or whether timing is constant.
- **OBS** [32.2.2](https://github.com/obsproject/obs-studio/releases), released 2026-08-14, can start and stop recording and add chapter marks from a script through obs-websocket.

Inference: every route here is wall-clock and VFR. Record each window with ScreenCaptureKit at 2×, convert it to 60 fps CFR with ffmpeg's `fps` filter, then align by the frames that change, as described above.

### AI image and video models

Sources state:

- **OpenAI:** its [image docs](https://developers.openai.com/api/docs/guides/image-generation) say the model "can still struggle with precise text placement and clarity". They also say it has trouble placing elements in layout-sensitive compositions.
- **Google:** its [Gemini image docs](https://ai.google.dev/gemini-api/docs/image-generation) present legible text as a strength. They say nothing about copying an existing interface.
- **No evaluations:** no source tests Veo, Runway, Kling or any image model on reproducing a specific existing app's UI.

Inference: a generated frame would show an invented inbox. This video's point is that the same rows look right in three real apps, so an invented one misleads. Labeled gray boxes are honest placeholders. Real stills are better and cost little here.

## Methodology

### From shot list to animatic

Sources state:

- **What an animatic is:** [Boords](https://boords.com/animatic/how-to-make-an-animatic) and [Adobe](https://www.adobe.com/uk/creativecloud/animation/discover/animatics) describe an animatic as storyboard frames on a timeline, each with a length, plus titles and temporary audio. Boords finds the timing by "watch it back, fix the timing, watch again".
- **Agent-built launch videos:**
  - **Remocn:** its [launch post](https://dev.to/remocn/how-to-start-with-remocn-4dbn) describes a video made with an agent and Remotion, using a fixed storyboard of 8 beats in 35 s. The author reviewed it by eye in the Studio preview and gave feedback in plain sentences. The post is dated July 22 with no year shown.
  - **Codex and Remotion:** a [post from 2026-04-25](https://www.mejba.me/blog/remotion-codex-motion-graphics-ai-video) describes a launch video made this way.
    - Three things helped: exact asset paths in the prompt, explicit layout coordinates, and a screenshot of one frame sent with each fix.
    - It needed rework for a wrong first layout, a busy background that took four rounds, a first render with no audio, and parts carried over from another project in the same chat.
  - Neither author ran automated checks.

Inference, for this video:

1. **Write the timeline file from the shot list's table.** Each beat gets an id, a start frame, a length, a caption, its stills and its press frames. Read `SETTLED_MS`, `ENTER_MS`, `MOVE_MS` and `EXIT_MS` from the code.
2. **Capture one still per state per app, at 2×.** Capture beat 8 from the demo. Beats 1 to 7 come from a real session in the final cut. In the animatic, use stills from a scripted run of the sample session, or demo rows as stand-ins while the exact text doesn't matter yet. Where a state can't be captured yet, such as the reply scrolling past its question, use a labeled placeholder.
3. **Lay out the composition from the timeline.** Cut between stills on each press frame. Hold each settled still for the real settle time, and stagger the columns by 18 frames.
4. **Iterate.** Change lengths in the timeline file and scrub in the Studio. The stills are captured again only when the UI changes.

### How an agent checks its own output

Sources state:

- Remotion's [agent skills](https://www.remotion.dev/docs/ai/skills) cover authoring and rendering. None of them checks a finished render.
- [ffprobe](https://ffmpeg.org/ffprobe.html) reports streams, frame counts and durations as JSON.
- ffmpeg 9.0.1's built-in help lists the filters a check needs:
  - `tile` puts many frames on one image.
  - `select` with a scene score finds cuts.
  - `freezedetect` and `blackdetect` find frozen or black stretches.
  - `trim=start_frame` cuts at an exact frame.
- Netflix's [English Timed Text Style Guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-Timed-Text-Style-Guide), revised 2025-12-19, allows up to 20 characters per second and 42 characters per line.

Inference: the agent-built videos found used visual review only. The checks below are my proposal, and no source describes them as established practice.

- **ffprobe:** the render is 1920×1080, 60 fps and 4,200 frames.
- **Stills:** render one at every press frame, one at the frame after it, and one at each caption's first and last frame. Read each one back. Crop and enlarge where the detail is small.
- **Contact sheet:** one frame per second, tiled 10 by 7, shows the whole video's flow on one image.
- **Caption report:** every caption lasts at least 120 frames, reads at no more than 20 characters per second, and never overlaps another.
- **Same-frame check for beat 8:** for each press, find the first frame where each column's pixels change. All three must match.
- **Cut check:** scene-cut times fall within a frame or two of the timeline's beat boundaries.
- **A person watches at full speed.** The checks find broken frames and timing errors. Judging pace needs a person.

### Handing off to the final recording

Sources state:

- OTIO's [latest release](https://github.com/AcademySoftwareFoundation/OpenTimelineIO/releases) is v0.18.1, from 2025-11-09, and the project is still marked beta. `otio_json` is its lossless format. EDL and FCP7 XML come through plugins. Per the [v0.16 feature matrix](https://github.com/AcademySoftwareFoundation/OpenTimelineIO/blob/v0.16.0/docs/tutorials/feature-matrix.rst), from 2024 and older, neither carries multiple video tracks.
- DaVinci Resolve 18.6's manual, which is older, says Resolve imports and exports OTIO. A [Blackmagic forum thread](https://forum.blackmagicdesign.com/viewtopic.php?p=1151748) from 2025-05, also older, reports OTIO and FCPXML clips arriving unlinked through Resolve's scripting API.

Inference:

- **Keep the final in the same Remotion project.** Swap each beat's stills for its recording with `<OffthreadVideo>`, trimmed so each press lands on its timeline frame. The timeline stays the one source of truth, and the swap happens one beat at a time.
- **If a person finishes the edit in Resolve,** render beat 8 as one composited clip first, because an EDL can't carry three tracks. Then export the rest. Test an OTIO import on a small file first.

## Recommended approach

1. **Timeline file,** modeled on Vignette's `beats.toml`. It holds the beats, captions, still names and press times. For the animatic, times are planned. Once a take exists, each beat is anchored to an event logged in it. The file imports the UI's timing constants and produces the press schedule for each app's recording driver.
2. **A capture script per app.** For beat 8 it runs against `/inbox demo` and the Codex demo build. For beats 1 to 7, the terminal script runs the scripted sample session.
   - **Terminal:** send keys and capture the window.
   - **Desktop:** press its Buttons through accessibility, post clicks for tabs and rows, and capture the window.
   - **Codex:** send keys to the tab and capture the window.

   These scripts become the final recording drivers.

3. **Remotion composition.** It is a function of the timeline and the stills. Push-ins and the column stagger are computed from the frame number.
4. **Checks after each render**, as listed in [How an agent checks its own output](#how-an-agent-checks-its-own-output).
5. **Fix the shot list's timing against `SETTLED_MS` in the animatic.** Watch it at real speed before recording anything.
6. **Final recording, the way Vignette's trailer was recorded.**
   - **Capture:** record each window with ScreenCaptureKit at 2×, and write the host time of the first frame, as Vignette's `record.swift` does. Convert to 60 fps CFR.
   - **Log:** the driver logs each press on the recorder's clock.
   - **Beats 1 to 7:** one take of the real session, with Claude Code on its own `CLAUDE_CONFIG_DIR`. Keep spans of it at real speed, and dissolve where the cut skips Claude's working time.
   - **Beat 8:** one take per app. Line up each press by its logged time. On desktop, confirm it by the first frame that changes.
   - **Assemble:** swap the recordings into the same composition, beat by beat.

## Next-best option: adapt Vignette's pipeline

The recording half of Vignette's pipeline is part of the recommendation. The alternative is to adapt its other half too: the HTML animatic player and the Swift cut, in place of Remotion.

What it gains:

- **No new dependency and no license.** It is Python, Swift and ffmpeg.
- **Proven.** An agent made a published trailer with it in 2026-09.
- **The same model.** Its animatic player computes each frame from the time, as a Remotion composition does.

What it costs:

- **Beat 8 needs a compositor it doesn't have.** Its cut crops one take with one camera. Beat 8 puts three takes side by side, each with its own push-in, 18 frames apart. Building that into `cut.swift` means writing what Remotion already provides.
- **Agent checks need their own tooling.** Remotion renders any single frame with one command. Vignette's checks read frames from the finished render.

This is the fallback if the Remotion trial doesn't work out or the license isn't bought. The recordings and the timeline file carry over unchanged either way.

## Also considered

**Plain ffmpeg**, building the video with its `overlay`, `xstack`, `drawtext` and `zoompan` filters, is deterministic and adds no dependency. But it has no preview you can scrub, so each timing change needs a full render. A 70-second, three-column filter graph with push-ins is also hard to read and edit. ffmpeg stays in use for the checks and the encode.

**HyperFrames** would build the animatic from HTML instead of React.

What it gains:

- **License:** Apache 2.0, so there is no license question.
- **Agent tools:** `snapshot` and `check` are made for an agent checking its own work.
- **Real Codex motion:** it is the only video framework found that documents seeking WAAPI. In principle it could render the real Codex tab with its real motion.

What it costs:

- **Maturity:** it is seven months old and ships several releases a day. Its own docs call its adapter API "experimental v0" and say it "breaks quietly" when its rules are missed. Its version would have to be pinned.
- **The Codex advantage needs work that doesn't exist yet:**
  - **Rule breaks:** the tab reads `Date.now()`, polls with `setTimeout` and waits on `postMessage` replies, which all break HyperFrames' rules. Running it would need a clock replacement and a fake host page, which is a second harness to maintain.
  - **CSS transitions:** the tab also uses CSS transitions. Its CSS adapter handles CSS animations, and no source says whether it seeks transitions.
  - **No window:** the result still has no Codex window around it for beat 8's wide shot.
  - **Other apps:** the terminal and desktop columns need capture either way.
- **No gain for stills:** for an animatic made of stills, it does nothing Remotion doesn't, and it is less proven.

A HyperFrames spike is worth it only if the Codex column's captured motion turns out choppy in the final recording.

## Decisions

Pete decided these on 2026-10-13.

1. **Trial Remotion.** The video is for a for-profit company with more than 3 employees.
   - **Trial:** the Free License covers anyone "evaluating whether Remotion is a good fit, and are not yet using it in a commercial way". The [license FAQ](https://www.remotion.dev/docs/license/faq) sets no time limit on evaluating.
   - **Publishing:** this needs a Company License. Its per-person plan, "Remotion for Creators", costs $25 a month for each person who writes Remotion code, by hand or through coding agents.
   - **Before publishing:** buy that plan, or switch to the fallback. Pete decides which after the trial.
2. **Fix the timing in the animatic.** Try lengthening beats 5, 7 and 8, moving their presses earlier, and showing rows leaving as part of the beat. Pick by watching each at real speed.
3. **Film the terminal by window capture,** recorded as Vignette's trailer was. Don't build the replay renderer.

## Sources

| Source | Date | Used for |
| --- | --- | --- |
| [Remotion releases](https://github.com/remotion-dev/remotion/releases) | 2026-10-12 | Version |
| [Remotion license](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md), [license FAQ](https://www.remotion.dev/docs/license/faq) | Undated | License terms, evaluation, pricing |
| [Vignette trailer pipeline](https://github.com/petekp/vignette/blob/main/docs/trailer-pipeline-2026-09-26.md), [v3 brief](https://github.com/petekp/vignette/blob/main/docs/trailer-v3-brief-2026-09-28.md), [v3 run notes](https://github.com/petekp/vignette/blob/main/docs/trailer-v3-overnight-2026-09-29.md), `media/trailer/` source | 2026-09-26 to 2026-09-30 | Prior work: recording, timeline, cut, animatic |
| [Remotion Agent Skills](https://github.com/remotion-dev/skills) | 2026-01-19, updated 2026-10-12 | Agent support |
| [Remotion docs](https://www.remotion.dev/docs/ai/skills): skills, MCP, CSS animations, IFrame, still, OffthreadVideo | Undated | Determinism, rendering, checks |
| [HyperFrames repo and docs](https://github.com/heygen-com/hyperframes) | 2026-03-10 to 2026-10-13 | Rendering model, WAAPI, agent CLI |
| [Motion Canvas](https://github.com/motion-canvas/motion-canvas) | Last release 2024-12-14, older | Maintenance status |
| [Revideo](https://github.com/midrender/revideo) | 2026-07-10 | Maintenance status |
| [Shotstack MCP](https://shotstack.io/docs/guide/agents/mcp-server/) | Undated | Hosted alternative |
| [VHS releases](https://github.com/charmbracelet/vhs/releases) and source | 2026-09-24 | Tape commands, wall-clock capture |
| [asciinema releases](https://github.com/asciinema/asciinema/releases), [asciicast v3](https://docs.asciinema.org/manual/asciicast/v3/) | 2026-06-16; spec undated | Cast format |
| [agg releases](https://github.com/asciinema/agg/releases) | 2026-05-29 | GIF-only output |
| [Playwright releases](https://github.com/microsoft/playwright/releases), [clock docs](https://playwright.dev/docs/clock) | 2026-10-07; docs undated | Video capture, clock control |
| [MDN getAnimations](https://developer.mozilla.org/en-US/docs/Web/API/Document/getAnimations) | Undated | Seeking page animations |
| macOS 15.7 SDK headers: `SCStream.h`, `SCRecordingOutput.h`, `AXUIElement.h` | Undated | Capture and press timing |
| [OBS releases](https://github.com/obsproject/obs-studio/releases) | 2026-08-14 | Scripted recording |
| ffmpeg 9.0.1 built-in help, [ffprobe docs](https://ffmpeg.org/ffprobe.html) | Undated | Checks and alignment |
| [Boords](https://boords.com/animatic/how-to-make-an-animatic), [Adobe](https://www.adobe.com/uk/creativecloud/animation/discover/animatics) | Undated | What an animatic is |
| [Remocn launch post](https://dev.to/remocn/how-to-start-with-remocn-4dbn) | July 22, year not shown | Agent-built launch video |
| [Codex and Remotion launch post](https://www.mejba.me/blog/remotion-codex-motion-graphics-ai-video) | 2026-04-25 | Agent-built launch video |
| [Netflix English Timed Text Style Guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-Timed-Text-Style-Guide) | Revised 2025-12-19 | Reading speed |
| [OTIO releases](https://github.com/AcademySoftwareFoundation/OpenTimelineIO/releases), [feature matrix](https://github.com/AcademySoftwareFoundation/OpenTimelineIO/blob/v0.16.0/docs/tutorials/feature-matrix.rst) | 2025-11-09; matrix 2024, older | Handoff formats |
| [Blackmagic forum thread](https://forum.blackmagicdesign.com/viewtopic.php?p=1151748) | 2025-05, older | Resolve import problems |
| [OpenAI image docs](https://developers.openai.com/api/docs/guides/image-generation), [Gemini image docs](https://ai.google.dev/gemini-api/docs/image-generation) | Undated | Model limits |
