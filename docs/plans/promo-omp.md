# omp promo video

Status: planned. Waiting for Pete to approve the story and captions before recording.

A 30-second video that premieres the inbox in omp, a terminal coding agent. It shows one real omp session: the agent asks a question and notices an issue, both land above the prompt, and you answer and hand off the issue with single keys. It has no voiceover. Short captions carry the words, so it works muted in a feed.

It uses the launch video's visual language: an app band above the picture, captions in their own band below it, the end card with the word "inbox" and the repo's address, and the same type. It is the `omp` video in `videos/`, the Remotion project the launch video also lives in. [videos/README.md](../../videos/README.md) describes the shared parts.

## The story

You start omp in a project and ask for a change. The agent works, then asks you a question in its reply. It also noticed a bug on the way. The line above omp's prompt changes from "Nothing needed" to "Needs you 1 · Findings 1".

You type `/inbox`. The panel opens over the session with the question at the top and its answers ready, the recommended one already selected. One Enter answers it. The row reads ✓ and your answer, and omp sends the answer as your message, so the agent starts working under the panel. Tab switches to Findings, where the bug waits with Fix, Discuss and Reply. One Enter on Fix hands it to the agent, and omp queues that message after the running turn.

You close the panel. The agent is already working on your answer, with the fix next, and the line above the prompt reads "Nothing needed" again.

Reasons for these choices:

- **The news first.** A feed viewer decides in about two seconds whether to keep watching. The first caption says what is new, over omp's own screen, so omp users recognize it at once.
- **No problem-setup opening.** The launch video spent 31 seconds on why a thread is hard to track. A 30-second premiere can't, and its audience may have seen the launch video. The question arriving from a real reply carries the same point in a few seconds.
- **A real session, not the demo.** The point is that the answer reaches the agent and the agent acts, as in the launch video's beats 7 to 10. The demo's presses send nothing, and it shows "Sample entries. Presses send nothing." under the rows.
- **Keys on screen instead of a pointer.** omp's panel takes keys only. A keycap appears for each key as it is pressed, so a viewer who knows no omp keys sees what caused each change. The times come from the take's own key log.
- **The question and one finding, nothing else.** Each beat shows one thing changing. The PRs tab and Undo are left out to keep it to 30 seconds.

## Beats

Times are targets. Each caption stays on screen at least 2 seconds.

| # | Time | Picture | Caption |
| --- | --- | --- | --- |
| 1 | 0–4 s | A terminal window rises in, labeled "omp" in the band above it. omp's prompt sits at the bottom, with the inbox line above it reading "Nothing needed". You type a short prompt and send it. | Inbox is now in omp. |
| 2 | 4–10 s | The agent works. The take jumps through its tool calls under brief dissolves. Its reply ends with a question, which gets the amber Question mark from the launch video. The camera pushes in on the line above the prompt as it changes to "Needs you 1 · Findings 1". | Your agent's questions and findings wait above your prompt. |
| 3 | 10–16 s | You type `/inbox` and press Enter. The panel opens with the question open, its answers in a row and the recommended one selected. The camera frames the question. Enter answers it. The row reads ✓ and the answer, and the agent's reply starts streaming under the panel. | Answer with one key. The agent gets it as your message. |
| 4 | 16–21 s | Tab switches to Findings. The issue is open, with its description and Fix, Discuss, Reply, Explain and Dismiss. Enter on Fix hands it to the agent, and the row closes. omp queues the fix after the running turn. | Issues your agent notices come with next steps. |
| 5 | 21–24 s | Escape closes the panel. The agent is already working on your answer, and the queued fix shows under the prompt. The line above the prompt reads "Nothing needed". | Your agent keeps working with your answer. |
| 6 | 24–30 s | The end card: streams of light leave the lines of the agent's reply and braid through "inbox", with `github.com/petekp/inbox` under it. | |

The end card starts 0.8 s before its beat, over beat 5's last moments, as in the launch video. It runs 6 s, so the address reads for about 3 s.

The end card shows the same two lines as the launch video's and no install command, since a viewer can't type one from a video. The repo's README has the omp install steps.

### How beats change

As in the launch video, no beat changes on a hard cut:

