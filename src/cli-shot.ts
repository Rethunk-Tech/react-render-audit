#!/usr/bin/env node
import process from 'node:process'
import { parseArgs } from 'node:util'
import { parseSize, renderShots, ShotError } from './shot.ts'

const USAGE = 'usage: render-shot FILE.html|URL [--size WxH]... [--out DIR] [--wait MS]'

// render-shot renders a page headless at each size and prints `PATH WxH BYTES` per PNG.
try {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      out: { type: 'string' },
      wait: { type: 'string' },
      size: { type: 'string', multiple: true },
    },
    allowPositionals: true,
    strict: true,
  })
  const [input] = positionals
  if (input === undefined || positionals.length !== 1) {
    throw new ShotError(2, USAGE)
  }
  const wait = values.wait === undefined ? undefined : Number(values.wait)
  if (wait !== undefined && !(Number.isInteger(wait) && wait >= 0)) {
    throw new ShotError(2, `bad --wait ${values.wait}`)
  }
  for (const s of renderShots({
    input,
    outDir: values.out,
    wait,
    sizes: values.size?.map(parseSize),
  })) {
    console.log(`${s.path} ${s.w}x${s.h} ${s.bytes}`)
  }
} catch (e) {
  if (e instanceof ShotError) {
    console.error(e.message)
    process.exitCode = e.code
  } else if ((e as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')) {
    console.error((e as Error).message)
    process.exitCode = 2
  } else {
    throw e
  }
}
