import { resolve } from 'node:path'
import { appHome, coreEnvironment } from '../bridge/core'
import { runtimeRoot } from './paths'

export function agentEnvironment(parent = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  const names = [
    'PATH',
    'HOME',
    'USER',
    'LOGNAME',
    'SHELL',
    'LANG',
    'LC_ALL',
    'TMPDIR',
    'XPC_FLAGS',
    'XPC_SERVICE_NAME',
    '__CF_USER_TEXT_ENCODING',
    'XDG_CONFIG_HOME',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'ANTHROPIC_API_KEY',
    'HC_TERMINAL_ID',
    'HC_TERMINAL_SOCKET',
    'HC_SCOPE',
  ]
  for (const name of names) if (parent[name]) env[name] = parent[name]
  const core = coreEnvironment()
  return {
    ...env,
    INBOX_RUNTIME_ROOT: runtimeRoot,
    HC_SESSION: core.HC_SESSION,
    HC_SOCKET: core.HC_SOCKET,
    XDG_STATE_HOME: core.XDG_STATE_HOME,
    CLAUDE_CONFIG_DIR: resolve(runtimeRoot, 'claude-config'),
    HERDR_APP_HOME: appHome,
    TERM: 'xterm-256color',
    DISABLE_TELEMETRY: '1',
    DISABLE_ERROR_REPORTING: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  }
}
