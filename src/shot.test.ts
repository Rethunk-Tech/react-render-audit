import { afterAll, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromiumBin } from './shot.ts'

const dir = mkdtempSync(join(tmpdir(), 'shot-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const shot = (...args: string[]) => {
  const r = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./cli-shot.ts', import.meta.url)), ...args],
    { encoding: 'utf8' },
  )
  return { exitCode: r.status, stdout: r.stdout, stderr: r.stderr }
}

const identify = (p: string) => {
  const r = spawnSync('magick', ['identify', '-format', '%w %h', p], { encoding: 'utf8' })
  expect(r.status).toBe(0)
  const [w, h] = r.stdout.trim().split(/\s+/).map(Number)
  return { w, h }
}

const hasChromium = (() => {
  try {
    chromiumBin()
    return spawnSync('magick', ['-version']).status === 0
  } catch {
    return false
  }
})()

test.skipIf(!hasChromium)('renders a tiny HTML file at two sizes', () => {
  const html = join(dir, 'tiny.html')
  writeFileSync(html, '<!doctype html><title>x</title><p>hi</p>')
  const r = shot(html, '--size', '200x150', '--size', '320x240', '--out', dir, '--wait', '500')
  expect(r.exitCode).toBe(0)
  const a = join(dir, 'tiny-200x150.png')
  const b = join(dir, 'tiny-320x240.png')
  expect(r.stdout).toContain(a)
  expect(r.stdout).toContain(b)
  expect(identify(a)).toEqual({ w: 200, h: 150 })
  expect(identify(b)).toEqual({ w: 320, h: 240 })
})

test('exits 1 when the path is missing', () => {
  const missing = join(dir, 'nope.html')
  const r = shot(missing, '--out', dir)
  expect(r.exitCode).toBe(1)
  expect(r.stderr).toContain(missing)
})

test('exits 2 on unknown flag, missing value, or no input', () => {
  expect(shot('--nope').exitCode).toBe(2)
  expect(shot('--out').exitCode).toBe(2)
  expect(shot().exitCode).toBe(2)
})
