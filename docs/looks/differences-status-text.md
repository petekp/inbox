# Differences on purpose: the Status page's text levels

Part of [the look map](../looks.md#differences-on-purpose).

| Topic | Terminal | Desktop | Codex | Why | Where |
| --- | --- | --- | --- | --- | --- |
| Faint text (`status-faint-text`) | A done (✓) Status row's line under its name, where it stands, draws in `pal.faint`, a step below muted: `FAINT_TEXT`, muted faded toward the theme's background until it reads at `FAINT_TEXT_CONTRAST`, 3.5:1. The light-daltonized palette fades its own muted. The ANSI themes, and a theme the mod does not know, draw it in `inactive`, as muted. | One hex, `#83817c`, at 3.9:1 on white and 4.5:1 on the dark page, `#191919`. | `--faint`: in dark, the host's muted mixed 58% into the page, 3.5:1 on Codex's dark colors. In light it is `--muted`, which Codex draws at 3.2:1. A page with no host colors falls back to muted at 7:1 in light, which faint matches, and to faint at 3.4:1 in dark. | A theme key cannot be faded, and the desktop app resolves one hex the same in both its themes, so one color serves both pages. Codex's light muted text is already under 3.5:1, and fading it further would leave the line hard to read. | `core/view/tones.ts:faintOver`, `core/view/status-page-parts.ts:textLevelOf`, `hooks/pane/palettes.ts`, `codex/src/tab-css/base.css`, `herdr/src/paint-theme.ts:faintOf` |
