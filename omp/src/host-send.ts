import { sessionIdOf } from './host-context'
import type { OmpContext } from './host-context'

export const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** The slice of omp's extension context a send reads. */
type SendContext = OmpContext & {
  isIdle(): boolean
  ui: { getEditorText(): string; setEditorText(text: string): void }
}

/**
 * omp hands a message it refuses before a run starts back to the person's editor when the editor is empty, and gives
 * an extension no way to turn that off. The message was written for the agent, so a refused send clears the editor
 * when it holds exactly that text.
 */
function takeBackFromEditor(ctx: SendContext, text: string) {
  if (ctx.hasUI && ctx.ui.getEditorText() === text) ctx.ui.setEditorText('')
}

/** Sends messages to the agent through omp's `sendUserMessage`, and learns when each session's run starts. */
export function agentSender(pi: { sendUserMessage(text: string, options?: { deliverAs: 'followUp' }): unknown }) {
  /** The sends of each session that wait for its next run to start. */
  const runStartWaiters = new Map<string, Set<() => void>>()

  /**
   * Sends text to the agent as if the person typed it. Returns why it could not, or null. From omp 18.18.2,
   * `sendUserMessage` rejects when omp drops the message before a run starts, as for the cost cap. Sent while the
   * agent is idle, it settles only when the whole run ends, so this also returns null once the session's next run
   * starts. omp 18.18.1 and older return nothing, and a send that does not throw has gone.
   */
  const sendToAgent = async (ctx: SendContext, text: string): Promise<string | null> => {
    const id = sessionIdOf(ctx)
    const waiters = runStartWaiters.get(id) ?? new Set<() => void>()
    runStartWaiters.set(id, waiters)
    let started = () => {}
    const runStarted = new Promise<null>(resolve => {
      started = () => resolve(null)
    })
    waiters.add(started)
    try {
      const options = ctx.isIdle() ? undefined : { deliverAs: 'followUp' as const }
      const sent = Promise.resolve(pi.sendUserMessage(text, options)).then(
        () => null,
        (err: unknown) => {
          takeBackFromEditor(ctx, text)

          return messageOf(err)
        },
      )

      return await Promise.race([sent, runStarted])
    } catch (err) {
      return messageOf(err)
    } finally {
      waiters.delete(started)
    }
  }

  const onRunStart = (ctx: OmpContext) => {
    for (const started of runStartWaiters.get(sessionIdOf(ctx)) ?? []) started()
  }

  return { sendToAgent, onRunStart }
}
