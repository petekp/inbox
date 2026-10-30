# Claude and Claude Code as hosts

Part of [MCP Apps](../mcp-apps.md).

## Claude

### Routes into Claude mode

- **URL connectors cannot reach the Mac.** "Claude connects to your remote MCP server from Anthropic's cloud infrastructure, rather than from your local device. This is true across every Claude client, including claude.ai, Claude Desktop, Cowork, and the mobile apps" ([support 11175166](https://support.claude.com/en/articles/11175166), "Network requirements"). "a `localhost` address isn't reachable that way" (MA quickstart #see-the-ui-render-in-claude).
- **`claude_desktop_config.json` is local.** Servers there "are a separate mechanism and do use your local network, but those aren't available in Cowork or claude.ai" (support 11175166). "A server you define in `claude_desktop_config.json` is available in both the Desktop chat surface and local Code tab sessions" ([desktop.md](https://code.claude.com/docs/en/desktop.md) L995-999). The standalone CLI does not read it (L1002).
- **A `.mcpb` desktop extension is local.** It "runs on your computer in the Claude desktop app" ([connectors getting-started](https://claude.com/docs/connectors/getting-started) #where-connectors-work) over stdio ([mcpb](https://claude.com/docs/connectors/building/mcpb)). Directory listings for `.mcpb` "are deprecated".
- **A plugin's local MCP server does not reach Chat.** Chat: "Ignored". Cowork: "Loads when the Cowork session runs on your computer" (platform-support #compare-component-support-by-app).
- **A stdio proxy can bridge.** "To test a remote MCP App locally, connect to it through a proxy such as [mcp-remote]" (MA getting-started #build-your-own-mcp-app). [inference] A config-file proxy can reach an HTTP server on `localhost`.
- [inference] A Claude-mode inbox is desktop-only, because only the desktop app runs a local server.

### Consent and setup

- "Claude asks for permission to display the app. Click **Allow**, or **Always allow** for a server you trust" (MA getting-started #ask-claude-to-use-the-app).
- HELP says instead: "Interactive connectors are default on when you have the relevant connector enabled. No additional setup is needed."
- The connector must be "enabled for your current conversation" (HELP, Troubleshooting).
- Team and Enterprise owners "can disable the specific tool calls that render interactive connectors" (HELP).
- Tool calls themselves can ask for approval, with Allow once or Always allow (connectors getting-started #use-the-connector-in-a-conversation).

### Identity and instances

- No conversation id is given. The suggested key is one the server mints, "such as a UUID minted once per client connection, and return it in `structuredContent`" (MA instance-supersession #channel-scope-and-ui-domain).
- "On claude.ai on the web, `hostContext.toolInfo.id` is the stable tool-use ID". "On Claude iOS, `toolInfo.id` is `undefined` when a stored conversation is rehydrated" (#cache-the-key-across-remounts). Desktop and Android are not covered.
- "Each time Claude calls a tool that renders an MCP App, Claude mounts a separate iframe in the conversation. No host API unmounts earlier instances" (intro). "Each copy independently pushes model-context updates ... and messages to Claude."
- "Client mount time doesn't reflect tool-call order" because stored conversations lazy-mount widgets as they scroll into view (#understand-why-the-key-comes-from-the-server).
- "Tool results are stored in the conversation transcript, so every device and every remount of the widget sees the same key" (#understand-how-supersession-works). [inference] A remount gets the stored result, so live data must come from app-initiated calls.
- The page's pattern: elect the newest copy over a BroadcastChannel, and have superseded copies stop calling `updateModelContext` and `sendMessage` themselves (#gate-host-mutating-calls-on-superseded).
- A hand-written bridge "silently drops requests the host sends ... such as `ping` ... and `ui/resource-teardown`". "claude.ai on the web doesn't send either to widgets, and Claude iOS sends `ui/resource-teardown` only when the user navigates away from the conversation" (#if-you-bypass-the-sdk-app-class). Desktop is not covered.

### Sandbox origin

- "Claude serves all widget iframes from a single connector from the same sandbox origin on `*.claudemcpcontent.com`, and the iframe sandbox includes `allow-same-origin`" (MA instance-supersession #understand-how-supersession-works).
- "Without `ui.domain` ... Claude derives the iframe origin from the conversation and connector". "With a fixed `ui.domain`: the origin is shared across every conversation and tab for your connector" (#channel-scope-and-ui-domain).
- "For Claude, the value is the first 32 hex characters of the SHA-256 of your server URL, followed by `.claudemcpcontent.com`" (MA getting-started #set-ui-domain-for-claude).
- "local connectors have no URL to hash, so `ui.domain` isn't available for them. Remove the field" (MA troubleshooting #ui-domain-validation-fails). [inference] A local inbox view's `localStorage` and BroadcastChannel are per conversation.
- On desktop, the app is "an iframe nested inside another iframe" (MA troubleshooting #claude-desktop).

### Display modes and design guidance

These are guidelines. Whether Claude enforces them is unknown.

| Mode | Guidance | Source |
| --- | --- | --- |
| Inline card | "Height auto-fits to content, with no nested scrolling". "At most 2 actions". "At most 4-5 data points". "No drill-ins, breadcrumbs, or multiple views". "No menus or popovers". | MA design-guidelines #inline-card |
| Inline carousel | 3-8 items, each with image, title, up to 3 lines of metadata and 1 optional CTA | #inline-carousel |
| Full screen | "The composer is always visible". "Your app provides its own fullscreen button, and a close button appears in the native header bar". "No floating panels, so use collapsible sidebars, tabs, or pagination". | #full-screen |
| `pip` | Named as a protocol mode. No Claude behavior described. | #declare-supported-display-modes |

- "The inline card might show a summary, and fullscreen mode can offer the detailed view" (#reveal-complexity-progressively).
- "If the interaction requires language understanding or generates a response from Claude, it goes through chat." "Text entry and freeform input" belongs in chat (#decide-between-app-and-chat-interactions).
- "Apps always fill the container width"; design "from 320px up to fullscreen" (#host-context-for-layout).
- "On mobile touch devices, the conversation view owns vertical scrolling" and "the host also caps inline height and clips content" (#scrolling-and-gestures). Web and desktop height caps are not stated.
- "on web and desktop the composer can overlay the bottom of an inline app"; read `safeAreaInsets` (#safe-areas).
- If `prefersBorder` is unset, content "renders borderless on web and bordered on mobile" (#borderless-inline-content).
- "Closing fullscreen returns to the conversation at the same scroll position" (#transitions).

### Links

- "When your MCP App sends a `ui/open-link` request, Claude shows an Open external link confirmation modal". "Custom connectors and locally configured servers always show it" ([MA external-links](https://claude.com/docs/connectors/building/mcp-apps/external-links.md), intro).
- "If the user confirms, the link opens in a new tab. If they dismiss the modal, the request resolves as cancelled" (#default-link-behavior). What a confirmed request resolves with is not stated.
- Only directory connectors can skip the modal, through an allowlist (#allowlist-link-destinations).

### Theming

- "every frame between your widget and the chat surface already has a transparent background" (MA transparent-theming, intro).
- Set `html, body { background: transparent }`, add `<meta name="color-scheme" content="light dark">`, and set `prefersBorder: false` (#let-the-host-background-show-through). The meta tag "covers the first paint before your script runs and prevents an opaque-backdrop flash" (#read-hostcontext-and-listen-for-changes).
- `styles.css.fonts` carries Anthropic Sans `@font-face` from `https://assets.claude.ai`. Allow it with `resourceDomains`, which "also adds the listed origins to `script-src` and `style-src`" (#allow-the-host-font-origin-in-your-csp).
- The token tables (colors, `font-sans` "Anthropic Sans, sans-serif", `font-mono` "ui-monospace, monospace", radii 4-12px and 9999px, `border-width-regular` 0.5px, four shadows) are in MA design-guidelines #style-variables.

### Limits and unsupported features

- "Claude implements a subset of the MCP specification, with its own callback URL and its own size and timeout limits" (BI #plan-your-server).
- Tool result: "~150,000 characters" on claude.ai and Desktop. Tool call: "240 seconds per tool call" (BI #design-within-the-size-and-timeout-limits).
- Above about 150,000 characters with the code sandbox on, the app gets a file pointer "so it never hydrates" (MA troubleshooting #app-doesnt-render-when-tool-results-are-large).
- "When an MCP App doesn't render or load correctly in Claude, the tool call usually still appears in the conversation" (MA troubleshooting, intro). So a visible tool call does not prove the view rendered.
- "Claude doesn't yet support these MCP features ...: Resource subscriptions, Sampling, Advanced or draft capabilities" (BI #decide-what-the-server-exposes). BI is written for remote servers. Whether a local stdio server gets the same subset is unknown.
- Claude's quickstart was "verified with `@modelcontextprotocol/ext-apps@1.7.5`" and `@modelcontextprotocol/sdk@1.30.1` (MA quickstart #install-the-mcp-apps-sdk).

## Claude Code

- **UI resources are hidden from listings, not from reading.** "They don't appear in the `@` suggestions or in the resource list tool's results, and a server that offers only UI resources shows an empty resource list. Reading a UI resource by its URI still works" ([mcp.md](https://code.claude.com/docs/en/mcp.md) #use-mcp-resources L1430). Added in 2.1.281 ([changelog](https://code.claude.com/docs/en/changelog.md)).
- **SDK hosts can render widgets.** `readMcpResource(serverName, uri)` is "*Alpha.* Reads one MCP Apps `ui://` resource from a connected MCP server so your application can render a tool's widget". It needs TS Agent SDK v0.3.280 or later and the capability `mcp_read_resource_v1`. It strips `_meta` keys under `com.anthropic/`. "The contents are untrusted third-party HTML, so render them in a sandbox" ([agent-sdk/typescript.md](https://code.claude.com/docs/en/agent-sdk/typescript.md) L642, L1052-1056).
- **SDK hosts see a tool's UI metadata.** `_meta` on a tools entry passes through `ui` (`resourceUri`, `visibility`) and the deprecated `ui/resourceUri`, and "withholds every other key" (typescript.md #mcpserverstatus L4836).
- **The desktop app is an SDK host** ("an Agent SDK application or the desktop app", mcp.md L87). The Code tab allowlists `*.claudemcpcontent.com` (desktop.md #network-access-requirements). [inference] The Code tab has what it needs to render MCP Apps. No code.claude.com page says it does.
- "Claude Desktop and claude.ai also render some tool results inside a conversation as interactive widgets, such as the MCP Apps some connectors provide" ([network-config.md](https://code.claude.com/docs/en/network-config.md) #desktop-and-claude-ai L260). No tab is named.
- **Tool search.** "Only tool names and server instructions load at session start". Each tool description and server's instructions is cut at 2,048 characters. `_meta["anthropic/alwaysLoad"]: true` loads a tool upfront (mcp.md L1434-1548).
- **Long calls.** An MCP call still running after two minutes moves to a background task in the main conversation, except for subagents, IDE servers, and non-interactive runs unless `CLAUDE_AUTO_BACKGROUND_TASKS` is set to `1` (mcp.md L430-444).
- **Output caps.** 25,000 tokens by default (`MAX_MCP_OUTPUT_TOKENS`). Text over 50,000 characters is saved to a file (mcp.md L1271-1316).
- **No conversation id.** The docs give an MCP server `CLAUDE_PROJECT_DIR` and `roots/list`, nothing per session [inference from absence].
