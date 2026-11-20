import type { Effect } from '../../hooks/press-reducer'
import { pressRowId } from '../../hooks/pr-press'
import type { PrPress } from '../../hooks/pr-press'
import type { RowPress } from '../../hooks/presses'
import type { SessionView } from '../../hooks/session-view'
import type { Holds } from '../../hooks/timing'
import type { LocalResult, PressKind } from '../../types'
import type { LastPress } from './files'
import { nextOutCheckAt, notAppliedLine, notAppliedText, notSentLine, outAction, rowSignature, settleOuts } from './out'
import type { Ended, Out, RowLine } from './out'
import { newPressId, pressFileText, pressPath } from './press-file'
import { firstError, isRunHere, pendingOf } from './run-here'
import type { HereEffect } from './run-here'

/**
 * What the queue does outside itself: the clock, a random number for press ids, writing a new file (null when it
 * worked, else why not), whether a file is gone, taking a press file back (false when a host already has it), and
 * waking the host on the session's terminal.
 */
export type QueueIo = {
  now(): number
  random(): number
  write(path: string, text: string): Promise<string | null>
  isGone(path: string): Promise<boolean>
  claim(path: string): Promise<boolean>
  wake(terminal: string, pressId: string): Promise<void>
}

/** Where a press goes: the session the look shows, the terminal its file names, and what the press file carries. */
export type PressTarget = {
  appHome: string
  sessionId: string
  terminal: string
  view: SessionView
  holds: Holds
  projectFolder: string | null
}

/** Runs the opens and copies of a press the look does itself, from the result its row reads meanwhile. */
type RunHere = (effects: readonly HereEffect[], pending: LocalResult) => Promise<LocalResult>

/** `finish` takes what runs the look's own opens, and what draws the row again once they ran. */
type Sent = { is: 'refused' } | { is: 'sent'; finish: (runHere: RunHere, ran: () => void) => Promise<void> }

/**
 * What a press carries besides its press: what it opens or copies, its button's label and kind, the text a reply
 * sends, and the id the shared controller gave it.
 */
type SendOptions = {
  effects: readonly Effect[]
  label: string
  kind: PressKind | null
  reply?: string
  uiPressId: number
}

/** Where a press file goes when the look takes it back: a name no host lists, since hosts read only `.json` names. */
export const claimedPath = (path: string) => `${path}.withdrawn`

/**
 * The presses the look has out for one session, and the lines the ended ones leave on their rows. `ended` holds how
 * each press ended, refused ones too, until the look gives them to the shared controller.
 */
export class PressQueue {
  outs: Out[] = []
  lines: Record<string, RowLine> = {}
  private ended: Ended[] = []

  constructor(private readonly io: QueueIo) {}

  /**
   * Starts a press: draws it out at once and gives `finish`, which runs what the look runs itself, writes the press
   * file and wakes the host. Refused, with the reason on its row, when there is no session to send to or its row has
   * a press out.
   */
  send(target: PressTarget | null, press: RowPress | PrPress, o: SendOptions): Sent {
    const { effects, label, kind, reply, uiPressId } = o
    const rowId = pressRowId(press)
    const refuse = (reason: string): Sent => {
      this.lines[rowId] = notSentLine(reason)
      this.ended.push({ uiPressId, outcome: { error: reason, note: null, isUnconfirmed: false } })
      return { is: 'refused' }
    }
    if (target === null) return refuse('this terminal has no inbox to send to.')
    if (this.outs.some(o => o.rowId === rowId)) return refuse('the last press on this row has not finished.')
    const now = this.io.now()
    const pressId = newPressId(now, this.io.random())
    const pending = pendingOf(effects, now)
    const out: Out = {
      pressId,
      uiPressId,
      rowId,
      path: pressPath(target.appHome, target.sessionId, pressId),
      action: outAction(press),
      kind,
      label,
      ...(reply !== undefined ? { reply } : {}),
      pending,
      result: null,
      before: rowSignature(target.view, rowId),
      isWritten: false,
      waitingSince: null,
      isTaken: false,
    }
    this.outs = [...this.outs, out]
    delete this.lines[rowId]

    return { is: 'sent', finish: (runHere, ran) => this.finish(out, now, target, press, effects, runHere, ran) }
  }

  private async finish(
    out: Out,
    pressedAt: number,
    target: PressTarget,
    press: RowPress | PrPress,
    effects: readonly Effect[],
    runHere: RunHere,
    ran: () => void,
  ): Promise<void> {
    const pending = out.pending?.is === 'local' ? out.pending.result : null
    if (pending && isRunHere(effects, target.projectFolder)) {
      out.result = await runHere(effects, pending)
      ran()
    }
    const local = out.result ? { error: firstError(out.result) } : null
    const text = pressFileText(out.pressId, pressedAt, press, target.holds, local)
    const failed = await this.io.write(out.path, text)
    if (failed !== null) {
      this.outs = this.outs.filter(o => o !== out)
      this.endRefused(out, notAppliedText(failed))
      return
    }
    out.isWritten = true
    out.waitingSince = this.io.now()
    await this.io.wake(target.terminal, out.pressId)
  }

  /** Ends `out` as refused, with `line` on its row. */
  private endRefused(out: Out, line: RowLine): void {
    this.lines[out.rowId] = line
    const error = line.source.is === 'notSent' ? line.source.reason : line.text
    this.ended.push({ uiPressId: out.uiPressId, outcome: { error, note: null, isUnconfirmed: false } })
  }

  /** Whether a read can still end a press. */
  isAwaiting(): boolean {
    return this.outs.length > 0
  }

  /** Whether a press is still out, or one ended that the controller has not heard of: a left session keeps its queue. */
  holdsPresses(): boolean {
    return this.outs.length > 0 || this.ended.length > 0
  }

  /** How the presses ended since the last call, oldest first. */
  takeEnded(): Ended[] {
    return this.ended.splice(0)
  }

  /**
   * Ends the presses a read of the session answers, as `settleOuts` says, after checking which written files a host
   * took. A press past its give-up time that no host took is taken back first, so it cannot apply later. When a host
   * took it in the meantime, it waits again as taken. `takeEnded` then gives how each ended press went.
   */
  async settle(view: SessionView, lastPress: LastPress | null, agent: string): Promise<void> {
    for (const out of this.outs) if (out.isWritten) out.isTaken = await this.io.isGone(out.path)
    const now = this.io.now()
    const settled = settleOuts(this.outs, view, lastPress, now)
    this.outs = settled.outs
    this.lines = { ...this.lines, ...settled.lines }
    this.ended.push(...settled.ended)
    for (const out of settled.toClaim) {
      if (await this.io.claim(out.path)) {
        this.endRefused(out, notAppliedLine(out, agent))
        continue
      }
      out.isTaken = true
      out.waitingSince = this.io.now()
      this.outs = [...this.outs, out]
    }
  }

  nextCheckAt(): number | null {
    return nextOutCheckAt(this.outs, this.io.now())
  }
}
