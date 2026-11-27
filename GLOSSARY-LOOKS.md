# Glossary: looks and hosts

Part of [the glossary](GLOSSARY.md).

**Look**:
One of the five public ways the inbox is drawn: `terminal` in the Claude Code
terminal, `desktop` in the pane of the Claude desktop app's Code sessions,
`codex` in the Codex tab, `omp` in omp's panel, and `herdr` in a pane of the
Herdr app (`core/view/rows.ts:Look`). The private, unannounced Exact Web
(`exact-web`) and Exact iOS (`exact-ios`) looks in `exact/` also draw published
sessions and opted-in Codex companion sessions through `PUBLISHED_LOOKS`.
_Avoid_: client, surface

**Host**:
The program that runs the inbox code. Claude Code runs the mod, which draws
the terminal and desktop looks. Codex runs the plugin, which draws the Codex
tab. omp runs the extension in `omp/`, which draws the omp panel. The Herdr
look has no host of its own: a host running in a Herdr app terminal publishes
its session, and the Herdr app runs the mod in `herdr/`, which draws it.

**Published session**:
The file a host writes for the Herdr look at
`<app home>/inbox/sessions/<session id>.json`, after each saved change. It
holds the session with its source: the host, the agent, the session id, the
terminal, and the project folder when the host knows it. The terminal's `inbox.session` label names it. `core/remote/herdr-envelope.ts:HerdrEnvelope`.

**Shared module**:
A file in `core/` that every host consumes, directly or through a build.
`docs/looks.md` gives its layers.

**Adapter**:
The code that draws the shared view in a look. For the terminal and desktop
looks, it is `hooks/mod/mod-pane-render.tsx`, `hooks/mod/mod-band.tsx` and
`hooks/pane/`. For the
Codex tab, it is `codex/src/tab.tsx`, the other `codex/src/tab-*` files,
`codex/src/row-actions.tsx` and the styles in `codex/src/tab-css/`. For the omp
panel, it is `omp/src/panel.ts` and the other `omp/src/panel-*.ts` files.
For the Herdr look, it is the files in `herdr/src`.

**Difference on purpose**:
A behavior that differs between looks because one look cannot do something,
or because the product decided so. Any other difference is drift.

**Catch-up**:
Rebuilding the ledger from the whole conversation, instead of from one reply's
exchange. `runUpdates` does it when `needsCatchUp` says the ledger may have
missed a turn, and the host can read the conversation.

**Behind**:
The ledger state (`ledgerState: 'behind'`) for a session the inbox has recorded
nothing of, though it already has turns. The next update catches up. Only
`failed` shows a warning.

**Dropped reply**:
An exchange whose update failed twice, so its reply never reached the ledger.
`presence.hasDroppedReply` keeps the "may be missing" warning until a catch-up
covers it. While a catch-up cannot read the conversation, the warning says so,
and the next update tries again.

**Next build**:
A checkout that follows the `next` branch and holds `NEXT_BUILD_MARK`, a file
Git ignores, in each folder a host loads or installs. Each look's version label
adds "next" on one, and only a next build keeps Status call records.
`core/view/banners.ts:versionLabel`, `core/runtime/status-records.ts`.

**Parity record**:
`core/domain/clients.ts`. It lists, for each host and published look, whether each
feature is `full`, `host`, `different` or `unsupported`, with a reason for the
last two. Each such entry needs a row in "Differences on purpose" in
`docs/looks.md`, and `scripts/check-structure.mjs` fails when one is missing.

**Tool fields**:
The input fields each inbox tool has for the agent of one conversation
(`ToolFields`). A tool's answer asks the agent only for fields in this list.
The list can be older than the build: Claude Code keeps a conversation's first
tool schemas when the conversation resumes on a later build, so the mod saves
the list as `Session.toolFields`. Only a conversation the mod saw start gets
this build's list. A fork gets its parent's, and any other conversation with no
saved list gets 0.3.0's. Codex takes the list from the server's last
`tools/list` answer, and omp registers this build's tools.
`core/domain/tool-schemas.ts:TOOL_FIELDS`, `V0_3_TOOL_FIELDS`.

The engine has two terms of its own. Its `surface` is where Claude Code runs,
and includes `mobile` and `vscode`; `lookOf` in `hooks/pane/palettes.ts` maps it to
a look. Its `Client` is a drawn region that takes clicks over its whole shape.
