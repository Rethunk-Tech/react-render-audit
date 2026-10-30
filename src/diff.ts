import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import { comparePixels } from './page/pixels.ts'

// A channel that moves less than this is antialiasing or a colour rounding, not a change.
const CHANNEL_TOLERANCE = 24

export interface ShotDiff {
  /** Screens whose pixels differ, most changed first; `changed` is the changed share of pixels, 0 to 1. */
  changed: { name: string; changed: number }[]
  /** Screens only the old folder has. */
  gone: string[]
  /** Screens only the new folder has. */
  added: string[]
  /** How many screens both folders have. */
  compared: number
  /** Where the pictures of the changes are: the changed pixels in red over a faded copy of the new screen. */
  out: string
}

const pngs = (dir: string) => new Set(readdirSync(dir).filter((f) => f.endsWith('.png')))
const PNG_SUFFIX = /\.png$/
const stem = (file: string) => file.replace(PNG_SUFFIX, '')

/** Compares two screenshot folders screen by screen and writes `<newDir>/diff/<screen>.png` for each that changed. It
 * reports and does not judge: data that changed between runs also moves pixels. */
export async function diffShots(oldDir: string, newDir: string): Promise<ShotDiff> {
  const before = pngs(oldDir)
  const after = pngs(newDir)
  const both = [...after].filter((f) => before.has(f))
  const out = join(newDir, 'diff')
  mkdirSync(out, { recursive: true })

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const rows: ShotDiff['changed'] = []
    for (const file of both) {
      const dataUrl = (dir: string) =>
        `data:image/png;base64,${readFileSync(join(dir, file)).toString('base64')}`
      const result = await page.evaluate(comparePixels, {
        a: dataUrl(oldDir),
        b: dataUrl(newDir),
        tolerance: CHANNEL_TOLERANCE,
      })
      if (result.changed > 0) {
        writeFileSync(join(out, file), Buffer.from(result.png, 'base64'))
        rows.push({ name: stem(file), changed: result.changed })
      }
    }
    rows.sort((a, b) => b.changed - a.changed)
    return {
      changed: rows,
      gone: [...before].filter((name) => !after.has(name)).map(stem),
      added: [...after].filter((name) => !before.has(name)).map(stem),
      compared: both.length,
      out,
    }
  } finally {
    await browser.close()
  }
}
