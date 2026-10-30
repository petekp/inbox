# Code and docs

Part of [the Herdr look plan](../herdr-look.md).

Status: proposed.

## Where the code goes

A new folder, `herdr/`, holds the look. It follows `omp/`: the drawing imports only shared modules, and one file imports Herdr's modules.

| File | Role |
| --- | --- |
| `herdr/src/main.ts` | The mod's entry: the `View` class, its tasks and its `render`. The only file that imports `herdr`, `gpui-kit` and `gpui-base`. |
| `herdr/src/follow.ts` | Picks the session to show from focus, panes and labels. Pure, so it is tested without Herdr. |
| `herdr/src/files.ts` | Reads an envelope and builds a press file. Checks `format`, and runs `upgradeSession`. |
| `herdr/src/draw.ts` | Maps the shared view and plans to element descriptions, in plan order. |
| `herdr/build.ts` | Bundles `main.ts` and the shared modules into `herdr/mod/inbox/main.js`, with `mod.json`. |
| `herdr/tests/` | Tests for `follow`, `files` and the plan order in `draw`. |

**A build trap the spike hit.** Bun's browser target replaced `import * as fs from 'fs/promises'` with an empty object, even with `fs/promises` marked external. The spike's first press then failed with "not a function". The look should use only the `herdr` module's file calls, and `herdr/build.ts` should fail when the bundle holds an empty stand-in for any module.

## Shared-code changes

- **`hooks/text.ts`: a fallback for `Intl.Segmenter`.** Herdr's runtime has no `Intl`, and `text.ts` builds an `Intl.Segmenter` at load, so the shared modules do not load in a mod as they are. The probe loaded them with a global stand-in. That is wrong for a shipped mod: Herdr's mods share one global object, so a global stand-in leaks into every other mod. `text.ts` builds its segmenter only when `Intl.Segmenter` exists. Otherwise it splits text with a regular expression that keeps a base character with its combining marks, and an emoji sequence joined by U+200D, together. The runtime supports `\p{…}` in regular expressions. Cell widths matter only to terminal looks, which always have `Intl`, so the fallback changes only where the Herdr look cuts a title.
- **`hooks/view.ts`: `Look` gains `'herdr'`.** It is not terminal-like, so `rowTitle`, `feedbackText` and `helpKeys` follow the desktop look's text. `helpKeys` lists the Herdr look's keys.
- **`hooks/row-motion.ts`: the row state machine,** moved from `codex/src/rows.ts` unchanged. See [the look](look.md#every-state-and-every-move).
- **`hooks/herdr.ts`: the app target,** labels and envelope. `herdrTarget(env)` picks the multiplexer pane or the app terminal. `herdrLabels(tokens)` turns today's tokens into `inbox.` labels. `herdrEnvelope(host, agent, session)` builds the published file. `pressFile(text)` reads and checks a press file. Every host calls these, so the format lives in one place. The file is about 2,000 tokens now, so it has room.
- **The press follow-ups leave `runPress`.** `hooks/register.tsx:runPress` mixes the terminal pane's scroll and Undo bookkeeping with what any press needs afterwards, such as `wakeForDone`. The second part moves into a function that both the pane and the Herdr press path call. The spike called `press()` alone, so its Done never woke the agent.
- **Each host's publish and press watch.** In `hooks/register.tsx` or a module beside it, `codex/src/host.ts` and `codex/src/server.ts`, and `omp/src/host.ts`, as [Data and presses](data-and-presses.md) describes.

`scripts/check-structure.mjs` gains `herdr/`'s rule: its files import only shared modules, and only `herdr/src/main.ts` imports Herdr's modules.

## Feature entries

The Herdr look is a look, not a host. Each host publishes for it and applies its presses, and those parts differ by host. So it gets one `FeatureId`, `herdr-look`, with an entry for each client in `hooks/clients.ts`:

| Client | Entry | Reason |
| --- | --- | --- |
| `claude-code` | `different` | The mod cannot watch a folder, so a press reaches it through a wake label it reads with `hc events`. |
| `codex` | `different` | Codex has no hook for a session's end, so its labels and file stay until the terminal runs something else. Whether `codex queue` reaches a CLI session is open. |
| `omp` | `full` | omp watches the press folder in its own process and clears its labels when it shuts down. |

`herdr-sidebar` keeps its id, and its three entries are rewritten for the app's labels.

## Look-map rows

The look map is `docs/looks.md` and its parts in `docs/looks/`.

- **Files.** A new part, `docs/looks/files-herdr.md`, with a row for each file in `herdr/src`. The structure check reads every `docs/looks/files-*.md`. The `hooks/herdr.ts` row in `files-shared.md` changes, and `hooks/row-motion.ts` gets a row there.
- **Differences on purpose, by host.** `herdr-look` gets a row in `differences-hosts.md` for Claude Code and Codex, and one in `differences-omp-host.md` for omp. The `herdr-sidebar` rows change in both.
- **Differences on purpose, by look.** A new part, `docs/looks/differences-herdr.md`, compares the Herdr look with the Codex tab, the nearest look. Its rows start with:

  | Topic | Herdr look | Why |
  | --- | --- | --- |
  | Who draws | A program apart from the host, from a published file | Herdr's mods run in Herdr's process. |
  | Press delay | A press reaches the host when the host reads its file, after a file watch or a wake label | A press crosses a process boundary through a file. |
  | Following focus | Shows the session of the focused terminal in its tab | One pane can serve several agents in a tab. |
  | Motion | GPUI transitions on opacity, height and position | Herdr has no CSS. |
  | Reduced motion | Animates until Herdr reports the setting | Herdr exposes no reduced-motion setting yet. |

  The structure check learns this part as the table for the `herdr` look, the way it tells the omp table apart by its file name.
- **Owners.** `owners-rows-and-feedback.md` names `hooks/row-motion.ts` as the owner of row states. `owners-ledger-and-sessions.md` names `hooks/herdr.ts` as the owner of the envelope and the press file.
- **After you change X.** `docs/looks/after-a-change.md` adds the Herdr look to every check that lists the looks.
- **Elsewhere.** `GLOSSARY.md` adds the `herdr` look, the published session and the press file. `AGENTS.md` lists five looks and adds the Herdr bundle's build step. The README gains Herdr install steps.
