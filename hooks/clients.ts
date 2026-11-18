import type { Client, ClientId } from './client-features'
import { CLAUDE_CODE } from './clients-claude-code'
import { CODEX } from './clients-codex'
import { OMP } from './clients-omp'

/** The parity record. Each client's table is in its own `hooks/clients-<host>.ts`; `Client` in `hooks/client-features.ts` gives the rules for an entry. */
export const CLIENTS: Record<ClientId, Client> = {
  'claude-code': CLAUDE_CODE,
  codex: CODEX,
  omp: OMP,
}
