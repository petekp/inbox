# Checked against Codex 0.171.0

Part of [Codex plugins and the Codex app](../codex-plugins.md).

Facts taken from a read-only diagnosis on 2026-11-25 of the app's code and its
bundled CLI. Nothing was clicked in the app, no model was called, and this page's
author did not repeat the diagnosis. The ChatGPT.app build that was read was not
recorded, so the bundle claims cannot be rechecked against a build.

**What was checked**

- The Codex desktop app now ships inside `/Applications/ChatGPT.app`. Its bundled
  CLI reports codex-cli 0.171.0-alpha [diagnosis run].
- The composer's "Review hooks · N need approval" control, with a yellow dot and
  an Allow all button, is still in the app's code [read in the app's code, build not recorded].
- The control renders only behind a remote feature gate. It
  also does not render in the single-line composer, nor while `runLocation` is
  `"cloud"` [read in the app's code, build not recorded].
- The app caches its `hooks/list` answer for 5 minutes [read in the app's code, build not recorded].
- Settings, then Hooks, then From Plugins, then the Inbox row's Trust all is in the app's code with
  no gate. So is the plugin page's "N hooks need review" line [read in the app's code, build not recorded].
- The inbox's trust check (`codex/src/hook-trust.ts`, `codex/src/server-trust.ts`)
  asks the same binary the app uses. After an update it reported the hooks
  `modified`, which the diagnosis took as correct; how Codex's own record was read was not kept [diagnosis run].

**Inferred**

- A person whose account does not have the gate on sees no composer control. This
  fits a report of the banner showing with no icon.
- The gate's value could not be read, because it is decided by the host. Which
  accounts have it on is unknown.

**What the inbox does about it**

The Hooks-need-trust banner now leads with Settings, then Hooks, then Inbox, then
Trust all, and mentions the composer's hook icon as a shortcut that may appear. See
"Hooks need trust" in [differences-hosts-hooks](../../looks/differences-hosts-hooks.md).

**Not checked**

- The composer control's behavior with the gate on.
- Whether the plugin page's "N hooks need review" shows after an update.
