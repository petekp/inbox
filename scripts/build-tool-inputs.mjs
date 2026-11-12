// Writes types/parts/tool-inputs.d.ts from the schemas of the agent's tools in hooks/tools.ts, so that
// `e.tool === 'mcp__inbox__record'` narrows to the arguments the tool takes. Claude Code also writes these inputs, in
// .claude-plugin/types/claude-code-mcp/, but from whatever MCP tools the session that last loaded the mod had
// connected, so tsconfig.json leaves that folder out.
//
// Usage: node scripts/build-tool-inputs.mjs [--check]
//
// With --check, writes nothing and exits 1 when the part differs from what the schemas build. Needs the esbuild that
// codex/ pins, to load hooks/tools.ts.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PART = join(ROOT, 'types', 'parts', 'tool-inputs.d.ts')
const { build } = await import(pathToFileURL(join(ROOT, 'codex', 'node_modules', 'esbuild', 'lib', 'main.js')).href)

const bundle = await build({
  stdin: {
    contents: "export { agentTools } from './hooks/tools'\nexport { CLAUDE_CODE } from './hooks/model-text'\n",
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'warning',
})
const { agentTools, CLAUDE_CODE } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
)

function typeOf(schema, at) {
  if (schema.enum) return schema.enum.map(value => `'${value}'`).join(' | ')
  if (schema.type === 'string') return 'string'
  if (schema.type === 'integer' || schema.type === 'number') return 'number'
  if (schema.type === 'boolean') return 'boolean'
  if (schema.type === 'array') return `${typeOf(schema.items, `${at}[]`)}[]`
  throw new Error(`${at}: the build turns no schema of type ${JSON.stringify(schema.type)} into a type.`)
}

function inputType(schema, at) {
  const required = new Set(schema.required ?? [])
  const fields = Object.entries(schema.properties).map(
    ([name, field]) => `      ${name}${required.has(name) ? '' : '?'}: ${typeOf(field, `${at}.${name}`)}`,
  )
  return `{\n${fields.join('\n')}\n    }`
}

const serverPrefix = CLAUDE_CODE.recordTool.replace(/record$/, '')
const entries = agentTools(CLAUDE_CODE).map(
  tool => `    ${serverPrefix}${tool.name}: ${inputType(tool.inputSchema, tool.name)}`,
)
const part = `// Built by scripts/build-tool-inputs.mjs from the schemas in hooks/tools.ts. Edit a schema, then run it and
// scripts/build-types.mjs.

export {}

declare module 'claude-code' {
  /** The arguments of the agent's tools, as their schemas in \`hooks/tools.ts\` give them. */
  interface McpToolInputs {
${entries.join('\n')}
  }
}
`

if (process.argv.includes('--check')) {
  if (readFileSync(PART, 'utf8') !== part) {
    console.error(
      'types/parts/tool-inputs.d.ts differs from the schemas in hooks/tools.ts. Run: node scripts/build-tool-inputs.mjs && node scripts/build-types.mjs',
    )
    process.exit(1)
  }
} else {
  writeFileSync(PART, part)
}
