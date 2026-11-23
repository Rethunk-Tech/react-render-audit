#!/usr/bin/env node
import process from 'node:process'
import { parseArgs } from 'node:util'
import { ShotError } from './shot.ts'
import { compareShots } from './shotdiff.ts'

const USAGE = 'usage: render-shotdiff RENDER.png MOCK.png [--out DIR] [--fuzz PCT] [--regions N]'

// render-shotdiff compares a render to a mock; exits 0 when identical, 1 when pixels differ, 2 on bad input.
try {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: { out: { type: 'string' }, fuzz: { type: 'string' }, regions: { type: 'string' } },
    allowPositionals: true,
    strict: true,
  })
  const [render, mock] = positionals
  if (render === undefined || mock === undefined || positionals.length !== 2) {
    throw new ShotError(2, USAGE)
  }
  const result = compareShots({
    render,
    mock,
    outDir: values.out,
    fuzz: values.fuzz === undefined ? undefined : Number(values.fuzz),
    regions: values.regions === undefined ? undefined : Number(values.regions),
  })
  console.log(result.lines.join('\n'))
  process.exitCode = result.identical ? 0 : 1
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
