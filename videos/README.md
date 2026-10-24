# The inbox's videos

A Remotion project that holds the inbox's videos. Remotion renders React components to video frame by frame. Each video has its own timeline, takes and cuts. The parts every video shares are in `src/shared/`.

The videos so far:

- `launch`: the 81.5-second launch video. Its plan is [docs/plans/launch-video.md](../docs/plans/launch-video.md).
- `omp`: a 47-second promo that premieres the inbox in omp. Its plan is [docs/plans/promo-omp.md](../docs/plans/promo-omp.md).

## Layout

| Path | What it holds |
| --- | --- |
| `src/<video>/timeline.ts` | The video's beats, captions and cuts. It exports `VIDEO`, which lists the cuts, and `timeline(cut)`, which places the beats. |
| `src/<video>/Video.tsx` | The component that draws one cut, given the cut's id. |
| `src/<video>/takes.json` | Each cut take's size and where it was recorded. `record/cut.py` writes it. |
| `src/shared/` | The parts every video uses. See below. |
| `src/videos.ts` | Every video's timeline, by id. `scripts/check.mjs` and `record/drive.py` read it. |
| `src/Root.tsx` | Registers each cut as a composition, with the cut's own size and frame rate. |
| `public/fonts/` | Geist and Geist Mono, under the SIL Open Font License in `OFL.txt`. |
| `public/music/`, `public/icons/` | Music and app icons. Git ignores both: the music is licensed for the post, and each icon is its maker's trademark. |
| `public/<video>/takes/`, `public/<video>/stills/` | Cut clips and stills. Git ignores both. |
| `takes/<video>/` | Raw takes and their logs. Git ignores it. |
| `out/` | Renders and check output. Git ignores it. |

## Shared parts

| File | What it draws or does |
| --- | --- |
| `Caption.tsx` | A caption that rises in word by word on a dark pill, and leaves 0.3 s before its beat ends. Under footage it sits in its own band. |
| `AppLabel.tsx` | An app's icon and name, in the band above footage. |
| `Pointer.tsx` | A macOS arrow that glides to each click and dips with a ring. |
| `Footage.tsx` | Stretches of a recorded take, each dissolving into the next under a brief blur. |
| `TerminalTake.tsx` | A terminal take from `record/term.py`, drawn cell by cell in the app's own colors. |
| `TerminalWindow.tsx` | A drawn macOS window around a terminal take, and stretches of the take that dissolve into each other. |
| `KeyCaps.tsx` | A keycap for each key pressed, for a take driven by keys. |
| `EndCard.tsx` | The WebGL end card: streams of light leave the last picture's lines of text and braid through a word, with an address under it. It needs Chrome's GPU backend, which `remotion.config.ts` sets to ANGLE. |
| `Music.tsx` | A video's music, with its fade out. |
| `fonts.ts` | Loads Geist and Geist Mono before a frame renders. |
| `states.ts`, `geometry.ts` | What the screen shows when, clicks, and camera moves across a take. |
| `captures.ts` | Whether a capture is present, so a checkout without one draws a placeholder. |
| `layout.ts` | The background and the bands above and below footage. |
| `video.ts` | The shape of `VIDEO`: each cut's id, size, frame rate, frames, captions, still marks and notes. |

## Adding a video

1. Make `src/<video>/timeline.ts` with its beats, and export `VIDEO` and `timeline(cut)`.
2. Make `src/<video>/Video.tsx`, which takes `{ cut }` and draws it from the shared parts.
3. Add the timeline to `TIMELINES` in `src/videos.ts`, and the component to `COMPONENTS` in `src/Root.tsx`.

A cut's size is a setting. A 9:16 or square cut of the same story is another entry in `VIDEO.cuts`, drawn by the same component. The shared parts read the frame's size from Remotion.

## Running

Install the tools once with `npm --prefix videos ci`. Then:

- `npm --prefix videos run studio` opens Remotion Studio with every cut.
- `node videos/scripts/check.mjs [video]` prints each cut's caption report, notes and missing stills. A caption must stay on screen at least 2 s, read at no more than 20 characters a second, and not overlap the one before it.
- `node videos/scripts/check.mjs --render <cut>` also renders the cut to `out/<cut>.mp4`, checks its size, frame rate and frame count with ffprobe, and writes stills at its marks and a contact sheet of one frame a second to `out/<cut>/`.

## Recording

Every take uses the newest build from main, and its commit is noted beside the take.

### An app in the VM

The launch video's takes were recorded this way, in the `inbox-ui` tart VM. Its plan has the full steps.

- `record/record.swift`, compiled to `out/record`, records one window with ScreenCaptureKit and writes the host time of its first frame.
- `record/hand.js` runs in the VM and posts each key or click it reads over SSH within a few milliseconds.
- `record/drive.py <video> <beat> [look] [cut]` records a beat's take and plays its clicks at the timeline's times.
- `record/act.py <video> <take> <command>` sends commands during a long take and logs each one.

`VM` names the tart VM, `inbox-ui` by default, and `VM_HOST` its SSH address.

### A terminal app, headless

`record/term.py` runs a terminal app in a private tmux server that draws nowhere, so a take needs no screen. It reads the screen with its colors about 60 times a second, sends keys, and logs both on one clock:

    python3 videos/record/term.py <video> <take> --size 120x34 --env HOME=<fresh folder> -- <command>

Keys come on stdin, as `key Enter` or `type /inbox`. A line that starts with `@<seconds>` waits until that time, so a file of timed lines plays a scripted take. `TerminalTake` then draws the take in any font size, sharp at any frame size.

Run an agent with a fresh `HOME`, so it reads none of your settings and writes nothing to your own inbox. `record/omp-take.sh` starts omp that way, under the same sandbox as the agent evals, and says where to put that `HOME`. Its `.omp/agent/config.yml` should hold:

```yaml
setupVersion: 2
startup:
  setupWizard: false
  checkUpdate: false
  showSplash: false
ask:
  enabled: false
```

The wizard's sign-in step opens a browser on this Mac. omp's Ask tool opens a question dialog that answers the agent's question before the inbox can.

### The cut

`record/cut.py <video> <take>` turns a take into the clip a video plays, in `public/<video>/takes/`, and records it in `src/<video>/takes.json`. A VM take is cropped to its app's window and resampled to 60 frames a second. A terminal take becomes the JSON `TerminalTake` reads. `--redact FROM=TO` replaces text the video must not show, such as a path with your user name, and keeps the columns in place.
