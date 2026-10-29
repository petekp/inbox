# omp promo video

Status: built. The render is `videos/out/omp.mp4`, 56.3 s, with Pete's approved captions, recorded on #126's head so omp shows the person a line under each `record` and `close` call. It is a 16:9 master; a 9:16 cut is not made yet.

A 56-second video that premieres the inbox in omp, a terminal coding agent. It shows one real omp session: the agent asks a question and notices an issue, both land above the prompt, and you answer and hand off the issue with single keys. It has no voiceover. Short captions carry the words, so it works muted in a feed.

It uses the launch video's visual language: an app band above the picture, captions in their own band below it, the end card with the word "inbox" and the repo's address, and the same type. It is the `omp` video in `videos/`, the Remotion project the launch video also lives in. [videos/README.md](../../videos/README.md) describes the shared parts.

## The story

You start omp in a project and ask for a change: "Read src/gaze.js and src/glances.js. Fade out a glance I look away from. Ask how fast first." The agent reads both files and asks how long the fade should take. It also noticed a bug on the way: looking away doesn't reset the look timer, so looking back at a glance selects it at once. Under each of its two `record` calls, omp shows what it added to the inbox, and the line above omp's prompt changes from "Nothing needed" to "Asks 1 · Finds 1".

You type `/inbox`. The panel opens below the session with the question at the top and its answers ready, the recommended one already selected. One Enter answers it. The row reads ✓ and your answer, and omp sends the answer as your message, so the agent starts working. Tab switches to Finds, where the bug waits with Fix, File issue, Reply, Explain, Discuss and Dismiss. One Enter on Fix hands it to the agent, and omp queues that message after the running turn.

You close the panel. The line above the prompt reads "Nothing needed", and the agent is building the fade. Once the fade is done, the agent takes the queued fix, fixes `gaze.js` and closes the finding. omp shows "Closed: Looking back at a glance selects it instantly" under the call.

Reasons for these choices:

- **The news first.** A feed viewer decides in about two seconds whether to keep watching. The first caption says what is new, over omp's own screen, so omp users recognize it at once.
- **No problem-setup opening.** The launch video spent 31 seconds on why a thread is hard to track. A short premiere can't, and its audience may have seen the launch video. The question arriving from a real reply carries the same point in a few seconds.
- **A real session, not the demo.** The point is that the answer reaches the agent and the agent acts, as in the launch video's beats 7 to 10. The demo's presses send nothing, and it shows "Sample entries. Buttons here send nothing." under the rows.
- **Keys on screen instead of a pointer.** omp's panel takes keys only. A keycap appears for each key as it is pressed, so a viewer who knows no omp keys sees what caused each change. The times come from the take's own key log.
- **The question and one finding, nothing else.** Each beat shows one thing changing. The PRs tab and Undo are left out to keep it short.

## Keeping the eye on the inbox

The first version moved too much, and the inbox was often a dim line in a corner while larger text moved elsewhere. The movement came from:

- camera moves stacked on dissolves and scrolls
- omp's 12-row command menu
- the panel changing height between tabs
- the agent's tool output streaming above the panel
- a pull-back over scrolling text

Counted frame by frame, before the end card:

| Version | Changes | Changes over 3% of the frame | Total change, summed over frames |
| --- | --- | --- | --- |
| First | 48 | 30 | 21.4 |
| This one | 38 | 13 | 3.1 |

Every big change left is a real UI event: the prompt sent, the agent's records and reply, the `/inbox` menu, the panel opening, Tab, Fix and Esc. Most small ones while the issue is open are the agent's thinking and edit streaming, dimmed, above the panel.

- **One framing, held still.** The terminal is 100 by 20 instead of 100 by 30, so the whole window fits the picture at about 29 px, close to the first version's push-ins. The camera never moves.
- **Two jumps.** The take dissolves twice: in beat 2, past the agent's thinking, and at the end of beat 5, to the agent closing the finding it fixed. Everywhere else it plays straight through. It runs slower or faster only where the screen doesn't change: the start screen, the 33 s between the reply and `/inbox`, the panel's holds after the answer and after Fix, and the last frame.
- **The inbox is the only bright thing.** While the panel is open, the session above it dims. When the band changes, everything but the band dims for about 2.5 s: under the first caption, when the agent records both items, and after Esc. The dim lays the terminal's background over the other rows at 78%. The rows that stay bright come from the screen the take shows at that moment.
- **A calmer take.** The prompt fits one line, so the input box doesn't grow while it is typed. `/inbox` goes in as one burst, so omp's command menu shows once, with two rows. Tab comes about 2 s after the answer lands. While the issue is open, the agent's thinking and then its edit stream above the panel, dimmed.
- **Keycaps beside the caption.** Keycaps sit at the right end of the caption band. In a beat with keycaps, the caption keeps 320 px from each side, so a long one wraps before it reaches them. Neither covers the panel.

