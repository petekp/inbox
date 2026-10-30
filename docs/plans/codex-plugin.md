# The inbox as a Codex plugin

Status: built. The Codex tab runs in the Codex desktop app. Session checks and the claim check were removed from the mod and the plugin, so the parts of this plan about them describe removed code.

Goal: give Codex sessions what the inbox gives Claude Code sessions. That
means one place for what waits on the person, Codex's findings, and an
inbox kept current after each reply.

Terms follow `GLOSSARY.md`. "The mod" is the Claude Code mod in this repo.
"The plugin" is the Codex version. Each claim about Codex carries a tag:

- **[verified]**: checked on this Mac against Codex CLI 0.154.0, or the
  desktop app's bundled Codex 0.160.1.
- **[documented]**: stated in OpenAI's plugin, hooks or UI docs, or in
  [openai/mcp-extensions](https://github.com/openai/mcp-extensions), not tried.
- **[unverified]**: inferred. Step 0 below checks it before anything is built.

## Summary

- **Most of the inbox ports directly.** A plugin's MCP server serves the
  tools. Hooks give Codex the inbox texts. A background Stop hook runs the
  per-reply update.
- **The pane becomes a tab beside each conversation.** OpenAI's MCP
  extensions let a plugin's MCP App open as a tab within a thread, one
  instance per thread [verified]. Its buttons can send a message into the
  conversation with `ui/message`, but Codex marks that message untrusted, so
  the model does not act on it. So a press runs `codex queue`, which
  delivers the message as the person's own [verified].
- **The band has no surface.** No plugin can draw above the prompt. The
  Inbox tab's labels carry the counts, and the tab draws no header.
- **State lives in files.** The mod is one process that lives as long as
  the session. A Codex hook is a new process for every event, and Codex
  starts several MCP server processes per session. Each of them reads and
  writes the session's state file under a lock.
- **The first version** includes the findings and close tools, the inbox
  texts, the per-reply update, and the Inbox tab with Asks and
  Finds. The PRs tab comes later.

## Parts

- [What Codex allows](codex-plugin/what-codex-allows.md): What a Codex plugin can do, the feature map, and the gaps with what to do about each.
- [Step 0 and the first version results](codex-plugin/step-0-and-results.md): The checks before building, what they changed, and the first version's results.

## Cost

The update runs `codex exec` once per reply, on the person's Codex sign-in.
On a ChatGPT plan it counts toward usage limits.

The inbox's own prompt is the same size as the mod's: 3–4k tokens in,
100–250 out. `codex exec` adds about 12.5k tokens of its own instructions
and tool setup, even with tools and features off [verified]. So each reply
costs about 16k input tokens. A direct Responses API call would skip the
overhead, but only for people with an API key. Decided: the plugin uses
`codex exec`, through `CODEX_CLI_PATH`, so it needs nothing the desktop app
doesn't already have.

`SessionStart` output is `GUIDANCE` plus the start-of-context block. With
many open items and findings it can pass the 2,500-token default limit on a
hook message. The plugin sets `additionalContextLimit` on that hook high
enough for the largest block the mod would send.

`GUIDANCE` and the tool descriptions add about 1,350 tokens to Codex's
context, as they do for Claude.

## Architecture

```
Codex session ── hooks (one process per event) ──┐
     │                                            ▼
     ├── MCP tools ──▶ MCP server processes ──▶ sessions/<id>.json, under a lock
     │                        ▲                   │
     └── Inbox tab (MCP App) ─┘ polls             └── Stop hook ──▶ detached update ──▶ codex exec
              │
              └── a press calls a tool, and the server runs `codex queue`
```

- **Hooks:** `SessionStart`, `UserPromptSubmit`, `PreToolUse` on the shell,
  patch and MCP tools, and `Stop`. `Stop` ends the turn and starts the
  update.
- **MCP server:** Node, the same language as the mod. It speaks MCP over
  stdio by hand, as the step 0 probe did, since it needs only `initialize`,
  `tools/list`, `tools/call` and `resources/read`. Rejected:
  `@openai/mcp-extensions`, a dependency for a few message shapes.
- **Shared code:** the plugin reuses `ledger.ts`, `presses.ts`, `tools.ts`
  and `demo.ts` unchanged. Codex's own texts, such as
  `GUIDANCE` and the inbox line's pane sentence, live in `codex/`, so the
  mod's measured texts don't change.
- **Build step.** Codex installs a plugin by copying only its folder into
  its cache [documented]. Plain Node also can't load the shared modules as
  they are: they import each other with no extension [verified]. So esbuild bundles each entry point into the plugin folder,
  and the bundles are committed, since a Git marketplace install runs no
  build.
- **Tab:** one plain HTML file with inline script, served as
  `ui://inbox/tab`. Rejected: Vite, a build for a single page.

## First version

Includes:

1. Plugin manifest, marketplace entry, and an install that works on this Mac.
2. The MCP server, with saved state.
3. `record` and `close` as MCP tools.
4. `GUIDANCE`, the start-of-context block, the inbox line and the answer line,
   through hooks.
5. The per-reply update with `codex exec`, using the measured text and model.
6. The Inbox tab, with Asks, Finds, answer and dismiss
   buttons, Address it and Discuss, and the last action on each row.

Leaves out, in order of value: the PRs tab, the card after time away, the
previous session's card, catch-up, dialogs, demo mode.

## Build steps

1. Step 0 and step 0b. Done.
2. The plugin folder, the build and the marketplace entry. Done.
3. Session state, the hooks and the MCP tools, with tests. Done.
4. The per-reply update through `codex exec`, and the model measurement.
   Done.
5. The Inbox tab. Done. Rebuilt with Preact to follow the mod's pane.
6. A full session through `codex exec`. Done. A real session in the desktop
   app, which needs the person to install the plugin, trust the hooks and
   open the tab. Not yet.

## Decisions

1. **The code lives in a folder here,** `codex/`. A build step bundles the
   four shared modules into the plugin, so fixes to them reach the plugin on
   the next build. It must be a subfolder, because the repo root's
   `hooks/hooks.json` is the mod's and Codex would read it as plugin hooks.
   Step 0 item 8 applies. The rejected option, a new repo, would copy the
   modules and miss later fixes to them.
2. **The first version targets the desktop app only.** Step 0 checks run in
   the desktop app, and step 7 tests there. The CLI is not tested.
