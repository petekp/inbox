/** What the inbox reads of a model omp lists. */
type ListedModel = { provider: string; identity: { family?: string | null; revision?: string | null } }

/** What the inbox reads of omp's `ctx.models`. */
type Models<M extends ListedModel> = { list(): readonly M[]; resolve(role: string): M | undefined | null }

/** Orders models newest first by the `major.minor.patch` revision omp classifies from each id. */
function byNewestRevision(a: ListedModel, b: ListedModel): number {
  const parts = (m: ListedModel) => (m.identity.revision ?? '0.0.0').split('.').map(Number)
  const [x, y] = [parts(a), parts(b)]
  const differing = x.findIndex((n, i) => n !== y[i])

  return differing === -1 ? 0 : (y[differing] ?? 0) - (x[differing] ?? 0)
}

/**
 * The inbox model: the person's `@inbox` role when it names a model omp can use. omp's `resolve` returns nothing for
 * an unset role, an unknown model or one with no sign-in, and the inbox then falls through. A model that resolves
 * but fails when called fails that update like any other.
 * Next the newest Sonnet model the person's providers offer, since the inbox model evals pass on Sonnet.
 * omp's model lists also hold retired Sonnets, which no longer answer. The `anthropic` provider is preferred.
 * Otherwise omp's `@smol` role.
 */
export function inboxModel<M extends ListedModel>(models: Models<M>): M | null {
  const sonnets = models
    .list()
    .filter(m => m.identity.family === 'sonnet')
    .toSorted(byNewestRevision)
  const sonnet = sonnets.find(m => m.provider === 'anthropic') ?? sonnets[0]

  return models.resolve('@inbox') ?? sonnet ?? models.resolve('@smol') ?? null
}
