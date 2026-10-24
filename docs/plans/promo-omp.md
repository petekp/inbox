# omp promo video

Status: building. The render is `videos/out/omp.mp4`, 46.9 s, paced to the launch video. Pete approved the captions. The length, format, music, label and sample project use the defaults below until Pete decides them.

A 47-second video that premieres the inbox in omp, a terminal coding agent. It shows one real omp session: the agent asks a question and notices an issue, both land above the prompt, and you answer and hand off the issue with single keys. It has no voiceover. Short captions carry the words, so it works muted in a feed.

It uses the launch video's visual language: an app band above the picture, captions in their own band below it, the end card with the word "inbox" and the repo's address, and the same type. It is the `omp` video in `videos/`, the Remotion project the launch video also lives in. [videos/README.md](../../videos/README.md) describes the shared parts.

## The story

You start omp in a project and ask for a change: "Read src/gaze.js and src/glances.js, then fade a glance out when I look away from it. Ask me how fast first." The agent reads both files and asks how long the fade should take. It also noticed a bug on the way: looking away never resets the gaze dwell timer. The line above omp's prompt changes from "Nothing needed" to "Needs you 1 · Findings 1".

You type `/inbox`. The panel opens over the session with the question at the top and its answers ready, the recommended one already selected. One Enter answers it. The row reads ✓ and your answer, and omp sends the answer as your message, so the agent starts working under the panel. Tab switches to Findings, where the bug waits with Fix, Discuss and Reply. One Enter on Fix hands it to the agent, and omp queues that message after the running turn.

You close the panel. The line above the prompt reads "Nothing needed". The agent has built the fade, and is fixing the dwell timer in `gaze.js`.

Reasons for these choices:

- **The news first.** A feed viewer decides in about two seconds whether to keep watching. The first caption says what is new, over omp's own screen, so omp users recognize it at once.
- **No problem-setup opening.** The launch video spent 31 seconds on why a thread is hard to track. A short premiere can't, and its audience may have seen the launch video. The question arriving from a real reply carries the same point in a few seconds.
- **A real session, not the demo.** The point is that the answer reaches the agent and the agent acts, as in the launch video's beats 7 to 10. The demo's presses send nothing, and it shows "Sample entries. Presses send nothing." under the rows.
- **Keys on screen instead of a pointer.** omp's panel takes keys only. A keycap appears for each key as it is pressed, so a viewer who knows no omp keys sees what caused each change. The times come from the take's own key log.
- **The question and one finding, nothing else.** Each beat shows one thing changing. The PRs tab and Undo are left out to keep it short.

## Beats

Each caption stays on screen at least 2 seconds. "Take" is the time in the session take each beat plays from.

The pace matches the launch video's, which Pete approved, or is slower:

- Each beat's first key comes 1.4 s or more after its caption rises in, so a caption never changes with the key it describes.
- Typing shows at a readable pace: the prompt at the take's own 17.8 characters a second, as the launch video types, and `/inbox` slowed to 8.
- A panel holds 4 s before the key that acts on it, so the viewer reads the question or issue and sees what is selected.
- Each result holds 1.5 s or more before the beat moves on.

| # | Time | Take | Picture | Caption |
| --- | --- | --- | --- | --- |
| 1 | 0–9.3 s | 6.6 s | The terminal window rises in, labeled "omp" in the band above it, under omp's logo. After 1.6 s the prompt is typed. Enter sends it, and "Working…" shows. | Inbox is now in omp. |
| 2 | 9.3–17.5 s | 16, 18.4 and 30.3 s | The agent works. The take jumps through its reading under brief dissolves, holding 2 s on "Read (2)". The camera pushes in on the line above the prompt. Then the agent records the question and the issue, the line changes to "Needs you 1 · Findings 1", and the reply ends. | Questions are easy to miss in a long reply. Inbox keeps them above your prompt. |
| 3 | 17.5–27.1 s | 67.6 s | You type `/inbox`, and it holds with omp's suggestion under it. Enter opens the panel with the question open, its answers in a row and "300 ms" selected. It holds 4 s. Enter answers it. The row reads ✓ 300 ms, and the agent starts working above the panel. | Each comes with answers. Enter sends the selected one. |
| 4 | 27.1–35.1 s | 88.4 s | Tab switches to Findings. The issue is open, with its description and Fix, File issue, Reply, Explain, Discuss and Dismiss, and holds 4 s. Enter on Fix hands it to the agent. The row closes, then reads "Queued: Fix". | Bugs your agent spots wait there too. One more key asks for the fix. |
| 5 | 35.1–40.9 s | 106.5 s | Esc closes the panel. The line above the prompt reads "Nothing needed", and the agent edits `gaze.js`. The camera pulls back to the whole window. | Nothing waits on you. Your agent is on both. |
| 6 | 40.9–46.9 s | | The end card: streams of light leave the window's lines and braid through "inbox", with `github.com/petekp/inbox` under it. | |

The end card starts 0.8 s before its beat, over beat 5's last moments, as in the launch video. It runs 6 s, so the address reads for about 3 s.

