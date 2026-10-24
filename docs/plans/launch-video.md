# Launch video

Status: built. The video is ready to publish. The `draft` variant tells the story below with Pete's captions. Its sample project is Visor, an agent you wear in AR glasses. Its takes were recorded in the VM on main at `f75d5c4` with the AR demo rows, and every press in them is a click. Release v0.2.5 ships that build with those demo rows.

An 81.5-second video. It shows how much an agent's thread asks you to track, then shows the inbox taking that over in all three apps. It has no voiceover. Short captions carry the words, so it works muted in a feed. Every press is a click, and the pointer is on screen.

Pete chose to make the full cut first. A 30-second cut could follow, with beats 2, 7, 8, 11 and 12.

## The story

A session starts simple. Then the replies pile up: tool calls, diffs and long paragraphs. Questions and ideas scroll past inside them. To catch them all, you would have to read everything the agent wrote and keep it in your head. Some things the agent notices never reach the reply at all.

So you reply point by point. You read back through the thread, type a numbered list into the prompt and send it. The agent answers each point and raises new ones, and you do it again. This is one of the biggest sources of friction in working with a coding agent.

The inbox is the missing piece. It gives the agent one stable place to ask you, beside the conversation, in a form that is quick to scan. Each question comes with ready answers. Each finding comes with next steps such as Fix, Discuss and Reply. One click answers. Rows arrive and close on their own as the session moves.

It works the same in Claude Code in Terminal, the Claude app and Codex in the ChatGPT app. Each app draws it in its own style.

Reasons for these choices:

- **A long opening.** The viewer has to feel how much the thread asks of them before the inbox means anything.
- **A drawn opening.** Beats 1 to 6 show how much an agent writes and how much you have to remember, in any agent. A thread drawn in Remotion can be paced exactly, and it can mark what scrolls past while the text is still readable. A real recording sped up 8 times can't be read, and marks on moving footage are hard to place. The cut to real footage in beat 7 also marks where the product starts.
- **Clicks, not keys.** A pointer clicking shows cause and effect to a viewer who knows no keys. The VM's pointer does not show in the recordings, so the video draws it from each click's logged point and time.
- **The question arriving live in beat 7.** The inbox adds and removes rows on its own. The viewer has to watch a question leave the conversation and land in the inbox.

## Beats

Times are targets. Each caption stays on screen at least 2 seconds.

| # | Time | Picture | Caption |
| --- | --- | --- | --- |
| 1 | 0–6.5 s | A drawn thread. Its window rises in, and the caption is up before anything moves. You type one short prompt at a person's pace and send it. The agent's short reply lands on a strong hit in the music. | A chat session starts simple enough. |
| 2 | 6.5–12 s | Replies stream in faster and faster: tool calls, diffs and paragraphs. Questions, a side note and a promising idea are marked as they pass, then scroll away. The questions and the idea are the ones the real session in beats 7 to 9 brings to the inbox: whether glances follow your head, whether to keep the `onTap` alias, and that `frame()` re-sorts every glance 90 times a second. | Then things begin to pile up. |
| 3 | 12–17 s | The camera pulls back to the whole thread, too small to read. Labels pop in one after another, top to bottom, where the questions, the side note and the idea sit in it. Each label is a dark chip with an edge and a line icon in its mark's color, and a thin leader draws out to its lines. Nothing glows. Labels that would overlap stack apart. | Questions and ideas get buried. |
| 4 | 17–21 s | The other labels leave one after another, and the blue "Unmentioned insight" label grows and moves up beside the agent's "Thinking…" line as the camera pushes in on the agent's thinking. It noticed that the gaze dwell timer survives looking away, and decided to leave it. The reply never mentions it. Beat 9 shows the same bug as an issue in the inbox. | Some aren't even surfaced. |
| 5 | 21–27 s | Back at the prompt, you type a numbered reply, one line per point, and send it. | You diligently respond, point by point. |
| 6 | 27–31 s | The agent replies with a numbered list and new questions. You start typing "1." again. | Again, and again... |
| 7 | 31–36.5 s | Recorded: Claude Code in Terminal. The drawn thread shrinks away and the real terminal arrives with an empty right side. The inbox pane slides in from the window's edge, outlined, with an "Inbox" label. The reply's question gets the same amber Question mark as in beats 2 and 3. The mark moves to the inbox as the question's row lands there, the reply dims, and the camera pushes in on the inbox. | Inbox gives the agent one place to ask you. |
| 8 | 36.5–44.5 s | The camera pulls back to the whole window. The pointer clicks the question. It opens with its answers ready. A click on one sends it as your message, and the row reads ✓ and the answer. | The agent anticipates your answers, as it should. |
| 9 | 44.5–53 s | A click on Findings shows two things the agent noticed outside its task: an issue, open with Fix, Discuss and Reply, and an opportunity below it. A click on Fix hands the issue to the agent, and the opportunity opens with Do it, Discuss and Reply. A click on Needs you leads into beat 10. | Your agent has somewhere it can surface issues and opportunities, with next steps. |
| 10 | 53–59.5 s | Back on Needs you, you answer the other question in the chat instead. When the agent replies, the row closes on its own. | Your agent keeps track of what's been completed so it doesn't hang around. |
| 11 | 59.5–75.5 s | The three apps side by side, each labeled. See below. | Same inbox. At home in each app. |
| 12 | 75.5–81.5 s | End card: the streams of light that left beat 11's rows flow across the frame and braid together through the word "inbox", in mono type with a blinking block cursor. The repo's address appears under it. | |

