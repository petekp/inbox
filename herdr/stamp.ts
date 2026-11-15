import { builtAtLine, modBuiltAt } from '../hooks/herdr-install'

/** The line the bundler's banner leaves for the build time, which `stampedBundle` fills in. */
export const BUILT_AT_LINE = '// Built at BUILT_AT'

function stamped(unstamped: string, builtAt: string) {
  const after = unstamped.slice(unstamped.indexOf(BUILT_AT_LINE) + BUILT_AT_LINE.length + 1)

  return unstamped.replace(BUILT_AT_LINE, builtAtLine(builtAt, after.length))
}

/**
 * The bundle with its build time filled in. A build whose code matches `current`, the bundle already written, keeps
 * that bundle's time, so a host does not count it as newer. Any other build takes `now`.
 */
export function stampedBundle(unstamped: string, current: string | null, now: string): string {
  const currentBuiltAt = current ? modBuiltAt(current) : null
  const isSameCode = currentBuiltAt !== null && current === stamped(unstamped, currentBuiltAt)

  return stamped(unstamped, isSameCode ? currentBuiltAt : now)
}
