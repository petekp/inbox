/** Why Codex does not run the inbox's hooks: it never trusted them, or it trusted them before an update changed the plugin. */
export type HooksTrust = 'untrusted' | 'modified'

export const HOOKS_TRUST_TEXT: Record<HooksTrust, string> = {
  untrusted:
    'Codex is not running the inbox’s hooks, so the inbox is not reading Codex’s replies. Open Settings, then Hooks, then Inbox, then Trust all. A hook icon beside the approval setting may also offer Allow all.',
  modified:
    'Codex stopped the inbox’s hooks when the inbox updated, so the inbox is not reading Codex’s replies. To trust them again, open Settings, then Hooks, then Inbox, then Trust all. A hook icon beside the approval setting may also offer Allow all.',
}

/** Whether a value read from a file names a trust state the hooks banner has text for. */
export const isHooksTrust = (x: unknown): x is HooksTrust => x === 'untrusted' || x === 'modified'
