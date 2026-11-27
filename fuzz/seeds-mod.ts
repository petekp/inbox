import type { ModCase } from './mod-case'
import { BEL, ESC } from './seeds'

/** Fixed cases for the mod's terminal and desktop looks, run before each mod pass. */
export const MOD_SEEDS: { name: string; issue: number; isOpen: boolean; rule: string; case: ModCase }[] = [
  {
    name: 'a finding whose title holds escapes, in the terminal',
    rule: 'drawn',
    issue: 830,
    isOpen: false,
    case: {
      look: 'terminal',
      columns: 80,
      records: [
        {
          kind: 'finding',
          finding_kind: 'issue',
          title: `Red ${ESC}[31mtext${ESC}[0m and ${ESC}]52;c;aGk=${BEL}clipboard`,
          detail: 'd',
        },
      ],
    },
  },
]
