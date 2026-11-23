import { afterAll, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'shotdiff-test-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const magickTest = test.skipIf(spawnSync('magick', ['-version']).status !== 0)

const magick = (...args: string[]) => {
  const r = spawnSync('magick', args)
  expect(r.status).toBe(0)
  return r
}

const shotdiff = (...args: string[]) => {
  const r = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./cli-shotdiff.ts', import.meta.url)), ...args],
    { encoding: 'utf8' },
  )
  return { exitCode: r.status, stdout: r.stdout }
}

magickTest('reports percent, region, crop, and exit 1 when pixels differ', () => {
  const render = join(dir, 'render.png')
  const mock = join(dir, 'mock.png')
  magick('-size', '100x80', 'xc:white', render)
  magick(render, '-fill', 'black', '-draw', 'rectangle 10,20 29,39', mock)
  const r = shotdiff(render, mock, '--out', dir)
  expect(r.exitCode).toBe(1)
  const lines = r.stdout.trimEnd().split('\n')
  expect(lines[0]).toBe('100x80 100x80')
  expect(lines[1]).toBe('5%')
  expect(lines[2]).toBe('9,19 22x22  83% of region differs')
  const crop = join(dir, 'shotdiff-worst.png')
  expect(lines[3]).toBe(crop)
  const [w = 0, h = 0] = magick('identify', '-format', '%w %h', crop)
    .stdout.toString()
    .trim()
    .split(/\s+/)
    .map(Number)
  expect(w).toBeGreaterThan(0)
  expect(h).toBeGreaterThan(0)
  expect(Math.max(w, h)).toBeLessThanOrEqual(900)
})

magickTest('a colour change against a grayscale render is not identical', () => {
  const render = join(dir, 'gray.png')
  const mock = join(dir, 'red.png')
  magick('-size', '100x80', 'xc:white', render)
  magick('-size', '100x80', 'xc:white', '-fill', 'red', '-draw', 'rectangle 10,20 29,39', mock)
  const r = shotdiff(render, mock, '--out', dir)
  expect(r.exitCode).toBe(1)
  expect(r.stdout.split('\n')[1]).toBe('5%')
})

magickTest('identical images print identical and exit 0', () => {
  const a = join(dir, 'same-a.png')
  const b = join(dir, 'same-b.png')
  magick('-size', '40x30', 'xc:white', a)
  magick(a, b)
  const r = shotdiff(a, b, '--out', dir)
  expect(r.exitCode).toBe(0)
  expect(r.stdout.trim()).toBe('identical')
})

test('exits 2 when a file is missing or not an image', () => {
  const missing = join(dir, 'nope.png')
  expect(shotdiff(missing, missing, '--out', dir).exitCode).toBe(2)
  const junk = join(dir, 'junk.txt')
  writeFileSync(junk, 'not an image')
  expect(shotdiff(junk, junk, '--out', dir).exitCode).toBe(2)
})

test('exits 2 on unknown flag, missing value, or wrong arity', () => {
  expect(shotdiff('--nope').exitCode).toBe(2)
  expect(shotdiff('--out').exitCode).toBe(2)
  expect(shotdiff('a.png').exitCode).toBe(2)
})
