import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { diffShots } from './diff.ts'

function chunk(type: string, data: Buffer): Buffer {
  const t = Buffer.from(type)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

function png(width: number, height: number, rgba: Buffer): Buffer {
  const stride = 1 + width * 4
  const raw = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function solid(width: number, height: number, r: number): Buffer {
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = r
    rgba[i + 3] = 255
  }
  return png(width, height, rgba)
}

test('diffShots reports only pixels past channel tolerance', async () => {
  const oldDir = mkdtempSync('diff-old-')
  const newDir = mkdtempSync('diff-new-')
  // comparePixels counts a channel as moved only when delta > 24.
  const files: [string, Buffer, Buffer][] = [
    ['identical.png', solid(1, 1, 0), solid(1, 1, 0)],
    ['within.png', solid(1, 1, 0), solid(1, 1, 24)],
    ['over.png', solid(1, 1, 0), solid(1, 1, 25)],
    // Unpainted canvas is black, so a non-black fill makes the size gap visible.
    ['size.png', solid(1, 1, 80), solid(2, 2, 80)],
  ]
  for (const [name, before, after] of files) {
    writeFileSync(join(oldDir, name), before)
    writeFileSync(join(newDir, name), after)
  }
  try {
    const result = await diffShots(oldDir, newDir)
    expect(result.changed.map((row) => row.name).sort((a, b) => a.localeCompare(b))).toEqual([
      'over',
      'size',
    ])
    expect(result.compared).toBe(4)
    expect(result.gone).toEqual([])
    expect(result.added).toEqual([])
    expect(result.failed).toEqual([])
  } finally {
    rmSync(oldDir, { recursive: true, force: true })
    rmSync(newDir, { recursive: true, force: true })
  }
})

test('diffShots records a corrupt screenshot and still reports a real change', async () => {
  const oldDir = mkdtempSync('diff-old-')
  const newDir = mkdtempSync('diff-new-')
  const truncated = solid(10, 10, 0).subarray(0, 20)
  writeFileSync(join(oldDir, 'home.png'), truncated)
  writeFileSync(join(newDir, 'home.png'), truncated)
  writeFileSync(join(oldDir, 'about.png'), solid(10, 10, 0))
  writeFileSync(join(newDir, 'about.png'), solid(10, 10, 255))
  try {
    const result = await diffShots(oldDir, newDir)
    expect(result.failed).toContain('home')
    expect(result.changed.some((row) => row.name === 'about')).toBe(true)
  } finally {
    rmSync(oldDir, { recursive: true, force: true })
    rmSync(newDir, { recursive: true, force: true })
  }
})
