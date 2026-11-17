# Session navigation

Status: built. chosen, 2026-11-16. Use a persistent session rail on wide web layouts. On iOS and narrow web, give Sessions its own full view on the tab bar.

The concepts use sample sessions and approximate Codex styling. They establish navigation, not completed renderer parity or native UIKit behavior.

## Wide web

Keep the session rail beside the selected Inbox. Show session titles, project/agent labels and shared attention counts. Selecting a session restores its own Inbox tab, expanded rows, scroll position and draft. The rail keeps other work visible during frequent switching.

## iOS and narrow web

Add Sessions beside Status, Asks, Finds and PRs. Its full view lists the available session inboxes and supports finding one by title or project. Selecting a session opens its saved Inbox tab; a first visit uses the shared default-tab rule. Returning to Sessions preserves the list position and search.

The selected session remains explicit while viewing its Inbox. Changing tabs must not change that session. At widths that cannot fit the rail and content, switch to the Sessions-tab treatment while preserving the current session and draft. The mobile view is not a drawer.

## Required states and checks

Selection belongs to the viewing device and stays independent of Herdr focus. A disconnected or ended session keeps its identity and unsent text; another session never replaces it automatically.

Cover search with no matches, duplicate titles, multiple hosts, unsupported publishers, host disconnection and a selected session ending. Keep ordering stable while counts update. Keyboard and screen-reader navigation must identify the selected session and active tab. Browser Back and native back behavior must preserve drafts.

Before implementation, verify the five-tab layout at narrow widths, with larger text and safe-area insets. Check selecting a session, returning to Sessions, and restoring each session's place. The responsive breakpoint follows measured content fit, not a fixed device list.

The updated preview shows the chosen rail and Sessions-tab view. Session selection is illustrative; the prototype's live connection remains pinned until milestone 2 is implemented. The full-directory option without a persistent web rail was considered and not selected.
