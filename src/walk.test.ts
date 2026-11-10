import { describe, expect, test } from 'bun:test'
import { shotBytes } from './walk.ts'

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