Every beat with footage names its app in a band above the picture: "Claude Code in Terminal", "Claude app" or "Codex in the ChatGPT app". In the VM, Codex runs inside the ChatGPT app, and Pete chose that name for the video. The drawn thread in beats 1 to 6 has no label, since it stands for any agent.

Beat 10 shows an answer typed in the chat. Outside beat 11, the video shows no task only you can do, such as signing in to gh.

The end card shows two lines and nothing else:

```
inbox
github.com/petekp/inbox
```

Reason: a viewer can't type install commands from a video. The repo's README has them.

The streams stand for the noise of the thread, and the braid for the inbox turning it into one signal. The word is lowercase Geist Mono with a block cursor, as typed at a prompt. The background is near-black with a faint violet and magenta bloom behind the word. Pete chose each of these from mocks.

The end card is `launch-video/src/EndCard.tsx`, a WebGL 2 shader. Each stream is three fine threads of light, with each color channel set slightly apart, as light through a prism. The colors are magenta, violet, blue, cyan and amber. A few streams pass close to the lens, large and out of focus, and a few sit far behind. The light has bloom, motion blur, a horizontal lens streak that flares when the braid reaches the word, a slight color fringe toward the frame's edges, film grain and a vignette. Pete chose this look, "Fiber", over wide twisting ribbons. Every frame depends only on its time, so Remotion can render frames in any order.

Rendering needs Chrome's GPU backend. `launch-video/remotion.config.ts` sets it to ANGLE, for the studio and for renders.

### How beats change

No beat changes on a hard cut. Elements enter and leave on their own:

- **Captions** rise in word by word and drop out 0.3 s before their beat ends, so one is gone before the next arrives. In beats 7 to 10 the caption sits in its own band below the footage, so it never covers what it describes.
- **The thread's labels** pop in one after another in beat 3. As beat 4 starts, all but "Unmentioned insight" leave one after another, and that one moves up beside the agent's "Thinking…" line.
- **The drawn thread to the footage.** In beat 7's first 0.35 s, the drawn window shrinks and fades. The terminal arrives as it goes, so the two barely overlap.
- **Footage** dissolves over 0.25 s wherever the take jumps forward, inside a beat or between beats.
- **The camera in beats 7 to 10** frames the part of the window that changes, so the inbox's text reads: a close-up on the inbox in beats 7 and 8, the rows and the reply beside them in beat 9, and the prompt while the answer is typed in beat 10. It pulls back to the whole window at the end of beat 10.
- **The three apps to the end card.** The end card starts 0.8 s before its beat. Each column's rows dim, blur and sink back, left first. As they go, lines of text in the rows light up, one stream to a line. Each starts flat along its line and in focus, then bends away, grows toward both edges and drifts to its own depth. The end card's background fades in under them. `ROW_LINES` in `EndCard.tsx` holds where those lines are, measured from the current footage.
- **Beat 10 to the three apps.** The terminal shrinks from its full frame into the left column over 0.9 s, and its label moves with it. While it moves fastest, it changes from the session take to its own under a brief blur, so two inboxes never show at once at full size. The Claude app lands beside it at 1.23 s and Codex at 1.72 s, each sliding in from the frame's right edge with its label, on the music's beats. They start at the edge so they never cross the shrinking terminal.

Reasons for beat 7: viewers have never seen the inbox, and the drawn thread and the real terminal look alike. So the pane has to be the thing that changes on screen. It arrives on its own, carries its name, and receives the amber mark viewers learned in beats 2 and 3 as "a question you'd miss".

