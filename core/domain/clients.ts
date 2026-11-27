import type { Client, ClientId, LookTable, PublishedLookId } from './client-features'
import { CLAUDE_CODE } from './clients-claude-code'
import { CODEX } from './clients-codex'
import { EXACT_IOS } from './clients-exact-ios'
import { EXACT_WEB } from './clients-exact-web'
import { HERDR } from './clients-herdr'
import { OMP } from './clients-omp'

/** The parity record. Each client's table is in its own `core/domain/clients-<host>.ts`; `Client` in `core/domain/client-features.ts` gives the rules for an entry. */
export const CLIENTS: Record<ClientId, Client> = {
  'claude-code': CLAUDE_CODE,
  codex: CODEX,
  omp: OMP,
}

/** The parity record of the looks that draw a published session, one table each; `LookTable` gives the rules for an entry. */
export const PUBLISHED_LOOKS: Record<PublishedLookId, LookTable> = {
  herdr: HERDR,
  'exact-web': EXACT_WEB,
  'exact-ios': EXACT_IOS,
}
