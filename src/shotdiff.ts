import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { isFile, ShotError, type Size } from './shot.ts'

export interface ShotCompareOptions {
  render: string
  mock: string
  /** Where `shotdiff-worst.png` goes; default is the render's folder. */
  outDir?: string
  /** Colour tolerance in percent, default 4. */
  fuzz?: number
  /** How many of the largest regions to list, default 5. */
  regions?: number
  /** ImageMagick binary, default `magick` on PATH. */
  magick?: string
}

export interface ShotCompare {
  identical: boolean
  /** The lines to print: sizes, percent differing, regions, then the crop's path. */
  lines: string[]
}

const MIN_AREA = 16
const MARGIN = 24
const GAP = 4
const MAX_EDGE = 900
const BAD_INPUT = 2
const NUMBER = /\d+/g
const COMPONENT = /^\s*\d+:\s+(\d+)x(\d+)\+(\d+)\+(\d+)\s+[0-9.eE+-]+,[0-9.eE+-]+\s+(\d+)\s+(.+)$/
const SPACES = /\s+/

interface Region {
  x: number
  y: number
  w: number
  h: number
  area: number
}

const fmtPct = (n: number) => `${Math.round(n * 10) / 10}%`

const isForeground = (color: string) => {
  const nums = [...color.matchAll(NUMBER)].map((m) => Number(m[0]))
  if (nums.length === 0) {
    return false
  }
  const sample = nums.slice(0, 3)
  return sample.reduce((a, b) => a + b, 0) / sample.length >= 128
}

const parseComponents = (text: string): Region[] => {
  const out: Region[] = []
  for (const line of text.split('\n')) {
    const m = line.match(COMPONENT)
    if (!m) {
      continue
    }
    const area = Number(m[5])
    const color = m[6]
    if (color === undefined || area < MIN_AREA || !isForeground(color)) {
      continue
    }
    out.push({ x: Number(m[3]), y: Number(m[4]), w: Number(m[1]), h: Number(m[2]), area })
  }
  return out.sort((a, b) => b.area - a.area)
}

/** ImageMagick calls that throw a ShotError (code 2) when the binary fails or an image is unreadable. */
const magickTools = (bin: string) => {
  const magick = (args: string[], allow: number[] = [0]) => {
    const r = spawnSync(bin, args, { encoding: 'utf8' })
    const exitCode = r.status ?? 1
    if (!allow.includes(exitCode)) {
      throw new ShotError(BAD_INPUT, r.stderr.trim() || `magick ${args[0] ?? 'convert'} failed`)
    }
    return { stdout: r.stdout, stderr: r.stderr }
  }
  const identify = (p: string): Size => {
    if (!isFile(p)) {
      throw new ShotError(BAD_INPUT, `missing file: ${p}`)
    }
    const r = spawnSync(bin, ['identify', '-format', '%w %h', p], { encoding: 'utf8' })
    const [w, h] = r.stdout.trim().split(SPACES).map(Number)
    if (r.status !== 0 || !(w && h)) {
      throw new ShotError(BAD_INPUT, `not an image: ${p}`)
    }
    return { w, h }
  }
  const maskMeanPct = (mask: string, crop?: string) =>
    Number(
      magick(
        crop
          ? [mask, '-crop', crop, '+repage', '-format', '%[fx:100*mean]', 'info:']
          : [mask, '-format', '%[fx:100*mean]', 'info:'],
      ).stdout.trim(),
    )
  return { magick, identify, maskMeanPct }
}

/** Compares a render to a mock; throws a ShotError (code 2) on a missing or unreadable image. */
export function compareShots(opts: ShotCompareOptions): ShotCompare {
  const bin = opts.magick ?? 'magick'
  const fuzz = opts.fuzz ?? 4
  const regionLimit = opts.regions ?? 5
  if (!Number.isFinite(fuzz) || fuzz < 0) {
    throw new ShotError(BAD_INPUT, `bad fuzz ${fuzz}`)
  }
  if (!Number.isInteger(regionLimit) || regionLimit < 0) {
    throw new ShotError(BAD_INPUT, `bad regions ${regionLimit}`)
  }

  const { magick, identify, maskMeanPct } = magickTools(bin)

  const aSize = identify(opts.render)
  const bSize = identify(opts.mock)
  const ow = Math.min(aSize.w, bSize.w)
  const oh = Math.min(aSize.h, bSize.h)
  const outDir = opts.outDir ?? dirname(resolve(opts.render))
  const work = mkdtempSync(join(tmpdir(), 'shotdiff-'))
  try {
    const a = join(work, 'a.png')
    const b = join(work, 'b.png')
    const mask = join(work, 'mask.png')
    // compare reads only the first image's channels: a grayscale PNG would hide every colour difference
    for (const [src, dest] of [
      [opts.render, a],
      [opts.mock, b],
    ] as const) {
      magick([src, '-crop', `${ow}x${oh}+0+0`, '+repage', '-colorspace', 'sRGB', `PNG24:${dest}`])
    }
    // compare exits 1 when the images differ; that is the metric, not a failure
    magick(
      [
        'compare',
        '-metric',
        'AE',
        '-fuzz',
        `${fuzz}%`,
        '-highlight-color',
        'white',
        '-lowlight-color',
        'black',
        '-compose',
        'src',
        a,
        b,
        mask,
      ],
      [0, 1],
    )
    const pct = maskMeanPct(mask)
    if (!Number.isFinite(pct) || pct === 0) {
      return { identical: true, lines: ['identical'] }
    }

    const dilated = join(work, 'dilated.png')
    magick([mask, '-threshold', '50%', '-morphology', 'Dilate', 'Square:1', dilated])
    const cc = magick([
      dilated,
      '-define',
      'connected-components:verbose=true',
      '-define',
      'connected-components:mean-color=true',
      '-connected-components',
      '8',
      'null:',
    ])
    const found = parseComponents(cc.stdout || cc.stderr).slice(0, regionLimit)
    const sizes = `${aSize.w}x${aSize.h} ${bSize.w}x${bSize.h}`
    const same = aSize.w === bSize.w && aSize.h === bSize.h
    const lines = [same ? sizes : `${sizes} overlapping ${ow}x${oh}`, fmtPct(pct)]
    for (const r of found) {
      const regionPct = Math.round(maskMeanPct(mask, `${r.w}x${r.h}+${r.x}+${r.y}`))
      lines.push(`${r.x},${r.y} ${r.w}x${r.h}  ${regionPct}% of region differs`)
    }
    const worst = found[0]
    if (worst !== undefined) {
      const x0 = Math.max(0, worst.x - MARGIN)
      const y0 = Math.max(0, worst.y - MARGIN)
      const x1 = Math.min(ow, worst.x + worst.w + MARGIN)
      const y1 = Math.min(oh, worst.y + worst.h + MARGIN)
      const crop = `${x1 - x0}x${y1 - y0}+${x0}+${y0}`
      const dest = join(outDir, 'shotdiff-worst.png')
      magick([
        '(',
        a,
        '-crop',
        crop,
        '+repage',
        ')',
        '(',
        b,
        '-crop',
        crop,
        '+repage',
        ')',
        '-background',
        'black',
        '+smush',
        String(GAP),
        '-resize',
        `${MAX_EDGE}x${MAX_EDGE}>`,
        dest,
      ])
      lines.push(dest)
    }
    return { identical: false, lines }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
