import { afterAll, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

test('render-diff exits 2 when a path is a file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'render-diff-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'file')
  writeFileSync(file, '')
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./cli.ts', import.meta.url)), file, dir],
    {
      encoding: 'utf8',
    },
  )
  expect(result.status).toBe(2)
  expect(result.stderr).toContain('usage: render-diff OLD_SHOTS_DIR NEW_SHOTS_DIR')
})
