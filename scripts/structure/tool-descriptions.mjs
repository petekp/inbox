import { createRequire } from 'node:module'

const require = createRequire(new URL('../../codex/package.json', import.meta.url))
const esbuild = require('esbuild')

/**
 * The tool lists each host registers. The mod registers `agentTools(CLAUDE_CODE)` and its `tool.describe` hook gives
 * `close` the guidance (hooks/register.tsx). The Codex server lists `TOOLS`. omp registers `agentTools(OMP)`
 * (omp/src/host.ts), which imports omp's packages, so its list is built here from the same call.
 */
const ENTRY = `
import { agentTools } from './hooks/tools'
import { CLAUDE_CODE, guidedCloseDescription, MAX_TOOL_DESCRIPTION } from './hooks/model-text'
import { TOOLS } from './codex/src/server-tools'
import { OMP } from './omp/src/texts'

const claude = agentTools(CLAUDE_CODE).map(tool =>
  tool.name === 'close' ? { ...tool, description: guidedCloseDescription(CLAUDE_CODE, tool.description) } : tool,
)

export const limit = MAX_TOOL_DESCRIPTION
export const hosts = { 'Claude Code': claude, Codex: TOOLS, omp: agentTools(OMP) }
`

async function registered(root) {
  const { outputFiles } = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: root, loader: 'ts', sourcefile: 'tool-descriptions-entry.ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  })

  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`)
}

/**
 * Claude Code passes a registered tool's description to the model only up to its first 4,096 characters, or 16,384
 * once a deferred tool loads through tool search, unless CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH says otherwise. Claude
 * Code 2.1.329 sets those defaults and warns on `tool.register` that a longer description "reaches the model up to its
 * first 4096 characters". Every host's descriptions are held to that bound, so none loses guidance at its end.
 */
export async function checkToolDescriptions(root, errors) {
  const { hosts, limit } = await registered(root)
  for (const [host, tools] of Object.entries(hosts))
    for (const { name, description } of tools)
      if (description.length > limit)
        errors.push(
          `${host}'s ${name} tool description is ${description.length} characters, over the ${limit} Claude Code passes to the model (MAX_TOOL_DESCRIPTION in hooks/model-text.ts). Shorten it, and run ./scripts/eval.sh --suite agent.`,
        )
}
