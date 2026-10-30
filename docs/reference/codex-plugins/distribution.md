# Marketplaces, install, updates and the public directory

Part of [Codex plugins and the Codex app](../codex-plugins.md).

## Marketplaces, install, cache and updates

### Marketplace files

- **Where Codex looks.** "The ChatGPT desktop app can read marketplace files
  from: a repo marketplace at `$REPO_ROOT/.agents/plugins/marketplace.json`, a
  legacy-compatible marketplace at `$REPO_ROOT/.claude-plugin/marketplace.json`,
  a personal marketplace at `~/.agents/plugins/marketplace.json`."
  (D/build/plugins#how-local-marketplaces-work) No precedence is given.
- **Which file wins at one root.** With both `.claude-plugin/marketplace.json`
  and `.agents/plugins/marketplace.json` at one root, Codex reads
  `.agents/plugins/marketplace.json` [live] (docs/plans/codex-plugin/step-0-and-results.md:63).
  The row does not say which command or surface was used.
- **This repo has both.** `.agents/plugins/marketplace.json` names the `inbox`
  marketplace with one local entry, `source: {source: "local", path:
  "./codex/plugin"}`, policy `AVAILABLE` / `ON_INSTALL`, category "Developer
  Tools" [repo]. It has no `interface.displayName`, which "sets the marketplace
  title" (D/build/plugins#marketplace-metadata). `.claude-plugin/marketplace.json`
  is the Claude Code mod's, with `source: "./"`. The root
  `.claude-plugin/plugin.json` holds only `name`, `description` and `types`
  (.claude-plugin/plugin.json:1-5).
- **Entry rules.** "Always include `policy.installation`,
  `policy.authentication`, and `category`." Installation takes "values such
  as" `AVAILABLE`, `INSTALLED_BY_DEFAULT` and `NOT_AVAILABLE`. The enterprise
  page names the authentication values `ON_INSTALL` and `ON_USE`
  (L/enterprise/plugin-management#supported-formats). `source.path`
  must start with `./` and stay inside the root. "Codex resolves
  `source.path` relative to the marketplace root, not relative to the
  `.agents/plugins/` folder." (D/build/plugins#marketplace-metadata,
  #install-a-local-plugin-manually)
- **Other sources.** Git: `"source": "url"` for a repo root, or `"git-subdir"`
  with `url`, `path`, `ref` or `sha`. npm: `package`, optional `version`,
  optional HTTPS `registry`; "Codex downloads the package without running
  lifecycle scripts. The `npm` CLI must be installed." "If Codex can't resolve
  a marketplace entry's source, it skips that plugin entry instead of failing
  the whole marketplace." (D/build/plugins#marketplace-metadata)
  [inference] An npm source is a documented alternative to committing
  `codex/plugin/dist`, at the cost of a publish step.

### CLI commands

- `codex plugin marketplace add owner/repo | owner/repo@ref | --ref main |
  <git url> --sparse PATH | ./local-root`, then `list`, `upgrade [name]`,
  `remove name`. `list` "prints each marketplace Codex is considering and the
  root path it resolves from". (D/build/plugins#add-a-marketplace-from-the-cli)
- `codex plugin add|list|remove`, all with `--json`.
  (L/developer-commands?surface=cli#codex-plugin)
- "Use the ChatGPT desktop app to install and test a local plugin."
  (D/build/plugins#add-a-marketplace-from-the-cli)
- Desktop deep links: `codex://plugins/install/<plugin-name>?marketplace=<m>`,
  `codex://plugins/<plugin-id>`, `codex://plugins/<name>?marketplacePath=<abs>`.
  (L/reference/commands#supported-links)

### Enabling and the plugin key

- **Key format.** `[plugins."my-plugin@local-repo"] enabled = true|false`.
  "The quoted key uses `plugin-name@marketplace-name`."
  (D/build/plugins#enable-or-disable-a-plugin-for-a-repo)
- "During marketplace refresh, Codex can install or refresh files for
  configured plugins, even when `enabled = false`." "Codex loads project
  `.codex/config.toml` only for trusted projects." "These settings apply to
  local-marketplace plugins in supported local clients, including Codex CLI
  and Codex in the ChatGPT desktop app." (same section)
- "The plugin browser saves user-level choices in `~/.codex/config.toml`."
  (D/build/plugins#how-local-marketplaces-work)
- **Live config on the test Mac** [live 2026-10-08]:
  `[marketplaces.inbox] source_type = "local"` with `source` set to the
  checkout, and `[plugins."inbox@inbox"] enabled = true`.

### Cache and data folders

- **Documented cache path.** "ChatGPT installs plugins into
  `~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/`. For local
  plugins, `$VERSION` is `local`, and ChatGPT loads the installed copy from
  that cache path rather than directly from the marketplace entry."
  (D/build/plugins#how-local-marketplaces-work)
- **Live cache layout differs** [live 2026-10-08]:
  - The inbox is at `~/.codex/plugins/cache/inbox/inbox/0.1.0/`, the manifest
    version, not `local`. `diff -rq` against `codex/plugin` showed no
    differences.
  - Another local marketplace keeps `0.1.0`, `0.1.1` and `0.1.3` side by side.
  - Git-backed `openai-curated` uses a short hash folder (`github/1dc19589`).
  - `openai-bundled/chrome` has both `26.930.61225` and `latest`.
  - No `local` folder exists anywhere.
- **Data folder.** "`PLUGIN_DATA` points to the plugin's writable data
  directory." (D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks) No
  page says where it is. Live, `~/.codex/plugins/data/inbox-inbox` exists
  [live 2026-10-08].
- **How the server finds it.** `dataDir` reads `INBOX_DATA` or `PLUGIN_DATA`.
  Otherwise it maps `<home>/plugins/cache/<market>/<plugin>/<version>` to
  `<home>/plugins/data/<plugin>-<market>`, and falls back to
  `~/.codex/inbox-dev` (codex/src/state.ts:dataDir). MCP server processes
  found the hooks' data folder this way [live]
  (docs/plans/codex-plugin/step-0-and-results.md:133). The `<plugin>-<market>` order is a code
  assumption: it cannot be told apart while both names are "inbox".
  [inference] The regex ignores the version segment, so a switch to `local`
  would not break it. A change to the `data/` naming would.
- **Session files.** The folder holds one `sessions/<id>.json` per session.
  The server keeps the newest `KEPT_SESSIONS` (40, the Claude Code mod's count)
  by last save time and deletes older ones, once per session per server
  process, after that session's first tool call
  (codex/src/state.ts:pruneSessions). It never deletes the calling session, a
  file whose lock is held, or a file it cannot read or that a newer build
  wrote.

### Updates

- "After you change the plugin, update the plugin directory … and restart the
  ChatGPT desktop app so the local install picks up the new files."
  (D/build/plugins#install-a-local-plugin-manually)
- Bundled skills and tools need a new session after install
  (L/plugins#how-permissions-and-data-sharing-work).
- Git marketplaces refresh with `codex plugin marketplace upgrade`
  (D/build/plugins#add-a-marketplace-from-the-cli).
- Uninstalling "removes the plugin bundle from that ChatGPT or Codex
  environment". "Separately connected MCP server integrations remain
  connected in ChatGPT until you disconnect them there." Workspace-installed
  or default plugins may not offer Uninstall. (L/plugins#remove-a-plugin)
- Plugin management moved into Settings in desktop 26.707
  (L/changelog#codex-2026-07-09-app). L/reference/settings lists no Plugins
  section.

## Public directory and submission

None of this applies to a Git or local install. It matters only if the inbox
is ever listed publicly.

- **Hooks block listing.** "Plugin ZIPs containing app references (`apps` /
  `.app.json`) or lifecycle hooks cannot currently be submitted … If your
  plugin depends on lifecycle hooks, distribute it so users can install it
  manually in Codex desktop." (D/deploy/submission#automatically-provide-submission-and-review-information)
  The same rule is in D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks
  and D/guides/submit-claude-plugin ("Remove lifecycle hooks before public
  directory submission").
- **A local server blocks listing, with an exception.** "For public
  submission, submit the remote HTTPS endpoint through With MCP. If your MCP
  server runs locally, deploy it to a public HTTPS URL. If you can't, reach
  out to your OpenAI contact for local MCP support."
  (D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks) The endpoint must
  use Streamable HTTP (D/guides/submit-claude-plugin).
- **Mobile is required.** "Plugins must function reliably in ChatGPT on both
  desktop and mobile, including any UI components." (D/plugin-guidelines#testing)
  [inference] A local stdio tab cannot meet this.
- **Name rule.** Avoid "single-word dictionary terms that aren't explicitly
  tied to your brand." (D/plugin-guidelines#plugin-name-description-and-prompts)
  "Inbox" is one.
- **Tool rules** (D/plugin-guidelines#tools, #correct-annotation,
  #tool-independence-and-exposure):
  - Each tool needs explicit boolean `readOnlyHint`, `destructiveHint` and
    `openWorldHint`. `readOnlyHint` is false for "external-state changes,
    persisting artifacts, starting stateful jobs or workflows, queuing work".
    "Being able to undo an action does not, by itself, justify setting
    destructiveHint to false."
  - [inference] `record`, `close` and `inbox_press` all need
    `readOnlyHint: false`. The inbox's tools set no annotations today
    (codex/src/server-tools.ts:TOOLS).
  - "Do not request the full conversation history … Your MCP server must not
    pull, reconstruct, or infer the full chat log from the client or
    elsewhere." The per-reply update reads the Stop hook's `last_assistant_message`
    and the tool activity the hooks noted, not the transcript
    (codex/src/hook.ts:handleHook).
  - Responses must not include "session IDs, trace IDs, request IDs,
    timestamps" unless needed.
  - "Do not use discovery, operation selection, or schema fetching with a
    generic executor to enable operations not individually exposed for
    review." [inference] A generic "press any action" tool may fail this.
- **Submission mechanics** (D/deploy/submission):
  - Org owners or members with Apps Management Write, plus identity
    verification.
  - "Your package can declare multiple MCP servers, but only one MCP server can
    be connected per plugin." "Adding an MCP server to an existing skills-only
    plugin is not currently supported."
  - Domain verification at `/.well-known/openai-apps-challenge`. Reviewers
    need 5 positive and 3 negative test cases plus a video.
  - The hosted server is scanned daily; "New tools remain unavailable until
    approved". "Only one review can be active per plugin." Changing an MCP
    server URL needs support.
  - `plugin_version_unchanged`: "A new release must use a different manifest
    version; reusing the published version requires confirmation." It is a
    warning, not an error. (D/deploy/submission-errors#zip-upload-errors-and-warnings)
  - Screenshots, if given: one per starter prompt, "exactly 706 pixels wide and
    400–860 pixels tall". (D/deploy/submission-errors#final-submission-requirements)
- **Testing endpoints.** Secure MCP Tunnel or a development tunnel can reach a
  local server for testing. "These testing options do not replace the public
  HTTPS endpoint required for plugin submission." Tool metadata changes need
  Refresh, which "applies to custom MCP servers connected directly in
  ChatGPT". (D/deploy/connect-chatgpt#prepare-the-endpoint, #refresh-metadata)
- **Converting a Claude Code plugin** (D/guides/submit-claude-plugin):
  - "Claude marketplace listings and approvals don't transfer."
  - `.claude-plugin/plugin.json` can be kept for direct upload: "The portal
    converts it to `.codex-plugin/plugin.json`."
  - `commands/` and `agents/` must become skills. `outputStyles`,
    `lspServers`, `experimental.themes`, `experimental.monitors`, `channels`
    and `dependencies` must move into skills or go. "The portal doesn't
    accept .mcpb files."
  - "OpenAI doesn't run Claude installation prompts or expand `user_config`
    variables." "OpenAI doesn't currently support Claude live artifacts."
  - Skills that name Claude should use "provider-neutral language".
  - "Contact your OpenAI partner before submitting if the plugin's core value
    requires local execution, arbitrary access to files on the user's
    computer … offline operation, or inbound channel messages."