## The side-by-side beat

Three columns, left to right: Claude Code in Terminal, the Claude app, Codex in the ChatGPT app. A label above each column names its app. All three show the same rows, and every click lands on the same frame in all three.

Reason for this order: it moves from the most familiar host to the newest, and puts the two Claude apps next to each other, so the step from terminal to desktop reads as one product in two forms.

| Time in beat | Picture |
| --- | --- |
| 0–2 s | The terminal from beat 10 shrinks into the left column, and the Claude app and Codex slide in beside it. Each window is whole, so the viewer recognizes each app by its chrome. |
| 2–4 s | Each column pushes in to its inbox. The columns appear left to right, 0.3 s apart. |
| 4.3–5.8 s | All three answer the same question with a click on the same frame. The terminal draws the ✓ row in monospace. The desktop app draws it beside native buttons. Codex animates the row closed. In all three the next row opens. |
| 5.8–7.2 s | A click on Findings in all three. It opens the same finding in each. |
| 7.2–13 s | A click back on Needs you at 7.2 s, a click on the same task at 8 s, and a click on Done at 8.9 s. The pointer then moves off the rows, so the next task doesn't light under it. Undo drains in each, drawn the way that app draws it, and the task leaves. |
| 13–15.2 s | Hold on the three settled lists. The caption sits under the middle column. |
| 15.2–16 s | The rows dim and blur as the end card's streams pull out of them. |

What the viewer should take from it: the same rows, in the same order, with the same actions and the same results. Only the drawing differs, and each one matches its app: monospace in the terminal, native buttons in the desktop app, a web panel with motion in Codex.



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

Record each app separately and line the three up in Remotion. `drive.py <app>` reads the beat's click times from the timeline file. The recorder writes the host time of its first frame, and the driver logs each click on the same clock, as Vignette's `media/trailer/record.swift` and `drive.py` do. `cut.py` reports the first frame that changes after each click, which is when its result shows. Each click's lead in the timeline should match it.

## Animatic

The animatic is a Remotion project in `launch-video/`, with its own `package.json`. Remotion renders React components to video frame by frame. Pete bought a Company License for publishing the video. [launch-video-research.md](launch-video-research.md) has the research and the reasons.

- **The timeline** is `launch-video/src/timeline.ts`. It holds each beat's caption, start and length, and each state's time, click and still. It imports `SETTLED_MS` from `hooks/view.ts` and `EXIT_MS` from `codex/src/rows.ts`, so a settled row holds for its real time.
- **The drawn thread** is `src/thread.ts`, for its lines and when each appears, and `src/ThreadView.tsx`, which draws it. Its text is written for the video. Its questions, idea and unmentioned insight are the ones the real session brings to the inbox in beats 7 to 9.
- **The pointer** is `src/Pointer.tsx`.
- **Two variants.** `draft` is the video. `captions-off` is the same with no captions, to check that the pictures carry the story.
- **Stills.** Beat 11 has stills captured from the demo in all three apps. A column whose take is missing shows them instead. A beat with no take and no still draws a placeholder that names its app and state.
- **Where captures live.** Stills are in `launch-video/public/stills/<app>/<state>.png` and clips in `launch-video/public/takes/`. Git ignores both. The window sizes and inbox rectangles in `WINDOWS` are measured from the side-by-side takes, which the stills match within a few pixels. A take at another window size needs them measured again.
- **App labels.** Each app's label is its icon and name. Beats 7 to 10 show it above the footage. In beat 11 it sits just above its window and fades as the camera pushes in. The icons are copied from the installed apps into `launch-video/public/icons/`, which Git ignores, since each is its maker's trademark. Pete checked each maker's brand rules.
- **Looks.** The captions and labels are set in Geist, an open font under the SIL Open Font License, loaded in `src/fonts.ts`. The font files are committed in `public/fonts/` with the license in `OFL.txt`. The drawn thread stays in SF Mono, like the terminal it stands for. Each caption line is white text on its own dark pill, 48 px, centered at the bottom, so it reads muted at the size of a feed. Each column's app label sits in a pill above it. The pointer is the macOS arrow, since all three apps run on a Mac.

To run it, install its tools once with `npm --prefix launch-video ci`. Then:

- `npm --prefix launch-video run studio` opens Remotion Studio, which lists both variants.
- `node launch-video/scripts/check.mjs` prints the caption report, the states each beat cuts off and any missing stills.
- `node launch-video/scripts/check.mjs --render <variant>` also renders the variant to `launch-video/out/` and writes the checks below.

