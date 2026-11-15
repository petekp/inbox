/** How much of a failed call's diagnostic lines is kept: their end, where codex prints the error. */
const DIAGNOSTIC_CHARS = 2000

const ANSI_STYLE = /\x1b\[[0-9;]*m/g
/** An optional `[time]` or ISO time before a line's text. */
const TIME = String.raw`^(?:\[[^\]]*\]\s*)?(?:\d{4}-\d\d-\d\dT\S*\s+)?`
/**
 * A line codex writes about the call itself: `ERROR:`, `error:`, `WARNING:` or `warning:`, a log line at ERROR or
 * WARN, an unknown feature flag, or a stream error. These are the forms of the diagnostics in the codex binary.
 */
const DIAGNOSTIC = new RegExp(
  `${TIME}(?:(?:ERROR|WARNING|error|warning):|(?:ERROR|WARN)\\s|Unknown feature flag: |[\\w ]*stream error:)`,
)

/**
 * The end of the diagnostic lines in a `codex exec` call's stderr. Its stderr can also hold the call's prompt and the
 * model's reasoning and reply, so every line that is not a diagnostic is left out.
 */
export function diagnosticLines(stderr: string): string {
  return stderr
    .split('\n')
    .map(line => line.replace(ANSI_STYLE, '').trimEnd())
    .filter(line => DIAGNOSTIC.test(line))
    .join('\n')
    .slice(-DIAGNOSTIC_CHARS)
}
