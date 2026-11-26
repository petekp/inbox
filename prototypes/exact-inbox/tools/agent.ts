import { resolve } from 'node:path'
import { agentEnvironment } from './agent-env'
import { runtimeRoot } from './paths'

const instructions = [
  'This is an isolated demonstration of Inbox. Do not run commands, edit files, browse or contact anyone.',
  'Use the Inbox record tool to ask two questions for a fictional release note.',
  'First ask which sample project name to use, with Orchard and Fieldnotes as options. Recommend Orchard because it is short.',
  'Second ask whether the release note should be concise or detailed. Recommend concise because it is easy to scan.',
  'After an answer arrives, acknowledge the choice in one sentence. Keep the other question open until it is answered.',
  'When both are answered, write a short sample release note using those choices. Create no new asks.',
].join(' ')

const cli = Bun.which('claude')
if (!cli || typeof process.execve !== 'function')
  throw new Error('The prototype needs Claude Code and a Bun version with process.execve.')
const args = [
  cli,
  '--model',
  'sonnet',
  '--plugin-dir',
  resolve(runtimeRoot, 'plugin'),
  '--setting-sources',
  '',
  '--settings',
  resolve(runtimeRoot, 'claude-config/settings.json'),
  '--strict-mcp-config',
  '--mcp-config',
  '{"mcpServers":{}}',
  '--tools',
  '',
  '--',
  instructions,
]
const env = Object.fromEntries(
  Object.entries(agentEnvironment()).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
)
process.chdir(resolve(runtimeRoot, 'session'))
process.execve(cli, args, env)