The agent checks each render:

- ffprobe: 1920×1080, 60 fps, and the frame count the timeline gives.
- A caption report: each caption lasts at least 2 s, reads at no more than 20 characters per second, and overlaps no other.
- Stills at every click and every caption's first and last frame, read back.
- A contact sheet of one frame per second.

## The draft

The draft is `launch-video/out/draft.mp4`, 81.5 seconds. The first draft, which told the earlier story, is kept beside it as `out/draft-1.mp4`. To render the draft again, run:

    node launch-video/scripts/check.mjs --render draft

- **Beats 1 to 6** are the drawn thread.
- **Beats 7 to 10** replay one session take in Claude Code, clicked with `act.py`.
- **Beat 11** replays three side-by-side takes, clicked with `drive.py`. In each app, every result shows within about 0.15 s after the drawn click.
- **Watch the render, not Studio.** Studio's preview in the terminal browser draws the takes black. The same browser plays each clip when it is opened on its own.
- **The takes show main's inbox at `f75d5c4`,** which isn't released yet, with the AR demo rows from `hooks/demo.ts` in the `video-ar` worktree. All four takes were recorded on 2026-10-15 with that build in all three apps, its files checked by hash.

### How it is made

The tools are in `launch-video/record/`. The takes are in `launch-video/takes/` and the cut clips in `launch-video/public/takes/`. Git ignores both.

**Every capture uses the newest build from main**, including changes not yet released. Before each recording session, build from main's HEAD and install it in the VM for Claude Code, the Claude app and Codex. Check that each app runs that commit, and note the commit beside the take. Takes recorded on an older build showed fixed bugs and had to be recorded again. Claude Code's GitHub install now updates only when `version` in `.claude-plugin/plugin.json` goes up, so it won't pick up unreleased commits. Copy main's files over the VM's installed copy instead, and compare their hashes with main's. Main at `f75d5c4` puts each key letter inside its button on every terminal row, and draws the inline pane's tabs in a column at its left from 80 columns. Takes from before it look different.

1. **The demo without its notices.** In Claude Code and the Claude app, run `/inbox demo recording`. In Codex, build the tab with `INBOX_DEMO_RECORDING=1` in the VM's copy, then press Show demo. Either way the demo shows no notice line, no "Demo:" prefix and no Hide demo. Never commit `plugin/dist` from that build. The VM needs a build of the inbox with this mode, which isn't released yet.
2. **The recorder.** `record.swift`, compiled to `out/record`, records the VM's window with ScreenCaptureKit and writes the host time of its first frame. A change in the VM shows in the recording within about 30 ms, with no pointer movement needed.
3. **The hand.** `hand.js` runs in the VM, reads commands over one SSH connection, and posts each key or click within a few milliseconds.
4. **Beat 11.** `drive.py <app>` plays the timeline's clicks for one app and logs them. Each click goes early by its lead, so its result shows on time. The leads in `LEADS` are measured from the takes. They differ between takes by up to 0.1 s, so read the frames around each click after a take. Start each take from a fresh demo, and wait about 5 s for the sample's answered row to settle:
   - **Claude Code.** `/inbox demo recording` turns the demo off. Run it again to start fresh.
   - **The Claude app.** Start a new session and send one message. Then send `/inbox demo recording`. As a session's first message, `/inbox` is not recognized as a command.
   - **Codex.** The demo lives in the server's memory, one per conversation. Quit and reopen the ChatGPT app to start fresh, then press Show demo in the same conversation. Each launch reinstalls the inbox from GitHub over the copied build, so copy the recording build in again after the app opens and before opening the Inbox tab. A tab without Show demo is running the release.
   - **Pane sizes.** Each app's inbox rows are about 1040 clip pixels wide and 1390 high. The Claude app window is 1024 by 605 points with its pane dragged wider, and the ChatGPT window is 1024 by 607 points with its panel dragged to match. `hand.js` has a `drag` command for the pane edges, and System Events sets a window's size.
