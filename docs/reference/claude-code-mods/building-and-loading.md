# Building and loading a mod

Part of [Claude Code mods](../claude-code-mods.md).

## Files and what static analysis allows

- A mod is "a Claude Code plugin with an entry file, called the hooks module". It needs no "Node.js, a bundler, or a build step, because Claude Code loads `.js` and `.ts` files directly". [C]
- `plugin.json`: "Mods add no required fields." `hooks/hooks.json` holds `modules`, "an array with one path, relative to this file", and "Can also hold settings hooks under `hooks`". The hooks module "Exports `register(on, options)`". [R#files; C#write-a-mod-yourself]
- `register` receives `options`: the `userConfig` values, with defaults filled in. [R#files]
- Module extensions: `.js .mjs .cjs .jsx .ts .mts .cts .tsx`. Every file is an ES module. [R#files] There is "no DOM, no Node", "there is no `require`", and "A module holding `import()` does not load." [T header]
- `types/index.d.ts`, named by `types` in the manifest, is required "When the mod uses `$.state` or adds a namespace to the mods API". [R#files] `claude plugin validate` "holds every `$.state` key the module names to that contract". [plugin-authoring skill]
- Static rules. Each one fails validation, and the mod then fails to load: [C#check-what-claude-code-reads-from-your-mod]
  - Write each call in full, as `$.ns.method`.
  - Pass `$` only to a function declared at the top level of the same file. The `calls:` line then shows `(via fn)`. "Passing `$` to a method, a function defined inside the hook, or a function you import from another of your files fails validation." `$.state`'s `read` and `update` are the imports that can take it.
    - Live, 2026-10-28, Claude Code 2.1.312: `claude plugin validate` passes a module that passes `$` to functions imported from another of its files, with or without `--profile directory`. Its `calls:` line names those functions with `(via fn)`. The plugin directory's scan refuses the same code with `MOD_CAPABILITY_USE_NOT_PLAIN`, as `docs/plans/directory-submission.md` records.
    - The plugin directory's scan of 0.2.14 (`main` at `2d613e90`): passing `$` only to the file's own top-level functions was not enough. It refused calls to a top-level function whose name the file also bound as a parameter elsewhere. It also refused `$` passed on from inside a function that another function returns. `docs/plans/directory-submission.md` records both. The second cause is inferred.
  - "Don't assign `$` or one of its namespaces to a variable, destructure it, or index it with a computed name. `const ui = $.ui` fails with `$.ui is used as a value`."
  - Event names must be string literals: "`the event name passed to on() is not a string literal`".
  - Don't shadow `on`: "`\"on\" is declared again (shadowed)`".
  - Import only relative files inside the plugin folder. The one bare import is `claude-code`. No dynamic `import()`.
- `claude plugin validate` fails a `name` that "looks like one of Anthropic's own", such as one starting `claude-`. [C#share-your-mod]
- A bad option value gives `hooks module did not load: options do not fit plugin.json userConfig:`. [TS#options-do-not-fit-pluginjson-userconfig]

## Engine types

- Claude Code writes types into `.claude-plugin/types/` on each load or reload "from a directory you pass to `--plugin-dir`, or a mod Claude wrote for you". Files: `claude-code/index.d.ts`, `claude-code-tools/index.d.ts`, `claude-code-mcp/index.d.ts`, one folder per `dependencies` plugin, and `tsconfig.json`. [C#get-the-types-for-your-build]
- "The events and methods can change between releases, so trust these files over any page, this one included, when they disagree." [C#get-the-types-for-your-build]
- The reference's GitHub copy "can be older than the Claude Code version you have installed". [R]
- The file is written "each time it loads a mod from a folder the person owns … written again after an update rather than edited". It needs "TypeScript 5.4 or newer". [T header]
- The plugin-authoring skill adds: MCP types are "refreshed when you save the mod; a restart never replaces it". Glob and Grep are not registered on native macOS and Linux builds, so compare with `String(e.tool)`. Before a mod has loaded, or under `-p`, types are written beside the skill.
- Live, this repo: `tsconfig.json` extends `./.claude-plugin/types/tsconfig.json`, and the types folder is gitignored. The file's first line changed several times on 2026-10-08 (2.1.293, 2.1.294, 2.1.295), because each engine that loads the folder rewrites it. This document cites types by symbol name for that reason. The 2.1.293 and 2.1.294 files each had 15,826 lines.
- Inference: the type check runs against whichever engine last loaded the repo as a folder. A fresh CI box has no types. `scripts/check.sh` copies the main checkout's types into a worktree (commit `55ab122`).

## Loading a folder, and hot reload

- `claude --plugin-dir <dir>` "loads a plugin directory for one session without installing it". Repeat the flag for several. [C; R#commands]
- "Claude Code watches a directory loaded with `--plugin-dir` and hot-reloads the hooks module when a file in it changes. Each reload runs `register` again". [C#how-the-example-mod-works] A reload prints a transcript line that names the mod and lists its hooks. [TS#read-the-debug-log]
- "Files Claude saves during its turn reload when the turn ends." [C#change-a-mod-with-claude]
- "A directory you load with `--plugin-dir` is a protected path, so in `default` and `acceptEdits` modes you're asked to approve each of Claude's edits to the mod." [C#change-a-mod-with-claude]
  - Inference: the inbox's plugin root is the repo root. In a `--plugin-dir <repo>` session, every edit Claude makes in the repo may ask for approval, and a save anywhere in the repo (`docs/`, `codex/`) may reload the mod. Not verified.
- A broken save gives "`reload failed, the previous version stays loaded:`". "the last working version keeps running until Claude Code next reloads plugins". [TS#read-the-debug-log]
- The plugin-authoring skill adds: a reload also happens "sooner when a tool or command the plugin registered is about to run". Outside saves reload "once the folder has been quiet". "the previous environment's timers are dropped". A folder given as a link is watched at its target.
- Live probe, 2026-10-09, terminal 2.1.296, with a throwaway mod: a hot reload keeps the work a hook or a Button's `onPress` returns. That work's later atom writes land after the new load starts. Work a handler starts with `void` and leaves running is dropped at the reload, and its writes never land. Two presses whose `onPress` promises are both pending run in parallel. A pending press does not block the next one.
  - Inference: the inbox's press handlers return their work, so an open or copy should still write its result when the mod reloads during it. Not verified in the inbox.
  - `claude plugin test` has no reload, so no test can show a press's work surviving one. In the kit, `press` resolves only after the work its `onPress` returns. A test that holds that work must release it before awaiting the press.
- Live, 2.1.295: a tool registered with `$.tool.register` stays registered after a hot reload whose new code no longer registers it. `/mcp` and `/context` still listed `run_check` after the mod reloaded into a commit without it, and after a later `/reload-plugins`. A fresh session did not list it. The engine has no unregister call, so a removed tool leaves the tool list only at the next session start.
- `CLAUDE_CODE_PLUGIN_DIRS` loads plugin folders like `--plugin-dir`, "for apps you can't pass a flag to". Absolute paths, separated by `:` (`;` on Windows). Read from "Environment, or `env` in `~/.claude/settings.json`". [R#settings-and-environment-variables] The skill says it covers "a session the desktop app or an SDK host starts", "never a project's settings".
- `CLAUDE_CODE_PLUGIN_DIR_WATCH=1` "makes a long-running non-interactive session reload `--plugin-dir` mods on save". [R#settings-and-environment-variables] The skill says a long-lived headless session (SDK, desktop) watches when it is "set the same way", and reload lines reach the host "as `ui_log` messages and the debug log".
- A folder load gets the provenance `@inline`. `pluginConfigs` keys a `--plugin-dir` load as `name@inline`. [R#settings-and-environment-variables]
- Live, this machine: the mod loads into every session, desktop included, through `CLAUDE_CODE_PLUGIN_DIRS=~/Code/inbox` in the `env` block of user settings. No repo doc mentions this variable.
- A same-named installed plugin and a folder copy collide: `another plugin of that name loads first`. "The managed one, or the one loaded first, is used." [TS#refusal-messages] The plugins docs say a `--plugin-dir` copy takes precedence over an installed one of the same name (see "Plugins and marketplaces").

## Mods Claude writes

- Claude writes them to `~/.claude/dev-mods/<session-id>/<mod>/`. `~/.claude` is a protected path. Claude Code then asks whether to enable hot reload for the session. **Not now**: "nothing loads for now … the mods load the next time that session starts. To keep a mod from ever loading, delete its directory." [C#ask-claude-for-a-mod]
- "A mod Claude wrote loads only in the session that made it." It doesn't load under `-p`, `dontAsk`, an untrusted workspace, `--safe-mode`, `--bare`, `disableAllHooks` or a managed block. The folder is deleted "once it's older than `cleanupPeriodDays`". [C#use-the-mod-in-other-sessions; C#sessions-that-skip-the-approval]

## Validate

- `claude plugin validate <dir>` works "without running your code or starting a session. … It checks the manifest and runs the same static analysis on the hooks module's source that Claude Code runs when it loads a mod." [C#check-what-claude-code-reads-from-your-mod]
- It prints `hooks:` with matchers, `calls:`, `env reads/writes:`, `state reads/writes:`, and "`gating hook without .catch: tool.call`" for each hook that can refuse an action. Flags `--strict` and `--json`. [C; R#commands] The JSON report lists `gatingHooks`; the gating line is "a fact, never a warning". [skill]
- A misspelled event fails with `"tool.calls" is not an event`. A missing `modules` key passes with no `hooks` line. [TS#validate-passes-and-lists-no-hooks-line]
- Live, this repo, 2026-10-08: exits 0. Warnings: no `version` for the plugin and the marketplace entry, no author, and "CLAUDE.md at the plugin root is not loaded as project context". 17 "gating hook without .catch" lines, as notes. The JSON notes also list each module's hooks (including `session.attach{surface=desktop}`), `$` calls with call sites, env reads (`HERDR_PANE_ID`, `HOME`, `TMPDIR`) and `$.state` keys (20). This inventory is not documented. Inference: an architecture review or a `check.sh` rule could read it instead of grepping.