Before the take, the inbox itself changed six things in omp:

- The panel keeps its height while it is open.
- The panel has a rule above its tabs.
- An answered row stays until you leave the tab.
- The band's labels are bright.
- A press on a busy agent shows no ✓ before the agent takes its message.
- A `record` or `close` call shows one line written for the person, such as "Question: …" or "Closed: …", in place of the answer written for the agent.

## Beats

Each caption stays on screen at least 2 seconds. "Take" is the time in the session take each beat plays from.

The pace matches the launch video's, which Pete approved, or is slower:

- Each beat's first key comes 1.45 s or more after its caption rises in, so a caption never changes with the key it describes.
- The prompt is typed at the take's own pace, about 15 characters a second.
- The question panel holds 8.5 s before Enter: its question, four answers and an Open step.
- The issue panel holds 5.6 s before Enter on Fix, long enough to read the issue's title and see Fix selected.
- Each result holds 1.55 s or more before the next caption.

| # | Time | Take | Picture | Caption |
| --- | --- | --- | --- | --- |
| 1 | 0–10.2 s | 1.7 s | The terminal window rises in, with omp's logo and name in the band above it. The band's "Nothing needed" is spotlit. After 2.7 s the prompt is typed. Enter sends it, and "Working…" shows. | Inbox now supports omp (oh-my-pi)! |
| 2 | 10.2–19.5 s | 10.7 and 25.9 s | The agent reads both files. One dissolve skips its thinking to its two `record` calls. Their lines read "Question: How long should a glance take to fade out?" and "Issue: Looking back at a glance selects it instantly", and the band, spotlit, changes to "Asks 1 · Finds 1". Then the reply prints above it. | Inbox surfaces what's easy to miss in a long, noisy thread. |
| 3 | 19.5–33.0 s | 30.3 s | `/inbox` goes in, and omp's menu shows the inbox command. Enter opens the panel with the question, its answers in a row and "300 ms (recommended)" selected, and the session above dims. It holds 8.5 s. Enter answers it, and the row reads ✓ 300 ms. | It anticipates what you'll want to do with each item. |
| 4 | 33.0–42.7 s | 75.1 s | Tab switches to Finds. The issue is open, with its description and Fix, File issue, Reply, Explain, Discuss and Dismiss, and holds 5.6 s. Enter on Fix hands it to the agent. The row reads "Fix", then "Queued: Fix". Above the panel, dimmed, the agent's thinking and then its edit stream in. | It also catches issues and opportunities your agent notices along the way. |
| 5 | 42.7–50.3 s | 83.5 and 109.1 s | Esc closes the panel. The band reads "Nothing needed", spotlit, and the agent goes on building the fade. One dissolve skips to the agent closing the finding it fixed: under its check's output, omp shows "Inbox close" and "Closed: Looking back at a glance selects it instantly", held still until the end card. | Your agent manages Inbox so it's always up to date. |
| 6 | 50.3–56.3 s | | The end card: streams of light leave the window's lines and braid through "inbox", with `github.com/petekp/inbox` under it. | |

The end card starts 0.8 s before its beat, over beat 5's last moments, as in the launch video. It runs 6 s, so the address reads for about 3 s.

The end card shows the same two lines as the launch video's and no install command, since a viewer can't type one from a video. The repo's README has the omp install steps.

### How beats change

As in the launch video, no beat changes on a hard cut:

- **Captions** rise in word by word in the band below the picture and leave 0.3 s before their beat ends.
- **The take** carries on across each beat's start. Its two jumps, in beat 2 and at the end of beat 5, dissolve over 0.25 s.
- **Keycaps** rise in at the right end of the caption band as each key is pressed and fade after 0.6 s. `/inbox` shows as one cap, which stays up until Enter. The prompt's letters get no cap, since the prompt shows them.

## Picture

- **One 16:9 master,** 1920 by 1080 at 60 fps. The cut's size is a setting in the video's timeline, so a 9:16 or square cut is a second entry in `VIDEO.cuts`.
- **The terminal is drawn from the take,** not filmed. `videos/record/term.py` records omp headless in a private tmux server: every screen with its colors, and every key, on one clock. `TerminalTake` draws each screen cell by cell in omp's own colors. The text stays sharp at any size, which matters because a feed shows the video small. The window around it is drawn: a dark macOS title bar with the three buttons and the title "visor — omp".
- **The font** is Menlo, Terminal.app's default, at 20 px, drawn at about 29 px. Glyphs it lacks, such as 📁 in omp's status line, come from the system's fallback fonts. Each such glyph is drawn centered in its own cells, so the columns stay aligned.
- **The terminal is 100 columns by 20 rows,** wide enough that the panel's rows don't wrap, and short enough that the whole window fits above the caption band at a readable size. omp's start screen fits in 13 rows, and the panel at its tallest takes 14.
- **omp's dark theme,** as omp starts by default.

