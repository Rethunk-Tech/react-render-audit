import { describe, expect, test } from 'bun:test'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { call, hasStep, nameMatches, shotBytes, shotFile } from './walk.ts'

test('nameMatches is literal', () => {
  expect(nameMatches('Items (3)', 'Items (3)')).toBe(true)
  expect(nameMatches('Items 3', 'Items (3)')).toBe(false)
  expect(nameMatches('Items (3)', '(')).toBe(false)
  expect(() => nameMatches('x', '')).toThrow()
  expect(() => nameMatches('x', '  ')).toThrow()
})

test('hasStep matches role, name, and within', () => {
  const settings = { role: 'tab' as const, name: 'Settings' }
  const from = [{ role: 'tab' as const, name: 'Settings' }]
  expect(hasStep(from, settings)).toBe(true)
  expect(hasStep(from, { role: 'button', name: 'Open' })).toBe(false)
  const steps = [settings, { role: 'button' as const, name: 'Open' }]
  expect(steps.filter((x) => !hasStep(from, x))).toEqual([{ role: 'button', name: 'Open' }])
})

test('call rejects when the driver never answers', async () => {
  const server = createServer(() => undefined)
  await new Promise<void>((done) => {
    server.listen(0, '127.0.0.1', done)
  })
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  try {
    await expect(
      call(`http://127.0.0.1:${port}`, 'GET', '/hang', { timeoutMs: 50 }),
    ).rejects.toThrow(/timed out after 50ms/)
  } finally {
    server.close()
  }
})

test('shotBytes rejects over-cap encoding', () => {
  const cap = Math.ceil((33_554_432 * 4) / 3) + 4
  expect(() => shotBytes('a'.repeat(cap + 1))).toThrow(/over/)
})

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('pixels'),
])

describe('shotBytes', () => {
  test('decodes the driver answer into the PNG it is', () => {
    expect(shotBytes(png.toString('base64'))).toEqual(png)
  })

  test('refuses an answer that is not a PNG, so nothing else lands under a shot name', () => {
    expect(() => shotBytes(Buffer.from('<svg/>').toString('base64'))).toThrow('not a PNG')
    expect(() => shotBytes('')).toThrow('not a PNG')
  })

  test('refuses an answer over the size cap', () => {
    const huge = Buffer.alloc(32 * 1024 * 1024 + 1, 0x89).toString('base64')
    expect(() => shotBytes(huge)).toThrow('over')
  })
})

describe('shotFile', () => {
  test('puts the PNG under the shots directory', () => {
    expect(shotFile('/tmp/shots', 'home')).toBe(resolve('/tmp/shots', 'home.png'))
  })

  test('refuses a name that would leave the shots directory', () => {
    expect(() => shotFile('/tmp/shots', '../outside')).toThrow('file name')
    expect(() => shotFile('/tmp/shots', 'a/b')).toThrow('file name')
    expect(() => shotFile('/tmp/shots', '..')).toThrow('file name')
    expect(() => shotFile('/tmp/shots', '')).toThrow('file name')
  })
})
