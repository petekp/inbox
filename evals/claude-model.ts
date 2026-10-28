import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const CLAUDE_MODEL = 'sonnet'

export type Answer = {
  text: string | null
  model: string | null
  outputTokens: number | null
  /** Input tokens the call read, cached ones included, and how many of them came from the cache. Codex reports none. */
  inputTokens?: number | null
  cachedTokens?: number | null
}

/**
 * Sonnet, or `model`, as the mod calls it: at low effort, and with no settings or MCP servers, so neither the runner's
 * own CLAUDE.md nor its account's connectors reach it.
 */
export function claude(prompt: string, system: string, model = CLAUDE_MODEL): Promise<Answer> {
  const cwd = mkdtempSync(join(tmpdir(), 'inbox-eval-claude-'))

  return new Promise<Answer>(resolve => {
    const child = execFile(
      'claude',
      [
        '-p',
        '--no-session-persistence',
        '--model',
        model,
        '--effort',
        'low',
        '--strict-mcp-config',
        '--setting-sources',
        '',
        '--tools',
        '',
        '--output-format',
        'json',
        '--system-prompt',
        system,
      ],
      { maxBuffer: 1 << 22, timeout: 300_000, cwd },
      (err, out) => {
        if (err) return resolve({ text: null, model: null, outputTokens: null })
        try {
          const parsed: unknown = JSON.parse(out)
          const events = (Array.isArray(parsed) ? parsed : [parsed]) as Record<string, any>[]
          const result = events.find(e => e.type === 'result')
          const model = events.find(e => e.type === 'system' && e.subtype === 'init')?.model ?? null
          const usage = result?.usage
          const outputTokens = usage?.output_tokens ?? null
          const cachedTokens = usage ? (usage.cache_read_input_tokens ?? 0) : null
          const inputTokens = usage
            ? (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (cachedTokens ?? 0)
            : null
          resolve({
            text: result && !result.is_error ? String(result.result) : null,
            model,
            outputTokens,
            inputTokens,
            cachedTokens,
          })
        } catch {
          resolve({ text: null, model: null, outputTokens: null })
        }
      },
    )
    child.stdin?.end(prompt)
  }).finally(() => rmSync(cwd, { recursive: true, force: true }))
}
