# Launch video: recording and animatic

Part of [the launch video plan](../launch-video.md).

Status: built.

## Recording

### Content

Beats 7 to 10 need a real session, because the point is that an answer reaches the agent and the agent acts. Demo presses send nothing. Script the session in a small sample project in the inbox-ui VM, so the recording never writes to your real inbox. Record it as one continuous take, as Vignette's trailer was recorded. The cut keeps spans of the take at real speed and skips Claude's working time, so the model's varying reply times don't need several takes.

Beat 11 needs the same rows in all three apps, and presses that change nothing outside the recording. The demo gives both. Claude Code shows it without its notices with `/inbox demo recording`. Codex does in a build made with `INBOX_DEMO_RECORDING=1`, from its Show demo button. All three read the same sample data from `hooks/demo.ts`.

The demo's rows describe work on Visor, an app for AR glasses: adding pinch-to-dismiss to glances, the small cards the glasses show. Beat 11 answers "Dismiss a glance with a pinch, or a flick of the wrist?", opens the finding "Pinned glances drift in a dim room", and marks "Put on the glasses and pair them with this Mac" done.

The AR rows are a change to `hooks/demo.ts` that is not on main. It is in the worktree `~/Code/worktrees/inbox/video-ar`, and the takes were recorded with it. Pete decides whether it lands on main. Until it does, the demo users see describes the checkout app.

Reason: the earlier demo rows described the inbox itself, such as "Hotkeys vanish on selected rows in ANSI", and beat 11 is where viewers read rows most closely.

### Frame and theme

- 1920×1080 at 60 fps, so the push-ins in beat 11 stay sharp.
- All three apps in the dark theme. Codex and the desktop app follow the system appearance. Give the terminal a dark theme with colors, so the open row shows its fill and not only the `▌` bar the Auto theme draws.
- Run Claude Code with its fullscreen renderer, `CLAUDE_CODE_NO_FLICKER=1 claude`, in a terminal at least 110 columns wide. Its pane then docks beside the conversation instead of inline above the prompt, so beat 7 can show the question in both places. The takes confirm the docked pane stays open while Claude replies.
- Set the desktop app's own theme to System or Dark. Hide its sidebar, which lists your other sessions.
- For beat 11, size the three windows to the same height. Each column is 640 px wide, so record each app at 2× and crop to the inbox and a strip of the app around it.
- The takes use a 13 pt font in a zoomed Terminal window, 124 columns wide. At 14 pt the window is 111 columns, and the released inbox drops the key letter before a long option, such as "(recommended)". The fix is on main and not released yet.
- Hide the menu bar, the Dock and notifications. Use a fresh account picture and a neutral project name.
- Terminal's title bar names the process, and Claude Code runs `caffeinate`, so the cut covers the title's text with a mask. Beat 11's terminal cut also covers the `/inbox demo recording` line and its reply.

### Clicks

Every press is a click, in all three apps. The VM's pointer does not show in the recordings, so the video draws one. It glides to each target and dips with a ring on each click.

- **One source for the clicks.** The timeline holds each click's point on the VM's screen and its lead: how long its result takes to show in that app. `drive.py` clicks at those points, and the video draws the pointer from the same points and times.
- **Hover in the take.** `drive.py` moves the VM's pointer onto each target 0.3 s before it clicks, so the target's hover state is in the take when the drawn pointer arrives. The pointer then stays where it clicked, as the drawn one does.
- **Beats 7 to 10.** `act.py` sends `click x y` commands and logs each one on the recorder's clock. The states take their times and points from that log.

Checked on the demo:

- A click on a tab switches to it, in all three apps.
- A click on Findings opens its first finding, in all three apps. No separate click opens it.
- A click back on Needs you reopens the row that was open when you left it, in all three apps. In beat 11, that is the question that opened after the answer.
- A click on a row opens it, in all three apps.
- A click in the terminal's pane presses what is under it.
- A row ignores presses for its first 400 ms open, `PRESS_GUARD_MS` in `hooks/view.ts`. So beat 11 clicks Done 0.9 s after the task opens. Done also comes before the answered row leaves, so the rows don't move under the click, and the finished task leaves by 14.1 s, before the end card starts.
- Terminal.app passes the pointer's hover to Claude Code, so a hovered option lights in the terminal's take.

### Synchronizing the three columns

Record each app separately and line the three up in Remotion. `drive.py launch side-by-side <app>` reads the beat's click times from the timeline file. The recorder writes the host time of its first frame, and the driver logs each click on the same clock, as Vignette's `media/trailer/record.swift` and `drive.py` do. `cut.py` reports the first frame that changes after each click, which is when its result shows. Each click's lead in the timeline should match it.

## Animatic

The animatic is the `launch` video in `videos/`, the Remotion project that holds the inbox's videos, with its own `package.json`. [videos/README.md](../../../videos/README.md) describes the project and the parts every video shares. Remotion renders React components to video frame by frame. Pete bought a Company License for publishing the video.

- **The timeline** is `videos/src/launch/timeline.ts`. It holds each beat's caption, start and length, and each state's time, click and still. It imports `SETTLED_MS` from `hooks/view.ts` and `EXIT_MS` from `codex/src/rows.ts`, so a settled row holds for its real time.
- **The drawn thread** is `videos/src/launch/thread.ts`, for its lines and when each appears, and `videos/src/launch/ThreadView.tsx`, which draws it. Its text is written for the video. Its questions, idea and unmentioned insight are the ones the real session brings to the inbox in beats 7 to 9.
- **The pointer** is `videos/src/shared/Pointer.tsx`.
- **Two cuts.** `launch` is the video. `launch-captions-off` is the same with no captions, to check that the pictures carry the story.
- **Stills.** Beat 11 has stills captured from the demo in all three apps. A column whose take is missing shows them instead. A beat with no take and no still draws a placeholder that names its app and state.
- **Where captures live.** Stills are in `videos/public/launch/stills/<app>/<state>.png` and clips in `videos/public/launch/takes/`. Git ignores both. The window sizes and inbox rectangles in `WINDOWS` are measured from the side-by-side takes, which the stills match within a few pixels. A take at another window size needs them measured again.
- **App labels.** Each app's label is its icon and name. Beats 7 to 10 show it above the footage. In beat 11 it sits just above its window and fades as the camera pushes in. The icons are copied from the installed apps into `videos/public/icons/`, which Git ignores, since each is its maker's trademark. Pete checked each maker's brand rules.
- **Looks.** The captions and labels are set in Geist, an open font under the SIL Open Font License, loaded in `videos/src/shared/fonts.ts`. The font files are committed in `videos/public/fonts/` with the license in `OFL.txt`. The drawn thread stays in SF Mono, like the terminal it stands for. Each caption line is white text on its own dark pill, 48 px, centered at the bottom, so it reads muted at the size of a feed. Each column's app label sits in a pill above it. The pointer is the macOS arrow, since all three apps run on a Mac.

To run it, install its tools once with `npm --prefix videos ci`. Then:

- `npm --prefix videos run studio` opens Remotion Studio, which lists both cuts.
- `node videos/scripts/check.mjs launch` prints the caption report, the states each beat cuts off and any missing stills.
- `node videos/scripts/check.mjs --render <cut>` also renders the cut to `videos/out/` and writes the checks below.

The agent checks each render:

- ffprobe: 1920×1080, 60 fps, and the frame count the timeline gives.
- A caption report: each caption lasts at least 2 s, reads at no more than 20 characters per second, and overlaps no other.
- Stills at every click and every caption's first and last frame, read back.
- A contact sheet of one frame per second.
