import { afterEach, expect, test } from 'bun:test'
import type { Page } from '@playwright/test'
import { nestedBoxes } from './boxes.ts'

const page = {
  evaluate: <A, R>(fn: (arg: A) => R, arg: A) => fn(arg),
} as Page

const prevDocument = globalThis.document
const prevGetComputedStyle = globalThis.getComputedStyle

afterEach(() => {
  globalThis.document = prevDocument
  globalThis.getComputedStyle = prevGetComputedStyle
})

type Style = {
  borderTopLeftRadius: string
  backgroundColor: string
  getPropertyValue: (prop: string) => string
}

const style = ({
  radius = '0px',
  bg = 'transparent',
  borderW = '0px',
  borderC = 'transparent',
}: {
  radius?: string
  bg?: string
  borderW?: string
  borderC?: string
} = {}): Style => ({
  borderTopLeftRadius: radius,
  backgroundColor: bg,
  getPropertyValue: (prop) => (prop.endsWith('-width') ? borderW : borderC),
})

const boxedFill = style({ radius: '4px', bg: 'rgb(255, 255, 255)' })
const boxedEdge = style({
  radius: '4px',
  bg: 'rgba(0, 0, 0, 0)',
  borderW: '1px',
  borderC: 'rgb(0, 0, 0)',
})
const notBoxed = style()

type Node = {
  tagName: string
  classList: string[]
  parentElement: Node | null
  textContent: string | null
  label: string | null
  sels: string[]
  rect: { width: number; height: number }
  getAttribute: (name: string) => string | null
  getBoundingClientRect: () => { width: number; height: number }
  matches: (sel: string) => boolean
  closest: (sel: string) => Node | null
}

const node = (partial: Partial<Node> & { tagName: string }): Node => {
  const el: Node = {
    classList: [],
    parentElement: null,
    textContent: '',
    label: null,
    sels: [],
    rect: { width: 200, height: 50 },
    getAttribute: (name) => (name === 'aria-label' ? el.label : null),
    getBoundingClientRect: () => el.rect,
    matches: (sel) => el.sels.includes(sel),
    closest: (sel) => {
      let up: Node | null = el
      while (up) {
        if (up.matches(sel)) {
          return up
        }
        up = up.parentElement
      }
      return null
    },
    ...partial,
  }
  return el
}

const install = (body: Node, els: Node[], styles: Map<Node, Style>) => {
  globalThis.document = { body, querySelectorAll: () => els } as unknown as Document
  globalThis.getComputedStyle = ((el: Node) =>
    styles.get(el) ?? notBoxed) as unknown as typeof getComputedStyle
}

test('reports a nested boxed element and skips the rest', async () => {
  const body = node({ tagName: 'BODY' })
  const outer = node({
    tagName: 'DIV',
    classList: ['app-Card', 'MuiPaper-root'],
    parentElement: body,
  })
  const mid = node({ tagName: 'DIV', parentElement: outer })
  const inner = node({
    tagName: 'SECTION',
    classList: ['app-Panel', 'app-Panel-pad', 'other'],
    parentElement: mid,
    label: 'Details',
    textContent: null,
  })
  const zero = node({ tagName: 'DIV', parentElement: outer, rect: { width: 0, height: 40 } })
  const flat = node({ tagName: 'DIV', parentElement: outer, rect: { width: 40, height: 0 } })
  const control = node({
    tagName: 'INPUT',
    parentElement: outer,
    sels: ['input, textarea'],
  })
  const plain = node({ tagName: 'DIV', parentElement: outer })
  const surface = node({
    tagName: 'DIV',
    parentElement: body,
    sels: ['.paper'],
  })
  const onSurface = node({ tagName: 'DIV', parentElement: surface })
  const top = node({ tagName: 'DIV', parentElement: body })

  install(
    body,
    [outer, mid, inner, zero, flat, control, plain, surface, onSurface, top],
    new Map([
      [outer, boxedFill],
      [mid, notBoxed],
      [inner, boxedEdge],
      [zero, boxedFill],
      [flat, boxedFill],
      [control, boxedFill],
      [plain, notBoxed],
      [surface, boxedFill],
      [onSurface, boxedFill],
      [top, boxedFill],
    ]),
  )

  expect(
    await nestedBoxes(page, {
      surfaces: '.paper',
      controls: 'input, textarea',
      ownClassPrefix: 'app-',
    }),
  ).toEqual([
    {
      inner: 'section.app-Panel.app-Panel-pad[Details]',
      outer: 'div.app-Card',
      text: '',
    },
  ])
})

test('default options skip inputs and walk to body without a surface', async () => {
  const body = node({ tagName: 'BODY' })
  const outer = node({ tagName: 'ARTICLE', parentElement: body, textContent: 'x'.repeat(80) })
  const inner = node({
    tagName: 'DIV',
    parentElement: outer,
    textContent: 'x'.repeat(80),
  })
  const field = node({
    tagName: 'INPUT',
    parentElement: outer,
    sels: ['input, textarea'],
  })

  install(
    body,
    [outer, inner, field],
    new Map([
      [outer, boxedFill],
      [inner, boxedFill],
      [field, boxedFill],
    ]),
  )

  expect(await nestedBoxes(page)).toEqual([
    {
      inner: 'div',
      outer: 'article',
      text: 'x'.repeat(60),
    },
  ])
})
