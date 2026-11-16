import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LayoutBreak } from './page/layout.ts'
import { shapeBreaks } from './walk.ts'

test('a missed step reports the miss without layout breaks', () => {
  const overflow: LayoutBreak = { kind: 'overflow', where: 'main', text: 'wide' }
  assert.deepEqual(shapeBreaks('home', [{ where: 'button', text: 'Go' }], [overflow]), [
    { screen: 'home', kind: 'missing', where: 'button', text: 'Go' },
  ])
})
