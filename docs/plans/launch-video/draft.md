# Launch video: the draft, its review and the music

Part of [the launch video plan](../launch-video.md).

Status: built.

## The draft

The draft is 81.5 seconds. Renders made before the project moved to `videos/` are in `launch-video/out/` of the checkout that made them: the draft as `draft.mp4`, and the first draft, which told the earlier story, as `draft-1.mp4`. To render the draft again, to `videos/out/launch.mp4`, run:

    node videos/scripts/check.mjs --render launch

- **Beats 1 to 6** are the drawn thread.
- **Beats 7 to 10** replay one session take in Claude Code, clicked with `act.py`.
- **Beat 11** replays three side-by-side takes, clicked with `drive.py`. In each app, every result shows within about 0.15 s after the drawn click.
- **Watch the render, not Studio.** Studio's preview in the terminal browser draws the takes black. The same browser plays each clip when it is opened on its own.
- **The takes show main's inbox at `f75d5c4`,** which isn't released yet, with the AR demo rows from `hooks/demo.ts` in the `video-ar` worktree. All four takes were recorded on 2026-10-15 with that build in all three apps, its files checked by hash.

### How it is made

The tools are in `videos/record/`. The takes are in `videos/takes/launch/` and the cut clips in `videos/public/launch/takes/`. Git ignores both.

**Every capture uses the newest build from main**, including changes not yet released. Before each recording session, build from main's HEAD and install it in the VM for Claude Code, the Claude app and Codex. Check that each app runs that commit, and note the commit beside the take. Takes recorded on an older build showed fixed bugs and had to be recorded again. Claude Code's GitHub install now updates only when `version` in `.claude-plugin/plugin.json` goes up, so it won't pick up unreleased commits. Copy main's files over the VM's installed copy instead, and compare their hashes with main's. Main at `f75d5c4` puts each key letter inside its button on every terminal row, and draws the inline pane's tabs in a column at its left from 80 columns. Takes from before it look different.

1. **The demo without its notices.** In Claude Code and the Claude app, run `/inbox demo recording`. In Codex, build the tab with `INBOX_DEMO_RECORDING=1` in the VM's copy, then press Show demo. Either way the demo shows no notice line, no "Demo:" prefix and no Hide demo. Never commit `plugin/dist` from that build. The VM needs a build of the inbox with this mode, which isn't released yet.
2. **The recorder.** `record.swift`, compiled to `out/record`, records the VM's window with ScreenCaptureKit and writes the host time of its first frame. A change in the VM shows in the recording within about 30 ms, with no pointer movement needed.
3. **The hand.** `hand.js` runs in the VM, reads commands over one SSH connection, and posts each key or click within a few milliseconds.
4. **Beat 11.** `drive.py launch side-by-side <app>` plays the timeline's clicks for one app and logs them. Each click goes early by its lead, so its result shows on time. The leads in `LEADS` are measured from the takes. They differ between takes by up to 0.1 s, so read the frames around each click after a take. Start each take from a fresh demo, and wait about 5 s for the sample's answered row to settle:
   - **Claude Code.** `/inbox demo recording` turns the demo off. Run it again to start fresh.
   - **The Claude app.** Start a new session and send one message. Then send `/inbox demo recording`. As a session's first message, `/inbox` is not recognized as a command.
   - **Codex.** The demo lives in the server's memory, one per conversation. Quit and reopen the ChatGPT app to start fresh, then press Show demo in the same conversation. Each launch reinstalls the inbox from GitHub over the copied build, so copy the recording build in again after the app opens and before opening the Inbox tab. A tab without Show demo is running the release.
   - **Pane sizes.** Each app's inbox rows are about 1040 clip pixels wide and 1390 high. The Claude app window is 1024 by 605 points with its pane dragged wider, and the ChatGPT window is 1024 by 607 points with its panel dragged to match. `hand.js` has a `drag` command for the pane edges, and System Events sets a window's size.
5. **Beats 7 to 10.** They come from a real Claude Code session on Haiku, in a sample project in the VM, `~/visor`, an agent you wear in AR glasses. The Claude app has a `visor` environment for it, and Codex a `visor` project. `act.py` sends each command and logs it on the recorder's clock. The project's settings deny Claude Code's question dialog, so Claude asks in its reply and the inbox records the question.
   - **Before the take,** a setup prompt seeds the inbox with a question and findings: "Read src/glances.js and src/gaze.js. Don't change code yet. Ask me one question: should glances follow my head, or stay pinned where I leave them? If you notice a bug, or a chance to improve something, in those two files, record it as a finding." The two files hold one planted bug, in the gaze dwell timer, and one slow spot, the sort in `frame()`. With these files the setup gave one issue and one opportunity. Earlier versions of the files gave extra issues, so check the Findings count after the setup turn.
   - **The take's prompt** is "Rename onTap to onPinch in src/gestures.js and its callers, keeping onTap as an alias for now. Run the tests, summarize the change file by file, then ask me whether to keep the alias for one release." When the prompt asked the question first, the agent answered it itself and no question arrived.
   - **Click the prompt before typing.** The inbox pane keeps focus after a click in it, and a typed letter there presses the answer with that key.
6. **The cut.** `cut.py` crops a take to its app window, resamples it to 60 fps, covers the Codex account picture, and writes the clip's size and window to `videos/src/launch/takes.json`.

### After a new take

- After any new beat 11 take, measure the rows' lines of text in the frame at 74.5 s and update `ROW_LINES` in `videos/src/launch/timeline.ts`, so each stream still starts on a line.

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

`MUSIC` in `videos/src/launch/timeline.ts` holds the file, both offsets and the fade. A beat before beat 7 that gets longer or shorter moves the picture against the track, so `startsAt` has to move by the same amount, and beat 1's send with it, to keep the reply on its hit. The file is `videos/public/music/focus-flow.mp3`, and Git ignores that folder, because the track is for the post and not for sharing in this repo.

Suno's terms grant commercial use only on a paid plan. Pete confirmed the track was made on one.
