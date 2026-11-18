import type { Client, ClientId } from './client-features'
import { CLAUDE_CODE } from './clients-claude-code'
import { CODEX } from './clients-codex'
import { OMP } from './clients-omp'

export const CLIENTS: Record<ClientId, Client> = {
  'claude-code': CLAUDE_CODE,
  codex: CODEX,
  omp: OMP,
}
