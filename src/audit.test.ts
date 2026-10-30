import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Browser, type BrowserContext, chromium } from '@playwright/test'
import { build } from 'bun'
import { diffShots } from './diff.ts'
import { hookScript } from './hook.ts'
import { Meter } from './meter.ts'
import { nestedBoxes } from './page/boxes.ts'
import { unevenSpacing } from './page/gaps.ts'
import { layoutBreaks } from './page/layout.ts'
import { muiPreset } from './preset.ts'

let browser: Browser
let context: BrowserContext

beforeAll(async () => {
  browser = await chromium.launch()
  context = await browser.newContext({ viewport: { width: 1000, height: 600 } })
})
afterAll(async () => {
  await browser.close()
})

async function page(html: string) {
  const p = await context.newPage()
  await p.setContent(html)
  return p
}

test('layout breaks: a collapsed image, a covered label, a page wider than its window', async () => {
  const p = await page(`
    <body style="margin:0">
      <img alt="sliver" style="display:block;width:2px;height:40px" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
      <div style="position:relative;margin:20px;width:200px;height:30px">
        <span>Hidden label</span>
        <div style="position:absolute;inset:0;background:#000"></div>
      </div>
      <div style="width:2000px;height:10px"></div>
    </body>`)
  const kinds = (await layoutBreaks(p)).map((b) => b.kind)
  expect(kinds).toContain('collapsed')
  expect(kinds).toContain('covered')
  expect(kinds).toContain('overflow')
  await p.close()
})

test('layout breaks: a sane page has none', async () => {
  const p = await page('<body><button style="width:80px;height:30px">ok</button><p>text</p></body>')
  expect(await layoutBreaks(p)).toEqual([])
  await p.close()
})

test('uneven spacing names a stack with gaps 8/8/24, and an even one is clean', async () => {
  const rows = (gaps: number[]) =>
    `<div id="stack" style="width:300px">${['a', 'b', 'c', 'd']
      .map(
        (t, i) =>
          `<div style="height:20px;background:#ccc;margin-top:${i === 0 ? 0 : gaps[i - 1]}px">${t}</div>`,
      )
      .join('')}</div>`
  const uneven = await page(rows([8, 8, 24]))
  const found = await unevenSpacing(uneven)
  expect(found.find((f) => f.kind === 'gaps')?.sizes).toEqual([8, 8, 24])
  await uneven.close()

  const even = await page(rows([8, 8, 8]))
  expect(await unevenSpacing(even)).toEqual([])
  await even.close()
})

test('nested boxes: a bordered box in a bordered box, unless the outer one is a surface', async () => {
  const html = (outerClass: string) => `
    <div class="${outerClass}" style="border:1px solid #888;border-radius:6px;padding:10px;width:400px">
      <div style="border:1px solid #888;border-radius:6px;width:200px;height:40px">inner</div>
    </div>`
  const nested = await page(html('card'))
  const found = await nestedBoxes(nested)
  expect(found).toHaveLength(1)
  expect(found[0]?.text).toBe('inner')
  await nested.close()

  const surface = await page(html('paper'))
  expect(await nestedBoxes(surface, { surfaces: '.paper' })).toEqual([])
  await surface.close()
})

test('the hook counts a click as an update of the component that started it, and a mount once', async () => {
  const built = await build({
    entrypoints: [join(import.meta.dir, '../test/fixtures/app.ts')],
    target: 'browser',
    minify: false,
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  expect(built.success).toBe(true)
  const bundle = await built.outputs[0]?.text()
  const p = await context.newPage()
  await p.addInitScript({ content: hookScript({ global: 'counts' }) })
  await p.goto('about:blank')
  await p.setContent('<div id="root"></div>')
  await p.addScriptTag({ content: bundle ?? '' })
  await p.waitForSelector('.label')

  const meter = new Meter(p, await context.newCDPSession(p), { global: 'counts' })
  await meter.reset()
  await p.click('.inc')
  await meter.untilStill(100, 3000)
  const sample = await meter.read()
  expect(sample.commits).toBe(1)
  expect(sample.mounts).toBe(0)
  expect(sample.startedBy).toEqual([['Counter', sample.updates]])
  expect(sample.top.map(([name]) => name)).toContain('Label')
  expect(sample.why[0]?.[0]).toContain('hook 0')
  await p.close()
})

test('diffShots lists a changed screen, one only one side has, and writes the picture', async () => {
  const p = await context.newPage()
  const png = (color: string) =>
    p.evaluate((c) => {
      const canvas = document.createElement('canvas')
      canvas.width = 2
      canvas.height = 2
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
      ctx.fillStyle = c
      ctx.fillRect(0, 0, 2, 2)
      return canvas.toDataURL('image/png').split(',')[1] ?? ''
    }, color)
  const [red, blue] = [await png('#f00'), await png('#00f')]
  await p.close()

  const root = mkdtempSync(join(tmpdir(), 'render-audit-'))
  try {
    const [before, after] = [join(root, 'before'), join(root, 'after')]
    mkdirSync(before)
    mkdirSync(after)
    writeFileSync(join(before, 'home.png'), Buffer.from(red, 'base64'))
    writeFileSync(join(after, 'home.png'), Buffer.from(blue, 'base64'))
    writeFileSync(join(before, 'same.png'), Buffer.from(red, 'base64'))
    writeFileSync(join(after, 'same.png'), Buffer.from(red, 'base64'))
    writeFileSync(join(before, 'old.png'), Buffer.from(red, 'base64'))
    writeFileSync(join(after, 'new.png'), Buffer.from(red, 'base64'))

    const result = await diffShots(before, after)
    expect(result.changed).toEqual([{ name: 'home', changed: 1 }])
    expect(result.gone).toEqual(['old'])
    expect(result.added).toEqual(['new'])
    expect(result.compared).toBe(2)
    expect(readdirSync(result.out)).toEqual(['home.png'])
  } finally {
    rmSync(root, { recursive: true })
  }
})

test('muiPreset names the selectors the checks take as options', () => {
  expect(muiPreset.libraryNames.test('TouchRipple')).toBe(true)
  expect(muiPreset.libraryNames.test('ModCard')).toBe(false)
  expect(muiPreset.ownClassPrefix).toBe('Mui')
})
