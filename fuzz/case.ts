import type { Session } from '../types'
import type { HostOutcomes } from './host'

export type Look = 'omp' | 'herdr'

/** One thing that happens in a case, at the case's clock. Plain JSON, so a report replays it and the shrinker cuts it. */
export type Ev =
  | { is: 'wait'; ms: number }
  /** A key the look takes, as its own key handling names it. `text` is what the key types. */
  | { is: 'key'; key: string; text?: string }
  /**
   * Herdr only: a click on the n-th row, the n-th button of the open row, or the n-th tab, counted in drawn order. With
   * `label`, the first target whose id or label holds it, as a fixed case names its target.
   */
  | { is: 'click'; on: 'row' | 'button' | 'tab'; n: number; label?: string }
  /** Text typed into the open text field. */
  | { is: 'type'; text: string }
  /** The agent's `record` call. */
  | { is: 'record'; args: Record<string, unknown> }
  /** The agent's `close` call on the n-th open row, counting items then findings. */
  | { is: 'close'; n: number; answer?: string; reason?: string }
  /** The agent's `order_prs` call over the session's PRs, picked by index; an empty list clears the order. */
  | { is: 'order'; picks: number[]; label: string; why: string }
  /** A Status answer, line by line, as the Status call writes it. */
  | { is: 'status'; lines: string[] }
  | { is: 'turn'; to: 'start' | 'end' }
  /** A PR fetch that finds the n-th PR changed. */
  | { is: 'prs'; n: number; change: 'clean' | 'conflict' | 'merged' | 'closed' | 'threads-done' | 'checks-pass' }
  /** The session ends: the terminal goes back to its shell. */
  | { is: 'end' }

export type Case = {
  look: Look
  /** The session the case starts from, as a host saves it. */
  session: Session
  outcomes: HostOutcomes
  /** How long the host takes to apply a Herdr press file, or null when it never does. */
  takeAfterMs: number | null
  /** omp's panel width in columns. */
  width: number
  events: Ev[]
}
