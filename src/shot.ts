import { spawnSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { dirname, join, parse, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

/** A failure with the exit code the command should end with: 2 for bad input, 1 for a failed render or compare. */
export class ShotError extends Error {
  readonly code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
  }
}

export interface Size {
  w: number
  h: number
}

export interface ShotOptions {
  /** A file path or an http(s)/file URL. */
  input: string
  /** Where the PNGs go; default is the cwd for a URL, else a `shots` folder beside the file. */
  outDir?: string
  /** Chromium's virtual-time budget in ms, default 3000. */
  wait?: number
  /** Default 1680x1000 and 360x740. */
  sizes?: Size[]
  /** Path of the browser binary; default is the first of chromium, chromium-browser, google-chrome on PATH. */
  chromium?: string
}

export interface ShotResult extends Size {
  path: string
  bytes: number
}

const DEFAULT_SIZES: Size[] = [
  { w: 1680, h: 1000 },
  { w: 360, h: 740 },
]
const DEFAULT_WAIT = 3000
const RENDER_TIMEOUT_S = 40
const BAD_INPUT = 2
const SIZE = /^(\d+)x(\d+)$/
const URL_SCHEME = /^(https?:|file:)/i

export const isFile = (p: string): boolean => {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

const which = (name: string): string | undefined => {
  const r = spawnSync('which', [name], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : undefined
}

export function chromiumBin(): string {
  for (const n of ['chromium', 'chromium-browser', 'google-chrome']) {
    const bin = which(n)
    if (bin) {
      return bin
    }
  }
  throw new ShotError(1, 'chromium not found')
}

export function parseSize(v: string): Size {
  const m = SIZE.exec(v)
  const w = m ? Number(m[1]) : Number.NaN
  const h = m ? Number(m[2]) : Number.NaN
  if (!(Number.isInteger(w) && Number.isInteger(h)) || w < 1 || h < 1) {
    throw new ShotError(BAD_INPUT, `bad --size ${v}`)
  }
  return { w, h }
}

const isUrl = (s: string) => URL_SCHEME.test(s)

const stemOf = (input: string, url: boolean) => {
  if (url) {
    try {
      const u = new URL(input)
      return parse(u.pathname).name || u.hostname || 'page'
    } catch {
      return 'page'
    }
  }
  return parse(input).name || 'page'
}

/** Renders a page headless at each size; throws a ShotError when the input is missing or a size fails to render. */
export function renderShots(opts: ShotOptions): ShotResult[] {
  const url = isUrl(opts.input)
  const abs = url ? opts.input : resolve(opts.input)
  if (!(url || isFile(abs))) {
    throw new ShotError(1, `missing file: ${abs}`)
  }
  const page = url ? abs : pathToFileURL(abs).href
  const outDir = opts.outDir ?? (url ? process.cwd() : join(dirname(abs), 'shots'))
  const stem = stemOf(abs, url)
  mkdirSync(outDir, { recursive: true })
  const bin = opts.chromium ?? chromiumBin()
  const wait = opts.wait ?? DEFAULT_WAIT

  const done: ShotResult[] = []
  const failed: string[] = []
  for (const { w, h } of opts.sizes ?? DEFAULT_SIZES) {
    const path = join(outDir, `${stem}-${w}x${h}.png`)
    // wait is chromium's virtual-time-budget; the timeout is wall clock
    const r = spawnSync(
      'timeout',
      [
        String(RENDER_TIMEOUT_S),
        bin,
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        `--window-size=${w},${h}`,
        `--virtual-time-budget=${wait}`,
        `--screenshot=${path}`,
        page,
      ],
      { stdio: 'pipe' },
    )
    const bytes = isFile(path) ? statSync(path).size : 0
    if (r.status !== 0 || bytes === 0) {
      failed.push(`${w}x${h}`)
      continue
    }
    done.push({ path, w, h, bytes })
  }
  if (failed.length > 0) {
    throw new ShotError(1, `render failed: ${failed.join(', ')}`)
  }
  return done
}
