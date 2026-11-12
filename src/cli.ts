#!/usr/bin/env node
import { existsSync } from 'node:fs'
import process from 'node:process'
import { diffShots } from './diff.ts'

const PERCENT = 100
const PAD = 6
const USAGE_EXIT = 2

// render-diff OLD_SHOTS_DIR NEW_SHOTS_DIR: lists each screen whose pixels differ, most changed first, then the screens
// only one side has. Exits 0; it reports, it does not judge.
const [oldDir, newDir] = process.argv.slice(2)
if (!(oldDir && newDir && existsSync(oldDir) && existsSync(newDir))) {
  console.error('usage: render-diff OLD_SHOTS_DIR NEW_SHOTS_DIR')
  process.exit(USAGE_EXIT)
}
const result = await diffShots(oldDir, newDir)
for (const r of result.changed) {
  console.log(`${(r.changed * PERCENT).toFixed(2).padStart(PAD)}%  ${r.name}`)
}
if (result.failed.length) {
  console.log(`failed: ${result.failed.join(', ')}`)
}
for (const name of result.gone) {
  console.log(` gone    ${name}`)
}
for (const name of result.added) {
  console.log(`  new    ${name}`)
}
console.log(
  `${result.changed.length} of ${result.compared} screens changed; pictures of the changes in ${result.out}`,
)
