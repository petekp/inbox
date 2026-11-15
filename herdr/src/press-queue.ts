import type { Effect } from '../../hooks/press-reducer'
import { pressRowId } from '../../hooks/pr-press'
import type { PrPress } from '../../hooks/pr-press'
import type { RowPress } from '../../hooks/presses'
import type { SessionView } from '../../hooks/session-view'
import type { Holds } from '../../hooks/timing'
import type { LocalResult, RowNote } from '../../types'
import type { LastPress } from './files'
import {
  isSentConfirmed,
  lastActionKey,
  nextOutCheckAt,
  notAppliedLine,
  notAppliedText,
  notSentLine,
  outAction,
  rowSignature,
  settleOuts,
} from './out'
import type { Out, RowLine, SentText } from './out'
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
type Sent =
  { is: 'refused'; reason: string } | { is: 'sent'; finish: (runHere: RunHere, ran: () => void) => Promise<void> }

/** Where a press file goes when the look takes it back: a name no host lists, since hosts read only `.json` names. */
export const claimedPath = (path: string) => `${path}.withdrawn`

/**
 * The presses the look has out for one session, and the notes and lines the ended ones leave on their rows.
 * `sentTexts` are the replies and goals it sent whose host has not yet answered, which can be after their press ends.
 */
export class PressQueue {
  outs: Out[] = []
  notes: Record<string, RowNote> = {}
  lines: Record<string, RowLine> = {}
  sentTexts: SentText[] = []

  constructor(private readonly io: QueueIo) {}

  /**
   * Starts a press: draws it out at once and gives `finish`, which runs what the look runs itself, writes the press
   * file and wakes the host. Refused, with the reason on its row, when there is no session to send to or its row has
   * a press out.
   */
  send(
    target: PressTarget | null,
    press: RowPress | PrPress,
    effects: readonly Effect[],
    label: string,
    reply?: string,
  ): Sent {
    const rowId = pressRowId(press)
    const refuse = (reason: string): Sent => {
      this.lines[rowId] = notSentLine(reason)
      return { is: 'refused', reason }
    }
    if (target === null) return refuse('this terminal has no inbox to send to.')
    if (this.outs.some(o => o.rowId === rowId)) return refuse('the last press on this row has not finished.')
    const now = this.io.now()
    const pressId = newPressId(now, this.io.random())
    const pending = pendingOf(effects, now)
    const out: Out = {
      pressId,
      rowId,
      path: pressPath(target.appHome, target.sessionId, pressId),
      action: outAction(press),
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
    if ('id' in press && press.action === 'type')
      this.sentTexts = [
        ...this.sentTexts,
        { pressId, rowId, text: press.text, lastBefore: lastActionKey(target.view, rowId) },
      ]
    delete this.lines[rowId]
    delete this.notes[rowId]

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
      this.forget(out)
      this.lines[out.rowId] = notAppliedText(failed)
      return
    }
    out.isWritten = true
    out.waitingSince = this.io.now()
    await this.io.wake(target.terminal, out.pressId)
  }

  private forget(out: Out): void {
    this.sentTexts = this.sentTexts.filter(s => s.pressId !== out.pressId)
  }

  /** Whether a read can still end a press or answer a sent text. */
  isAwaiting(): boolean {
    return this.outs.length > 0 || this.sentTexts.length > 0
  }

  /** Takes the sent texts a read answers out of `sentTexts`, and gives the confirmed ones. A press no host took waits. */
  private answerSentTexts(view: SessionView, lastPress: LastPress | null): SentText[] {
    const isUntaken = (s: SentText) => this.outs.some(o => o.pressId === s.pressId && !o.isTaken)
    const answers = this.sentTexts.map(sent => ({
      sent,
      isConfirmed: isUntaken(sent) ? null : isSentConfirmed(sent, view, lastPress),
    }))
    this.sentTexts = answers.flatMap(a => (a.isConfirmed === null ? [a.sent] : []))

    return answers.flatMap(a => (a.isConfirmed ? [a.sent] : []))
  }

  /**
   * Ends the presses a read of the session answers, as `settleOuts` says, after checking which written files a host
   * took. A press past its give-up time that no host took is taken back first, so it cannot apply later. When a host
   * took it in the meantime, it waits again as taken. Returns the sent texts the read shows confirmed.
   */
  async settle(view: SessionView, lastPress: LastPress | null, agent: string): Promise<SentText[]> {
    for (const out of this.outs) if (out.isWritten) out.isTaken = await this.io.isGone(out.path)
    const confirmed = this.answerSentTexts(view, lastPress)
    const now = this.io.now()
    const settled = settleOuts(this.outs, view, lastPress, now)
    this.outs = settled.outs
    this.notes = { ...this.notes, ...settled.notes }
    this.lines = { ...this.lines, ...settled.lines }
    for (const out of settled.toClaim) {
      if (await this.io.claim(out.path)) {
        this.forget(out)
        this.lines[out.rowId] = notAppliedLine(out, agent)
        continue
      }
      out.isTaken = true
      out.waitingSince = this.io.now()
      this.outs = [...this.outs, out]
    }

    return confirmed
  }

  nextCheckAt(): number | null {
    return nextOutCheckAt(this.outs, this.io.now())
  }
}
