import { demoSession } from '../../core/view/demo'
import { upgradeSession } from '../../core/view/session-files'
import { remoteRowVersion, startRemoteCommand } from '../../core/remote/remote-commands'
import type { RemoteCommand } from '../../core/remote/remote-commands'
import { commandsOf, remoteReceipts } from '../../core/runtime/remote-command-state'
import { followCommandRows, movedLegacyCommands } from '../../core/runtime/command-store'
import { pruned } from '../../core/runtime/session-presses'
import { fakeHostWith } from '../../tests/session-script'
import { memoryCommandStore } from '../../tests/memory-command-store'

let fixtures = 0

export function remoteCommandFixture(isRunning?: (runner: { id: string }) => boolean) {
  const key = `fixture-${fixtures++}`
  let now = 1_000_000
  let state = demoSession(now, 'Claude')
  const question = state.ledger.items.find(row => row.kind === 'question')
  if (!question) throw new Error('The demo session has no question.')
  question.id = 'i1'
  let durable = structuredClone(state)
  let writing = Promise.resolve()
  let sequence = 0
  const store = memoryCommandStore(isRunning)
  let allowedUpdates = Infinity
  const commands = {
    ...store,
    update: (...args: Parameters<typeof store.update>) => {
      if (allowedUpdates-- <= 0) return Promise.reject(new Error('The log cannot be written.'))
      return store.update(...args)
    },
  }
  const built = fakeHostWith({
    read: async () => state,
    update: change => {
      const result = writing.then(async () => {
        state = await movedLegacyCommands(commands, pruned(await change(state), now), () => undefined)
        durable = structuredClone(state)
        await followCommandRows(commands, key, state, () => undefined)
        return state
      })
      writing = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },
    exclusive: async fn => ({ acquired: true, value: await fn() }),
  })(async () => null)
  built.host.now = () => now
  built.host.readDurable = async () => structuredClone(durable)
  built.host.commands = commands
  const command = (text = 'Fixture reply'): RemoteCommand => {
    now++
    return {
      format: 2,
      kind: 'command',
      id: `${now.toString(36)}-fixture-operation-${sequence++}`,
      session: 's1',
      issuedAt: now,
      expected: remoteRowVersion(state, 'i1'),
      press: { action: 'type', id: 'i1', text },
    }
  }
  const run = async (c: RemoteCommand) => {
    const started = await startRemoteCommand(built.host, c, 's1')
    return started.is === 'waiting' ? started.finish() : started.outcome
  }
  return {
    ...built,
    commands,
    command,
    run,
    receipt: async (id: string) => remoteReceipts(await commandsOf(commands, state))[id],
    state: () => state,
    durable: () => durable,
    allowUpdates: (count: number) => {
      allowedUpdates = count
    },
    setState: (next: typeof state) => {
      state = next
    },
    advance: (ms: number) => {
      now += ms
    },
    restart: () => {
      state = upgradeSession(durable)
    },
  }
}