## Recording

The take is `videos/takes/omp/session.term.jsonl`, which Git ignores. `session.build.txt` beside it records the build.

- **Build.** #126's head at `31322f3`: next at `da0f863` with #126 merged in. Next at `5698261`, where #126 landed, holds the same code. The take ran in a worktree at `31322f3`. The version was set to 0.2.13 there in the five places `docs/release.md` lists, and `omp/dist/host.js` rebuilt, none of it committed, so the footer reads "v0.2.13" ahead of the release. The rebuilt bundle differs from the committed one only in its version line, and `npm --prefix omp run check` confirmed it matches its sources. It has no `.next-build` mark, so it runs as a release build, with no Status tab. omp was 18.12.3.
- **No screen.** `videos/record/term.py` ran omp in a private tmux server that draws nowhere. A driver script read the take's log as it was written, and fed keys to `term.py`'s stdin as each screen was ready:
  1. The prompt, a letter at a time, then Enter.
  2. After the agent's turn ended, 35 s for the inbox model to finish.
  3. `/inbox` in one burst, then Enter once the menu showed.
  4. Once the panel showed, 8.5 s, then Enter to answer.
  5. Once the answered row showed, 2 s, then Tab.
  6. Once the issue showed, 5.5 s, then Enter on Fix.
  7. Once the Fix result showed, 2.2 s, then Esc.
  8. The take ran on until the agent closed the finding, and stopped 3 s after "Closed:" showed.

  The driver stopped the take early if a `record` call showed the answer written for the agent, which would mean a build without #126, or if the panel's footer did not read "v0.2.13".
- **A fresh HOME.** `videos/record/omp-take.sh` started omp with `HOME` set to a fresh folder in `~/Library/Caches/`, under `sandbox-exec` and `env -i`, as the agent evals run omp. omp read none of Pete's omp settings and wrote nothing to his inbox. Its config turned off the setup wizard, the update notice and omp's Ask tool. The folder sits outside the temp folders, which omp marks as scratch with a 🗑 and a long path, and outside any repo. The project sits at `~/Projects/visor`, which omp shows as "📁 visor". The project's Git remote was removed, since it named the folder of an earlier take.
- **The model.** omp signed in with Pete's Claude sign-in through `ANTHROPIC_OAUTH_TOKEN` from `omp token anthropic`, as the agent evals do. The agent ran on Opus 5.5 at high thinking. The inbox model was Sonnet 5.5, which omp picks when the providers offer it.
- **The project.** Visor's three source files and a test. `gaze.js` holds the launch video's planted bug: looking away never resets the dwell timer.
- **The cut.** `cut.py omp session` wrote the screens and keys to `public/omp/takes/session.json`. No screen in the clip holds the user name or the take's folder, so it needed no redaction.

What it took:

1. With omp's Ask tool on, the agent asked in an omp dialog as well as the inbox, and the dialog blocked the turn. The config turns the tool off, as the launch video's take turned off Claude Code's question dialog.
2. Some takes ask the question but record no finding. The first version took three such takes on Sonnet 5.5 before one on Opus 5.5 worked. This version's take worked on the first try. It made 11 model calls: 9 requests to Opus 5.5 over three turns, the last cut off by the stop, and a ledger call and a Status call to Sonnet 5.5 after the first turn.

## Music

The render uses "Focus Flow", the launch video's track, from where its full groove comes in, 31.4 s into the track, so the two videos sound like one series. It fades out over the last 4 s. Pete chose to keep it.

## Decisions

1. **The length.** 56.3 s, at the launch video's pace. Pete chose to keep it, and chose no 15-second cut.
2. **The music.** "Focus Flow", as above. Pete chose to keep it.
3. **The app label.** omp's logo beside its name, as the launch video shows each app's icon. The logo is `assets/icon.svg` from omp's repo. omp is MIT-licensed, and neither its repo nor its packages hold a trademark or brand notice. The file goes in `public/icons/omp.svg`, which Git ignores, as it does every app's icon.
4. **The sample project.** Written again for the first version's take. Pete chose to keep it.
5. **Calmer picture.** Pete chose the changes under "Keeping the eye on the inbox": one held framing, the dim, Tab about 2 s after the answer, and the inbox's own fixes first.
6. **The answer letters.** The answers' letter keys skip the ones a row's other buttons use. Pete chose to keep them. This take's question has four answers and an Open step, so its letters read b, c, f and g.
7. **The ending.** Pete chose to end on the agent closing the finding it fixed, with omp's "Closed: …" line, so the video shows the agent taking both items and updating the inbox.
8. **The captions.** Pete wrote the five captions in the Beats table.
9. **The version.** Pete chose a footer that reads v0.2.13, the release that ships #126.

## Open decisions

1. **The format.** One 16:9 master first, with a 9:16 cut later for Reels, Shorts and TikTok.