5. **Beats 7 to 10.** They come from a real Claude Code session on Haiku, in a sample project in the VM, `~/visor`, an agent you wear in AR glasses. The Claude app has a `visor` environment for it, and Codex a `visor` project. `act.py` sends each command and logs it on the recorder's clock. The project's settings deny Claude Code's question dialog, so Claude asks in its reply and the inbox records the question.
   - **Before the take,** a setup prompt seeds the inbox with a question and findings: "Read src/glances.js and src/gaze.js. Don't change code yet. Ask me one question: should glances follow my head, or stay pinned where I leave them? If you notice a bug, or a chance to improve something, in those two files, record it as a finding." The two files hold one planted bug, in the gaze dwell timer, and one slow spot, the sort in `frame()`. With these files the setup gave one issue and one opportunity. Earlier versions of the files gave extra issues, so check the Findings count after the setup turn.
   - **The take's prompt** is "Rename onTap to onPinch in src/gestures.js and its callers, keeping onTap as an alias for now. Run the tests, summarize the change file by file, then ask me whether to keep the alias for one release." When the prompt asked the question first, the agent answered it itself and no question arrived.
   - **Click the prompt before typing.** The inbox pane keeps focus after a click in it, and a typed letter there presses the answer with that key.
6. **The cut.** `cut.py` crops a take to its app window, resamples it to 60 fps, covers the Codex account picture, and writes the clip's size and window to `src/takes.json`.

### After a new take

- After any new beat 11 take, measure the rows' lines of text in the frame at 74.5 s and update `ROW_LINES` in `launch-video/src/EndCard.tsx`, so each stream still starts on a line.

## Review of the second draft, 2026-10-15

Claude checked frames of the second draft against all of Pete's feedback. The second draft is kept as `out/draft-2.mp4`. Each finding below has what changed in the third draft, `out/draft.mp4`.

| # | Finding in the second draft | What changed |
| --- | --- | --- |
| 1 | The two-line caption in beats 9 and 10 covered the opportunity's buttons and the prompt. | Captions under footage sit in their own band below the picture. |
| 2 | Beats 8 to 10 showed the whole window, so the inbox's text was about 9 px tall. | The camera frames the part that changes. |
| 3 | Beat 10's row showed ✓ and never left, under "so it doesn't hang around". | The take jumps ahead so the row leaves on screen. |
| 4 | The terminal's title read "caffeinate", and beat 11's terminal showed the `/inbox demo recording` command and its reply. | The cut covers both. |
| 5 | Beat 10 to 11 cross-faded two inboxes at full size, then showed the terminal alone in a mostly black frame. | The take changes under a brief blur, and the other apps arrive while the terminal shrinks. |
| 6 | After Done, the pointer rested on the next task's Done, so all three apps lit it. | The pointer moves off the rows after Done, in the takes and in the drawn pointer. |
| 7 | The end card's flare washed out "inbox", and the address read for about 1.5 s. | The braid dims behind the word, and the address shows for about 3 s. |
| 8 | The terminal lit a hovered row before the drawn pointer reached it. | The drawn pointer arrives when the take's pointer did, 0.3 to 0.9 s before each click. |
| 9 | The checkout sample app was dry. | The sample is Visor, an agent you wear in AR glasses, in all four takes and the drawn thread. |
| 10 | The prompt's grey suggestion showed the answer before the inbox did. | The session take turns prompt suggestions off in the project's settings. |
| 11 | The first 0.6 s is black. | Unchanged. X lets the poster frame be chosen. |
| 12 | Each jump in a take dissolved two sharp scrolls of the same text over each other. | Both layers blur briefly while they overlap. |

## Music

The music is "Focus Flow", minimal 4/4 IDM at about 123 BPM, made by Pete in Suno. A bar is 1.95 s. The track starts on the video's first frame, from 0.4 s into the track, so the track's own shape follows the story:

- **Beat 1:** the track's strong hits land at 0.6 s and at 4.45 s, as the agent replies.
- **Beats 2 to 6:** it builds slowly as the replies pile up.
- **Beat 7, at 31 s:** the full groove comes in as the inbox first appears.
- **Beat 10, from 56.4 s:** it breaks down.
- **Beat 11, at 62.2 s:** the groove comes back as the three apps push in.
- **The end card:** it fades out over the last 4 s.

`MUSIC` in `launch-video/src/timeline.ts` holds the file, both offsets and the fade. A beat before beat 7 that gets longer or shorter moves the picture against the track, so `startsAt` has to move by the same amount, and beat 1's send with it, to keep the reply on its hit. The file is `launch-video/public/music/focus-flow.mp3`, and Git ignores that folder, because the track is for the post and not for sharing in this repo.

Suno's terms grant commercial use only on a paid plan. Pete confirmed the track was made on one.

## Open decisions

1. **The PR beat and the Fix beat.** Both are out of this draft. The story is about the conversation, and the new opening added 20 seconds. Either can come back.
