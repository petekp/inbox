# Platform reference

This folder records what each client platform lets the inbox do, with a source for every fact. It was checked on 2026-10-08 against these versions:

- Claude Code 2.1.295 in the terminal.
- The Claude desktop app 2.31226.0. Its sessions ran the app's own Claude Code copy, 2.1.293. A 2.1.289 copy was also on disk.
- Codex CLI 0.160.1, bundled in the ChatGPT desktop app. `codex` on `PATH` was 0.154.0. The latest release was 0.162.0.
- The MCP Apps spec `2026-01-26` with ext-apps SDK 2.0.3, and core MCP `2026-07-28`.
- This repo at commit `55ab122`.

Later checks are recorded in each file: Codex CLI 0.163.0, 0.164.0 and 0.166.0 in `codex-plugins.md`, and omp 18.14.0 in `omp.md`.

To keep it current, re-check those versions first: `claude --version`, `/status` in a Code-mode session, and `codex --version`. Then re-run the live checks in each file.

For Claude Code, prefer the engine's local types (`.claude-plugin/types/claude-code/index.d.ts`) when they disagree with the public docs. The docs say to "trust these files over any page, this one included, when they disagree" ([claude-code-mods.md](claude-code-mods/building-and-loading.md#engine-types)). The file is gitignored, and whichever engine last loaded the repo folder rewrites it. On 2026-10-08 its header read 2.1.292, 2.1.293, 2.1.294 and 2.1.295 at different times (`claude-code-mods.md:14`). Record the header version with any fact you cite from it.

Terms used here:

- **Mod**: a Claude Code plugin whose hooks module watches engine events and draws. The inbox's Claude client is one (`hooks/`).
- **Engine**: the Claude Code program that runs a session and loads mods.
- **Surface**: the app that draws a session: `terminal` or `desktop` in the docs. The engine types also define `mobile` and `vscode`.
- **Guard**: the built-in mod `cc-plugin-sec-default`. It loads ahead of user mods on a Team or Enterprise sign-in or on a machine with managed settings, and limits what they can change.
- **Code mode** and **Claude mode**: the desktop app's two modes. The public docs still say Code tab, and Chat plus Cowork. A third-party build's changelog says "Unified Claude ... combines Chat and Cowork" ([mcp-apps.md](mcp-apps/open-questions.md#where-sources-disagree)).
- **SDK host**: an app that runs the engine headless and drives it over the Agent SDK's stream-json protocol. The desktop app is one.
- **MCP App**: an MCP tool that names a `ui://` HTML view for the host to render in an iframe. The Codex Inbox tab is one.

Evidence tags in the four files: doc, local (types or repo code), live (checked on a Mac), inference. A `*` in the matrix marks an inference.

## Parts

- [Capability matrix](capability-matrix.md)
- [Constraints, open questions and disagreements](constraints-and-open-questions.md)

## Files

- [claude-code-mods.md](claude-code-mods.md): Claude Code mods in every client: loading, lifecycle, the `$` API, drawing, keyboard, admin policy, costs, plugins, MCP, Remote Control, cloud, headless runs, 119 source conflicts and 135 open questions.
- [claude-desktop-app.md](claude-desktop-app.md): the Claude desktop app: modes, how it runs the engine, engine copies, Code-mode environments, what draws, settings, `/resume`, and 20 live checks.
- [codex-plugins.md](codex-plugins.md): Codex plugins in the ChatGPT desktop app: packaging, marketplaces, hooks and trust, MCP hosting, the tab UI, ids, `codex queue`, `codex exec`, app-server, config and transcripts.
- [task-lists.md](task-lists.md): whether Claude Code, Codex and omp show the agent's own task list to the inbox, and how each can be read.
- [mcp-apps.md](mcp-apps.md): the MCP Apps extension: declaring a view, host support, the view's protocol, security, the SDK, how Claude and Codex host views, and what a Claude-mode inbox would need.
