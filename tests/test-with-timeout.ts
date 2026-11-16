import { test as kitTest, type TestBody, type TestOptions, type TestRest } from 'claude-code/testing'

// The kit stops a test after 5000 ms unless the test says otherwise, and has no
// setting for all tests. A test that draws the pane takes 1 to 5 s alone and
// up to 34 s when four suites run at once. The bound is about three times that,
// so only a hang reaches it.
export const TEST_TIMEOUT_MS = 100_000

export const test = (name: string, ...rest: TestRest) => {
  const body: TestBody = rest.length === 1 ? rest[0] : rest[1]
  const options: TestOptions = rest.length === 1 ? {} : rest[0]
  kitTest(name, { timeoutMs: TEST_TIMEOUT_MS, ...options }, body)
}
