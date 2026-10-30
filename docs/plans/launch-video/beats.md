# Launch video: beats

Part of [the launch video plan](../launch-video.md).

Status: built.

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

The end card is `videos/src/shared/EndCard.tsx`, a WebGL 2 shader. Each stream is three fine threads of light, with each color channel set slightly apart, as light through a prism. The colors are magenta, violet, blue, cyan and amber. A few streams pass close to the lens, large and out of focus, and a few sit far behind. The light has bloom, motion blur, a horizontal lens streak that flares when the braid reaches the word, a slight color fringe toward the frame's edges, film grain and a vignette. Pete chose this look, "Fiber", over wide twisting ribbons. Every frame depends only on its time, so Remotion can render frames in any order.

Rendering needs Chrome's GPU backend. `videos/remotion.config.ts` sets it to ANGLE, for the studio and for renders.

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
