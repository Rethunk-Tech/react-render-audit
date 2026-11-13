import { expect, test } from 'bun:test'
import fc from 'fast-check'
import { DEFAULT_GLOBAL, hookScript } from './hook.ts'

test('hookScript does not throw on arbitrary options', () => {
  fc.assert(
    fc.property(
      fc.record(
        {
          global: fc.string(),
          ignoreCommitsOf: fc.array(fc.string()),
          quietIntervalsFromMs: fc.double(),
        },
        { requiredKeys: [] },
      ),
      (opts) => {
        expect(() => hookScript(opts)).not.toThrow()
      },
    ),
  )
})

test('hookScript embeds JSON-encoded options', () => {
  fc.assert(
    fc.property(
      fc.string(),
      fc.array(fc.string()),
      fc.integer(),
      (global, ignoreCommitsOf, quietIntervalsFromMs) => {
        const script = hookScript({ global, ignoreCommitsOf, quietIntervalsFromMs })
        expect(script.includes(`const IGNORE = ${JSON.stringify(ignoreCommitsOf)}`)).toBe(true)
        expect(
          script.includes(`const QUIET_FROM_MS = ${JSON.stringify(quietIntervalsFromMs)}`),
        ).toBe(true)
        expect(script.includes(`window[${JSON.stringify(global)}]`)).toBe(true)
      },
    ),
  )
})

test('hookScript is idempotent for the same options', () => {
  fc.assert(
    fc.property(
      fc.record(
        {
          global: fc.string(),
          ignoreCommitsOf: fc.array(fc.string()),
          quietIntervalsFromMs: fc.integer(),
        },
        { requiredKeys: [] },
      ),
      (opts) => {
        expect(hookScript(opts)).toBe(hookScript(opts))
      },
    ),
  )
})

test('hookScript default global is JSON-encoded DEFAULT_GLOBAL', () => {
  expect(hookScript().includes(`window[${JSON.stringify(DEFAULT_GLOBAL)}]`)).toBe(true)
})

test('hookScript starts watching mutations when the document has already loaded', () => {
  const observed: unknown[] = []
  const mutationObserver = function (this: { observe: (t: unknown) => void }) {
    this.observe = (target) => observed.push(target)
  }
  const performanceObserver = function (this: { observe: () => void }) {
    this.observe = () => undefined
  }
  const root = {}
  const doc = { readyState: 'complete', documentElement: root, addEventListener: () => undefined }
  const win = { setInterval: () => 0 }
  new Function(
    'window',
    'document',
    'performance',
    'PerformanceObserver',
    'MutationObserver',
    hookScript(),
  )(win, doc, { now: () => 0 }, performanceObserver, mutationObserver)
  expect(observed).toEqual([root])
})
