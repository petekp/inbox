type ModelLike = { provider: string; identity: { family?: string; revision?: string } }

function byNewestRevision<T extends ModelLike>(a: T, b: T): number {
  const parts = (m: T) => (m.identity.revision ?? '0.0.0').split('.').map(Number)
  const [x, y] = [parts(a), parts(b)]
  const differing = x.findIndex((n, i) => n !== y[i])

  return differing === -1 ? 0 : (y[differing] ?? 0) - (x[differing] ?? 0)
}

export function inboxModel<T extends ModelLike>(
  models: T[],
  resolve: (name: string) => T | null | undefined,
): T | null {
  const sonnets = models.filter(m => m.identity.family === 'sonnet').toSorted(byNewestRevision)
  const sonnet = sonnets.find(m => m.provider === 'anthropic') ?? sonnets[0]

  return resolve('@inbox') ?? sonnet ?? resolve('@smol') ?? null
}
