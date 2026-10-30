# What this repo has verified, and what is stale

Part of [Claude Code mods](../claude-code-mods.md).

## How this machine loads the inbox

- `.claude-plugin/plugin.json` has `name: "inbox"` and `types`, and no `version`. `hooks/hooks.json` is `{ "modules": ["./register.tsx"] }`.
- User settings set `env.CLAUDE_CODE_PLUGIN_DIRS` to the repo folder. `claude plugin list` shows the mod under "Session-only plugins (--plugin-dir / --plugin-url)" as `inbox@inline`, version unknown. (Live.)
- `CLAUDE_CODE_PLUGIN_DIRS` loads plugin folders "as `--plugin-dir` does, for apps you can't pass a flag to". [R#settings-and-environment-variables]
- Inference: every session on this machine, in any repo, runs the working copy and writes the real store file. That includes desktop Code-mode sessions and `claude -p` trials. No repo doc mentions this variable.
- `README.md:79-82` gives the dev loop as `claude --plugin-dir /path/to/inbox`, reloading on save. Reload on save is "on by default in interactive sessions". [ENVV] Inference: a desktop Code-mode session may not reload on save without `CLAUDE_CODE_PLUGIN_DIR_WATCH=1`. Not verified.

## Commits that fixed client behavior

| Commit | What it changed |
|---|---|
| `05c3548` | "Turn the mod on in the desktop app's Code mode": the `session.start` and `session.attach` gate. |
| `f7536d0` | "Load the right conversation after /clear, /resume and /branch": `classic.SessionStart` with source `clear`, `resume` or `fork` calls `loadConversation`. |
| `f23d9ad` | "Load the conversation the switch names, not $.session.id()": uses `e.session_id` (`hooks/register.tsx:on('classic.SessionStart')`). |

- Tests: `tests/hooks.test.ts` test "a headless run stays inactive when ${origin.kind} invokes the inbox command" checks that a headless start does nothing. The tests `tests/hooks.test.ts` "the desktop app turns the mod on when it attaches before the start" and "… after the start" cover a desktop attach before and after `session.start`, then mount the band on `surface: 'desktop'`.
- The desktop tests submit prompts with `origin: { kind: 'sdk' }`. That is an assumption about Code mode, not an observed value.

## Checks

- `scripts/check.sh` runs Prettier pinned to `prettier@3.9.9`, then `claude plugin validate`, then `node scripts/check-structure.mjs`, then `tsc --noEmit` when `.claude-plugin/types/tsconfig.json` exists, then `claude plugin test`. When `codex/node_modules` exists, it then checks the Codex bundles, the Codex types and the Codex tests. It fails when it cannot check the types or the Codex plugin.
- The type check runs against whichever engine last wrote the gitignored types. On 2026-10-08 the header read 2.1.293, 2.1.294 and 2.1.295 at different times. The local types can lag the newest release, and can lead the desktop app's engine. Inference: an API added after the desktop app's engine passes `check.sh` and fails in Code mode.
- `claude plugin update --help` says "(restart required to apply)". `README.md:22-23` and the mods overview say to run `/reload-plugins`. [O#install-or-update-a-mod]

## Repo docs that are stale

- `AGENTS.md`: "The plugin store is keyed by the mod's name". Live store file names are keyed by plugin id (`inbox_inline-7e8589075f50.json`).
- `AGENTS.md` and `ROADMAP.md:29` call the per-turn call a "Sonnet call". `sonnet` resolves to different models by provider. See "What the inbox's model calls cost".
- The comment in `hooks/register.tsx:on('session.start')` says "-p, the SDK and VS Code draw nothing". That matches the docs. The types give `vscode` its own element table.

## Store files (live, names only)

- `~/.claude/plugins/store/` held `inbox_inline-7e8589075f50.json` (about 70 KB, mode 600) and an older `session-inbox_inline-<hash>.json` from the mod's earlier name.
- The cap is 4 MiB. [T: `store`; R#limits]
- Inference: an install from a marketplace (`inbox@inbox`) and the dev copy (`inbox@inline`) write different files and share no state. No code migrates between them.

## New ways to start a session that the gate may miss

- `claude --bg` then `claude attach`, `claude --desktop`, `--remote-control`. [CLI]
- The types say "the terminal's attachment is the REPL's binding and raises nothing". Inference: a session started with `--bg` begins headless and may never turn the inbox on when a terminal attaches later. Not tested.
- SSH Code-mode sessions read the remote host's settings and plugins. Inference: the local `CLAUDE_CODE_PLUGIN_DIRS` does not apply there. [desktop#ssh-sessions]
