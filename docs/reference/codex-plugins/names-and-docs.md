# Names and surfaces, and where the docs live

Part of [Codex plugins and the Codex app](../codex-plugins.md).

## Names and surfaces

- **Codex is a mode of the ChatGPT desktop app.** "On July 9, the Codex app
  merged into the ChatGPT desktop app for macOS and Windows. Codex keeps its
  dedicated coding experience alongside ChatGPT's Chat and Work."
  (L/whats-new#use-codex-in-the-chatgpt-desktop-app; changelog entry
  "Codex joins the ChatGPT desktop app 26.707", L/changelog#codex-2026-07-09-app)
- **How a person reaches it.** "Choose ChatGPT or Codex. In ChatGPT, use the
  toggle above the composer to select Chat or Work. In Codex, start with New
  chat." (L/app#get-started-with-the-desktop-app) "In the ChatGPT desktop
  app, open the ChatGPT dropdown and select **Codex**." (L/environments/modes)
- **The binary still names itself Codex Desktop.** Desktop transcripts record
  `originator: "Codex Desktop"` and `source: "vscode"` [live]
  (docs/plans/codex-plugin.md:331). The app ships inside
  `/Applications/ChatGPT.app`, with the CLI at
  `Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex` [live 2026-10-08].
- **Docs disagree on the name.** learn.chatgpt.com says "Codex in the ChatGPT
  desktop app". developers.openai.com still says "Codex desktop" ("manually
  installed Codex desktop plugins", D/build/plugins). This repo says "Codex
  desktop app" (codex/README.md:3).
- **Where a Codex chat runs.** Local, Worktree or Cloud. "Both **Local** and
  **Worktree** chats run on your computer." Cloud tasks need a published
  environment, and "Your computer's local files, running processes, browser
  sign-ins, and VPN access aren't automatically transferred to it."
  (L/environments/modes) [inference] A Cloud chat cannot run the inbox's local
  hooks or stdio server.
- **Platforms.** macOS and Windows; Linux is in preview for Ubuntu, Debian and
  Fedora (L/app#get-started-with-the-desktop-app, L/changelog#codex-2026-08-11-app).
- **Which surfaces support plugins.** "Plugins work in Chat and Work across
  ChatGPT on the web, desktop, and mobile, and in Codex in the ChatGPT desktop
  app. Codex CLI also has a plugin browser for Codex environments. The IDE
  extension doesn't support plugins." (L/plugins#overview)
- **Desktop-only plugins.** "Any imported plugin that declares MCP servers in
  `mcp.json` or `.mcp.json` is marked Desktop only and works only in the
  ChatGPT desktop app. This includes servers that use a remote HTTPS URL. The
  same restriction applies to other supported MCP configuration forms, such as
  inline server declarations."
  (L/enterprise/plugin-management#desktop-only-plugins) "You can discover
  these plugins on the web, but you must open the ChatGPT desktop app to
  install and use them. They aren't available on mobile." (L/plugins#overview)
- **Plugins Directory tabs.** "OpenAI", the workspace's name, and "Personal"
  ("including Created by me and Shared with me sections"), plus "the separate
  Installed row". (L/plugins#universal-plugin-directory)
- **API-key sign-in.** People signed in with an API key "can browse, install,
  and manage supported OpenAI-curated plugins in Codex CLI and Codex in the
  ChatGPT desktop app". Some are unavailable because "their connection flows
  require unsupported OAuth capabilities". (L/plugins#api-key-availability)
  Whether local-marketplace plugins work under API-key sign-in is not stated
  [unknown].
- **ChatGPT web reaches plugins only as remote MCP tools.** "ChatGPT web
  doesn't read local Codex configuration files." "ChatGPT web can use remote
  MCP-backed tools supplied by plugins." (L/extend/mcp) [inference] The inbox's
  local stdio server is unreachable there.
- **CLI.** "enter `/plugins` to open the plugin browser. Install a plugin from
  a configured marketplace, then start a new session before using its bundled
  skills or tools." Space on an installed plugin turns it on or off.
  (L/plugins#plugin-browser-in-codex-cli) [inference] The inbox's hooks can
  therefore fire in Codex CLI sessions, where no Inbox tab exists.
- **Glossary terms.** "Chat" is the user-facing word. "Thread" is "A technical
  object in Codex app-server APIs that contains turns and stored conversation
  history." "Turn" is "One exchange in a chat". There is no plain "Session"
  entry, only "Ephemeral session": "Non-interactive run that skips saving
  session state after it completes." (L/glossary)
- **Words Codex already uses.** "Finding" means "A notable result or issue
  surfaced by a scheduled task", reported in Triage. "Task" is being renamed
  to "chat" but survives in many anchors and changelog lines. (L/glossary)
  Inbox copy in the Codex client should avoid clashing with these.
- **dots.** A documented ChatGPT product: "An always-on agent that keeps work
  moving and asks for your input when a decision needs you." (L/dots) It
  overlaps with the inbox's purpose. Plugin and command hooks do not run in
  its cloud orchestration (L/hooks#managed-hooks-from-requirementstoml).

## Where the docs live

- **Old paths redirect.** Checked with `curl -w %{redirect_url}` on
  2026-10-08 [live 2026-10-08]:

  | Old path | Now |
  | --- | --- |
  | `developers.openai.com/codex/hooks` | 308 to `learn.chatgpt.com/docs/hooks` |
  | `developers.openai.com/codex/plugins` | 308 to `learn.chatgpt.com/docs/plugins` |
  | `developers.openai.com/codex/enterprise/plugin-management` | 308 to `learn.chatgpt.com/docs/enterprise/plugin-management` |
  | `developers.openai.com/codex/enterprise/managed-configuration` | 308 to `learn.chatgpt.com/docs/enterprise/managed-configuration` |
  | `developers.openai.com/codex/config-file/config-basic` | 308 to `learn.chatgpt.com/docs/config-file/config-basic` |
  | `developers.openai.com/codex/plugins/build` | 308 to `developers.openai.com/plugins/build/plugins` |
  | `developers.openai.com/apps-sdk` | 301 to `developers.openai.com/plugins` |
  | `developers.openai.com/apps-sdk/deploy/submission` | 301 to `developers.openai.com/plugins/deploy/submission` |
  | `learn.chatgpt.com/codex/hooks`, `/codex/plugins` | 308 to `learn.chatgpt.com/docs/...` |

- **Two doc sites split the topic.** learn.chatgpt.com covers Codex use,
  hooks, config, enterprise and app-server. developers.openai.com/plugins
  covers plugin packaging, submission, MCP servers and UI.
- **Markdown copies.** "Markdown versions of documentation pages are available
  by appending `.md` to the page URL." (learn.chatgpt.com) `L/changelog.md`
  returns "Not found"; read the HTML.
- **This repo links to no OpenAI docs.** A grep for
  `developers.openai.com|learn.chatgpt|apps-sdk` found hits only in
  `node_modules`, `package-lock.json` and worktree copies [live 2026-10-08].
  `docs/plans/codex-plugin.md` tags claims "[documented]" without URLs.