- **Captions** rise in word by word in the band below the picture and leave 0.3 s before their beat ends.
- **The take** dissolves over 0.25 s wherever it jumps forward, so the agent's working time is skipped.
- **The camera** frames the part that changes: the prompt in beat 1, the reply's question and the line above the prompt in beat 2, the open row in beats 3 and 4, and the whole window in beat 5.
- **Keycaps** rise in at the bottom right of the picture as each key is pressed and fade after 0.6 s. Typed text shows as one cap, such as `/inbox`.

## Picture

- **One 16:9 master,** 1920 by 1080 at 60 fps. The cut's size is a setting in the video's timeline, so a 9:16 or square cut is a second entry in `VIDEO.cuts`.
- **The terminal is drawn from the take,** not filmed. `videos/record/term.py` records omp headless in a private tmux server: every screen with its colors, and every key, on one clock. `TerminalTake` draws each screen cell by cell in omp's own colors. The text stays sharp at any push-in, which matters because a feed shows the video small. The window around it is drawn: a dark macOS title bar with the three buttons and the title "visor — omp".
- **The font** is Menlo, Terminal.app's default. Glyphs it lacks, such as 🗑 in omp's status line, come from the system's fallback fonts. Each such glyph is drawn centered in its own cells, so the columns stay aligned.
- **The terminal is 100 columns by 30 rows,** wide enough that the panel's rows don't wrap, and short enough that the whole window fits above the caption band at a readable size.
- **omp's dark theme,** as omp starts by default.

## Recording

- **Build.** The newest build from main. omp loads the inbox with `omp -e <main checkout>/omp/dist/host.js`, and the commit is noted beside the take.
- **A fresh HOME.** omp runs with `HOME` set on its command to a fresh folder, so it reads none of Pete's omp settings and writes nothing to his inbox. The folder gets `setupVersion: 2` in `.omp/agent/config.yml` first, which skips omp's setup wizard. The wizard's sign-in step opens a browser on this Mac. omp's "Update Available" notice and startup tip are turned off in the same config, if omp has settings for them, or the take starts after `/clear`.
- **The model.** omp signs in with Pete's Claude sign-in through `ANTHROPIC_OAUTH_TOKEN` from `omp token anthropic`, as the agent evals do. The agent runs on Sonnet. The inbox model is then Sonnet too, which omp picks when the providers offer it.
- **The project.** A copy of the Visor sample project from the launch video, with its planted dwell-timer bug, so the issue the agent finds is the one the launch video shows. The VM holds the project at `~/visor`. Copying it needs one read over SSH from the `inbox-ui` VM, which another session is using, so the coordinator decides when. The alternative is to write the three files again here.
- **The take.** One continuous take. A setup turn first asks the agent to read the files and record any bug it finds, as the launch video's setup prompt did. The take's prompt asks for a change and ends by asking one question. Keys are sent live through `term.py`'s stdin, so each lands when the screen is ready, and the cut skips the agent's working time.
- **To confirm in the take.** The panel stays open and drawn while a reply streams under it. The line above the prompt updates when the panel closes during a turn. The queued fix shows under omp's prompt. If any of these differs, beats 3 to 5 change to match what omp does.
- **The cut.** `cut.py omp <take>` writes the screens and keys to `public/omp/takes/`. The beats then name the stretches of the take they show, as the launch video's beats 7 to 10 do.

Nothing in the recording uses Pete's screen or the VM. tmux runs headless.

## Music

To choose. Two options:

1. **"Focus Flow" again,** from the point where its full groove comes in, 31 s into the launch video. The two videos then sound like one series. `MusicCue` takes the start point.
2. **A new track** from Pete.

## Open decisions

1. **The captions and the story above.**
2. **The length.** 30 seconds. A 15-second cut could keep beats 1, 3 and 6.
3. **The format.** One 16:9 master first, with a 9:16 cut later for Reels, Shorts and TikTok.
4. **The music.** See above.
5. **The app label.** "omp" alone, or omp's logo beside it. omp ships no app icon, and its logo is its maker's mark, so it would go in `public/icons/`, which Git ignores, after checking omp's brand rules.
6. **The sample project.** Copy Visor from the VM, or write it again here.
