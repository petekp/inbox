/** A fingerprint of the server's sources, which build.mjs stamps into the server and into the tab page. */
declare const SERVER_BUILD: string
/** The plugin's version, which build.mjs reads from the Codex manifest. */
declare const VERSION: string
/** Whether the tab shows its Show demo button: in `npm run dev` builds, or a build run with INBOX_DEMO_BUTTON=1 or INBOX_DEMO_RECORDING=1. */
declare const DEMO_BUTTON: boolean
/** Whether the tab leaves out the demo's notices, for recording a video: in a build run with INBOX_DEMO_RECORDING=1. */
declare const DEMO_RECORDING: boolean