The end card shows the same two lines as the launch video's and no install command, since a viewer can't type one from a video. The repo's README has the omp install steps.

### How beats change

As in the launch video, no beat changes on a hard cut:

- **Captions** rise in word by word in the band below the picture and leave 0.3 s before their beat ends.
- **The take** dissolves over 0.25 s wherever it jumps forward, so the agent's working time is skipped. Where a panel waits still for a key, the take speeds up instead, so the panel shows no cut.
- **The camera** frames the part that changes: omp's start screen and prompt in beat 1, the agent's steps and then the line above the prompt in beat 2, the panel in beats 3 and 4, and the whole window at the end of beat 5.
- **Keycaps** rise in at the bottom right of the picture as each key is pressed and fade after 0.6 s. Typed text shows as one cap, such as `/inbox`, which stays up until the next key. The prompt's letters get no cap, since the prompt shows them.

## Picture

- **One 16:9 master,** 1920 by 1080 at 60 fps. The cut's size is a setting in the video's timeline, so a 9:16 or square cut is a second entry in `VIDEO.cuts`.
- **The terminal is drawn from the take,** not filmed. `videos/record/term.py` records omp headless in a private tmux server: every screen with its colors, and every key, on one clock. `TerminalTake` draws each screen cell by cell in omp's own colors. The text stays sharp at any push-in, which matters because a feed shows the video small. The window around it is drawn: a dark macOS title bar with the three buttons and the title "visor — omp".
- **The font** is Menlo, Terminal.app's default, at 20 px, pushed in to about 30 px. Glyphs it lacks, such as 📁 in omp's status line, come from the system's fallback fonts. Each such glyph is drawn centered in its own cells, so the columns stay aligned.
- **The terminal is 100 columns by 30 rows,** wide enough that the panel's rows don't wrap, and short enough that the whole window fits above the caption band at a readable size.
- **omp's dark theme,** as omp starts by default.

## Recording

The take is `videos/takes/omp/session.term.jsonl`, which Git ignores. `session.build.txt` beside it records the build.

- **Build.** Main at `f7b6287`, the newest commit on 2026-10-24, in a worktree at that commit. omp 18.12.3 loaded its committed `omp/dist/host.js`, which `npm --prefix omp run check` confirmed matches its sources.
- **No screen.** `videos/record/term.py` ran omp in a private tmux server that draws nowhere. Keys went in through `term.py`'s stdin as each screen was ready, and the cut skips the agent's working time.
- **A fresh HOME.** `videos/record/omp-take.sh` started omp with `HOME` set to a fresh folder in `~/Library/Caches/`, under `sandbox-exec` as the agent evals run omp. omp read none of Pete's omp settings and wrote nothing to his inbox. Its config turned off the setup wizard, the update notice and omp's Ask tool. The folder sits outside the temp folders, which omp marks as scratch with a 🗑 and a long path, and outside any repo. The project sits at `~/Projects/visor`, which omp shows as "📁 visor".
- **The model.** omp signed in with Pete's Claude sign-in through `ANTHROPIC_OAUTH_TOKEN` from `omp token anthropic`, as the agent evals do. The agent ran on Opus 5.5 at high thinking. The inbox model was Sonnet 5.5, which omp picks when the providers offer it.
- **The project.** Visor's three source files and a test, written again here, since the `inbox-ui` VM that holds the launch video's copy was stopped and another delegate was waiting for it. `gaze.js` holds the launch video's planted bug: looking away never resets the dwell timer.
- **The cut.** `cut.py omp session --redact …` wrote the screens and keys to `public/omp/takes/session.json`. The agent's smoke test printed the project's full path, which holds Pete's user name, so the cut shows it as `~/Projects/visor`. No screen in the clip holds the user name.

What it took:

1. With omp's Ask tool on, the agent asked in an omp dialog as well as the inbox, and the dialog blocked the turn. The config now turns the tool off, as the launch video's take turned off Claude Code's question dialog.
2. Three takes on Sonnet 5.5 asked the question but recorded no finding, also with the prompt naming both files. On Opus 5.5 the agent read `gaze.js`, noticed the dwell timer, and recorded it as an issue.

## Music

The render uses "Focus Flow", the launch video's track, from where its full groove comes in, 31.4 s into the track, so the two videos sound like one series. It fades out over the last 4 s. A new track from Pete is the other option, and needs only a new `MUSIC` in `videos/src/omp/timeline.ts`.

## Open decisions

1. **The length.** 46.9 seconds, at the launch video's pace. A shorter cut could keep beats 1, 3 and 6.
2. **The format.** One 16:9 master first, with a 9:16 cut later for Reels, Shorts and TikTok.
3. **The music.** See above.
4. **The app label.** "omp" alone, as rendered, or omp's logo beside it. omp ships no app icon, and its logo is its maker's mark, so it would go in `public/icons/`, which Git ignores, after checking omp's brand rules.
5. **The sample project.** Written again here for this take. A take with the VM's copy would need the VM.
