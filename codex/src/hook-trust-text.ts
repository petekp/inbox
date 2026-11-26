import type { HooksTrust } from './hook-trust'

export const HOOKS_TRUST_TEXT: Record<HooksTrust, string> = {
  untrusted:
    'Codex is not running the inbox’s hooks, so the inbox is not reading Codex’s replies. Open Settings, then Hooks, then Inbox, then Trust all. A hook icon beside the approval setting may also offer Allow all.',
  modified:
    'Codex stopped the inbox’s hooks when the inbox updated, so the inbox is not reading Codex’s replies. To trust them again, open Settings, then Hooks, then Inbox, then Trust all. A hook icon beside the approval setting may also offer Allow all.',
}
