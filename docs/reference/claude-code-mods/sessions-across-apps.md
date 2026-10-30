# Remote Control and sessions across processes

Part of [Claude Code mods](../claude-code-mods.md).

## Remote Control

**Remote Control** lets claude.ai, the Claude mobile apps, or the desktop app view and steer a Claude Code session that keeps running on your machine. "The web and mobile interfaces are a window into that local session." [RC]

- Mods: hooks run "in the session on your machine"; drawings appear "In the terminal on your machine". [O#where-mods-run] The row names only "claude.ai or the mobile app".
- The desktop app is also a viewer: devices "view or steer Remote Control sessions from claude.ai, the Claude mobile apps, or Claude Desktop". [RC#trusted-devices] Whether a desktop viewer attaches as surface `desktop` (which would turn the inbox on, `hooks/register.tsx:on('session.attach')`) is unknown.
- Types: a Remote Control prompt arrives through `session.receive` with origin kind `bridge`, "the user's own from a Remote Control client". Kinds also include `'projects-relay'`. A `/config key=value` from the bridge is "not attestably the owner's hand". [T: `SessionReceiveOrigin`; `config`]
- Requirements: Pro, Max, Team or Enterprise ("API keys are not supported"; Team and Enterprise need an Owner to enable it). Not on Bedrock, Agent Platform, Foundry, a non-Anthropic `ANTHROPIC_BASE_URL`, or a Claude apps gateway. `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` or `DISABLE_GROWTHBOOK` makes it unavailable. ZDR and HIPAA orgs can't enable it. [RC#requirements; RC#connection-and-security]
- Ways to start: `claude remote-control` (server mode), `claude --remote-control` / `--rc` (interactive), `/remote-control` / `/rc` in a session (terminal, desktop Code mode, VS Code). `remoteControlAtStartup` auto-connects; in the desktop app it is "Settings > Claude Code > Connect new sessions to Remote Control". [RC#start-a-remote-control-session; RC#enable-remote-control-for-all-sessions]
- Server mode: `--spawn same-dir` (default, "all sessions share the current working directory"), `worktree`, or `session`; `--capacity` defaults to 32. It "gives up after roughly 10 minutes" without network and exits; sessions revive "for about four hours". If org policy turns it off, "the server stops and archives the sessions it was serving, then exits". [RC#start-a-remote-control-session; RC#limitations; RC#remote-control-was-turned-off-by-your-organizations-policy]
  - Inference: server-mode sessions have no REPL, so `isInteractive` is probably false and the inbox stays off unless a desktop viewer attaches. With `same-dir`, many sessions would share one project key and press on `KEPT_SESSIONS = 40`.
- "outside of server mode, each Claude Code instance supports one remote session at a time." [RC#limitations]
- Commands: "commands that only run in the terminal interface, such as `/plugin` or `/resume`, work only from the local CLI". Text-output commands work from mobile and web, including `/reload-plugins`, which "works only when the session runs in an interactive terminal". The page says nothing about mod commands such as `/inbox`. [RC#limitations]
- Dialogs: permission prompts and `AskUserQuestion` stay open until answered. Other forwarded dialogs close after five minutes with their "no-action default" (`dialogExpiry`). [RC#limitations] Inference: inbox questions that must wait belong in ledger rows, not dialogs.
- Push notifications: "Claude decides when to push." Toggles "Push when Claude decides" and "Push when actions required". [RC#mobile-push-notifications] Whether `$.ui.notify` from a mod reaches the phone is unknown.
- Devices can change the session's model and effort. [RC#what-connected-devices-see] The inbox pins its own model, so this should not change its update call. Not verified.
- After `/resume` switches conversations, a connected device doesn't get the new title or history. [RC#what-connected-devices-see]
- "While Remote Control is connected, the session transcript, including your messages, Claude's responses, and tool activity, is stored on Anthropic servers." [RC#connection-and-security] This includes text the inbox adds.
- "If you close the terminal, quit the Desktop app or VS Code, or otherwise stop the `claude` process, the session goes offline." [RC#limitations]

## Sessions across processes and apps

### Session ids and storage

- A session is "a saved conversation tied to a project directory". Transcripts live at `~/.claude/projects/<project>/<session-id>.jsonl`. "The entry format is internal to Claude Code and changes between versions". Retention is 30 days (`cleanupPeriodDays`). [SE#where-transcripts-are-stored]
- `$.session.id()` "Returns the session's id (the transcript file's name)". [T: `session.id`]
- Live: desktop Code-mode sessions store transcripts under `~/.claude/projects` too, and appear in `claude agents --json` and `ListAgents` (label `Claude Desktop session`). They share the CLI's store.
- Events that give a new session id or a fresh process, so `$.state` starts empty: `/clear` (new id, no `session.start`); `/branch` and `--fork-session` (new ids); `/fork` (new id, new background process); `--resume <id> --bg` (same id or a copy with a `note:`); `←` or `/bg` ("a fresh process that resumes from the saved conversation"). [SE#branch-a-session; AV#what-carries-over-when-you-background; AV#from-your-shell] The ledger must load from the store by session id.
- `/branch` keeps a Remote Control connection: "A phone or browser connected to the session follows you into the branch". [SE#branch-a-session]
- "If you resume the same session in two terminals without forking, messages from both interleave into one transcript". [SE#branch-a-session] Inference: a ledger keyed by session id can see two live processes for one id.
- `-p` and SDK sessions are left "out of the session picker and out of `claude --continue`". [SE#resume-a-session] Inference: desktop Code-mode sessions, being SDK-style, are excluded too; "a desktop-app session resumes in the desktop app". [SE#name-your-sessions]
- A resume restores history, model, agent and permission mode, but `--mcp-config`, `--settings`, `--plugin-dir`, `--fallback-model` and `--add-dir` "must be passed again". [SE#what-a-resumed-session-restores]
- Names are not stable keys: default names (`my-app-3f`) change on `/rename` or plan accept, and duplicates get suffixes. Use the full `sessionId`. [SE#name-your-sessions]

### `claude agents --json`: the supported session list

- "`claude agents --json` is the supported way to read session state from outside Claude Code." It "prints active sessions as a JSON array and exits: every live session, plus background sessions that are still working or blocked even when their process has exited". `--all` adds completed sessions. [AV#read-session-state-from-a-script; AV#list-sessions-as-json]
- Fields: always `cwd`, `kind` (`interactive` | `background`), `startedAt`. Background only: `id`, `state` (`working` | `blocked` | `done` | `failed` | `stopped`). While the process lives: `pid`, `status` (`busy` | `waiting` | `idle`); with `waiting`, `waitingFor` (`permission prompt`, `input needed`, `sandbox request`, `worker request`, `dialog open`). When set: `sessionId` and `name`. "`blocked` always means the session needs something from you". [AV#list-sessions-as-json]
- "The files under `~/.claude/jobs/<id>/` are not a stable interface." [AV#read-session-state-from-a-script]
- Live (2.1.295): 17 to 18 entries; interactive entries had keys `cwd, kind, name, pid, sessionId, startedAt, status`; background entries `cwd, id, kind, name, sessionId, startedAt, state`. Two interactive entries were desktop Code-mode sessions. No entry showed `waitingFor` (none was waiting).
- Inference: it fills the liveness gap for an "every open session" view. Its `sessionId` joins to the inbox's `s:<sessionId>` keys and to `$.session.send`. A mod can run it with `$.process.run`. It doesn't cover Codex, cloud, other machines, or another `CLAUDE_CONFIG_DIR` (which runs a separate supervisor). [AV#where-state-is-stored]
- Agent view already shows per-session needs-input, working and done, a Haiku summary per turn, PR status and notifications. [AV] The inbox's distinct value is item-level: questions, the person's tasks, findings.
- Background sessions: an idle one left unattached about an hour has its process stopped and restarts on reply; "Attached sessions always render in fullscreen mode". [AV#the-supervisor-process; AV#attach-to-a-session] Whether the mod turns on in a background session is unknown. If it does, each one adds per-turn Sonnet calls.

### Cross-session messaging

- "A message is a piece of text one Claude writes to another". Claude uses `ListAgents` and `SendMessage`. "When the receiving session is idle, Claude Code starts a new turn with the message". "Once delivered, the message counts toward usage like a prompt you type". [XSM#message-delivery]
- Same machine: "per-session socket on macOS and Linux, or a per-session named pipe on native Windows, never through Anthropic servers". Other machines and cloud go through Anthropic servers and need Remote Control. [XSM#message-sessions-on-other-machines]
- A message "can't approve anything", "can't change configuration", and "Commands don't run". [XSM#how-a-session-treats-an-incoming-message]
- `crossSessionInbound`: `accept`, `hold`, `refuse`. "A session in the VS Code extension or the Desktop app can't show the dialog", so held messages wait until `dialogExpiry` (5 minutes) and drop. At most 50 queued accepted messages; about a million characters per message. [XSM#control-inbound-messages; XSM#limitations]
- Requires 2.1.224 (macOS, Linux, WSL2) or 2.1.234 (Windows); 2.1.248 on third-party providers. [XSM]
- Types (not in docs): `$.session.send({ to, text })` is "the model's SendMessage tool's own call and delivery"; `to` can be `{ sessionId }`. "A session that is not running now is not delivered to". A `session.receive` hook can return `{ consumed: reason }`: "nothing is queued, shown or read by the model". `origin.plugin` is "AS THE SENDER SAYS ... never key a guard on it". [T: `session.send`, `session.receive`]
- Inference: mod-to-mod pings between inbox sessions are possible this way, under the same hold rules. A shared store is simpler for persistence.

### Prompt origins

`PromptOrigin.kind` in the types: `composer` (the person's own gesture, "never presumed"), `bridge` (Remote Control), `sdk`, `peer`, `peer-send-message`, `channel`, `scheduled-trigger`, `task-notification`, `projects-relay`, `coordinator`, `observer`, `observer-activity`, `auto-continuation`, `slack-ping`, `plugin` ("A plugin's `$.prompt.submit`"), `unclassified` (same-user socket posts and unstamped engine notices). [T: `PromptOrigin`]

- The inbox counts a prompt as the person's words only for `composer`, `bridge`, or `plugin` with `asUser` (`hooks/register.tsx:isPersonsWords`).
- The types' settings-hook `UserPromptSubmit.source` defines `sdk` as the "non-interactive entrypoint (`-p` / Agent SDK)". [T] What a desktop Code-mode prompt carries is unknown. See "Unknown, and how to check".

### Channels

- A channel is "an MCP server that pushes events into your running Claude Code session". Research preview, allowlist-gated, needs `--channels` at launch, claude.ai or Console auth, not on Bedrock, Agent Platform or Foundry. "Events only arrive while the session is open". [CH]
- The development flag: "If you pass it in non-interactive mode with `-p` or through the Agent SDK, Claude Code ignores the flag and the channel doesn't register." [CHR#test-during-the-research-preview] Inference: channels are likely unavailable in desktop Code mode.
- Inference: not a viable inbox transport today. A later use could push CI and review events into a session.
