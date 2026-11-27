import { expect, setSystemTime, test } from 'bun:test'
import { join } from 'node:path'

import { NOW } from './fixtures'
import { allOf, appModules, openPanel, standInWindow } from './gpui-stand-in'
import { HERDR_GLOBALS, globalsOf, herdrContext, loadBuiltMod } from './herdr-runtime'

setSystemTime(new Date(NOW))

const BUILT_MOD = join(import.meta.dir, '..', 'mods', 'inbox', 'main.js')

test('the load context holds exactly the globals of Herdr’s mod runtime', () => {
  expect(globalsOf(herdrContext(standInWindow))).toEqual(HERDR_GLOBALS.toSorted())
})

test('the built mod loads with only Herdr’s globals and draws the session it follows', async () => {
  const Inbox = await loadBuiltMod(BUILT_MOD, herdrContext(standInWindow), appModules)

  expect(Object.getPrototypeOf(Inbox)).toBe(appModules['gpui-kit'].View)
  const panel = await openPanel(Inbox as Parameters<typeof openPanel>[0])
  expect(allOf(panel.paint()).some(n => n.id === 'inbox-list')).toBe(true)
})
