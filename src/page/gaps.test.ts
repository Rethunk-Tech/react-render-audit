import { describe, expect, test } from 'bun:test'
import { unevenSpacing } from './gaps.ts'

type Css = Record<string, string>
interface Rect {
  x: number
  y: number
  width: number
  height: number
  readonly top: number
  readonly left: number
  readonly right: number
  readonly bottom: number
}
type NodeLike = El | Txt
interface El {
  nodeType: 1
  tagName: string
  parentElement: El | null
  children: El[]
  childNodes: NodeLike[]
  classList: string[]
  attrs: Record<string, string>
  css: Css
  rect: Rect
  textContent: string | null
  getAttribute: (name: string) => string | null
  matches: (sel: string) => boolean
  closest: (sel: string) => El | null
  getBoundingClientRect: () => Rect
  querySelectorAll: (sel: string) => El[]
  add: (...nodes: NodeLike[]) => El
}
interface Txt {
  nodeType: 3
  parentElement: El | null
  textContent: string | null
  box: Rect
}

function FakeText() {
  // painted text nodes share this prototype
}

function rect(x = 0, y = 0, width = 100, height = 100): Rect {
  return {
    x,
    y,
    width,
    height,
    get top() {
      return this.y
    },
    get left() {
      return this.x
    },
    get right() {
      return this.x + this.width
    },
    get bottom() {
      return this.y + this.height
    },
  }
}

const defaultCss = (): Css => ({
  display: 'block',
  visibility: 'visible',
  opacity: '1',
  position: 'static',
  overflowX: 'visible',
  overflowY: 'visible',
  pointerEvents: 'auto',
  backgroundColor: 'rgba(0, 0, 0, 0)',
  borderTopWidth: '0px',
  borderTopColor: 'rgb(0, 0, 0)',
})

function txt(textContent: string | null, box = rect(0, 0, 40, 16)): Txt {
  const node = Object.create(FakeText.prototype) as Txt
  node.nodeType = 3
  node.parentElement = null
  node.textContent = textContent
  node.box = box
  return node
}

function el(tagName: string, rec = rect()): El {
  const node: El = {
    nodeType: 1,
    tagName,
    parentElement: null,
    children: [],
    childNodes: [],
    classList: [],
    attrs: {},
    css: defaultCss(),
    rect: rec,
    get textContent() {
      return node.childNodes.map((n) => n.textContent ?? '').join('')
    },
    getAttribute(name) {
      return node.attrs[name] ?? null
    },
    matches(sel) {
      return sel.split(',').some((part) => match(node, part.trim()))
    },
    closest(sel) {
      for (let n: El | null = node; n; n = n.parentElement) {
        if (n.matches(sel)) {
          return n
        }
      }
      return null
    },
    getBoundingClientRect() {
      return node.rect
    },
    querySelectorAll(sel) {
      const out: El[] = []
      const walk = (n: El) => {
        for (const c of n.children) {
          if (c.matches(sel)) {
            out.push(c)
          }
          walk(c)
        }
      }
      walk(node)
      return out
    },
    add(...nodes) {
      for (const n of nodes) {
        n.parentElement = node
        node.childNodes.push(n)
        if (n.nodeType === 1) {
          node.children.push(n)
        }
      }
      return node
    },
  }
  return node
}

function match(node: El, sel: string) {
  if (sel === 'body *') {
    for (let a = node.parentElement; a; a = a.parentElement) {
      if (a.tagName === 'BODY') {
        return true
      }
    }
    return false
  }
  const m = sel.match(/^([a-z0-9]*)(?:\[([a-z-]+)(?:=["']?([^"'\]]*)["']?)?\])?$/i)
  if (!m) {
    return false
  }
  const [, tag, attr, val] = m
  if (tag && node.tagName !== tag.toUpperCase()) {
    return false
  }
  if (attr) {
    const have = node.getAttribute(attr)
    if (have === null) {
      return false
    }
    if (val !== undefined && have !== val) {
      return false
    }
  }
  return true
}

function fill(node: El, box: Rect) {
  node.rect = box
  node.css.backgroundColor = 'rgb(255, 255, 255)'
  return node
}

function attachText(node: El, s: string) {
  node.add(txt(s, node.rect))
}

function pageOf(html: El, body: El) {
  const document = {
    documentElement: html,
    body,
    querySelectorAll: (sel: string) => html.querySelectorAll(sel),
    createRange: () => {
      let target: NodeLike | null = null
      return {
        setStart() {
          return
        },
        setEnd() {
          return
        },
        selectNodeContents(n: NodeLike) {
          target = n
        },
        getBoundingClientRect() {
          if (target && target.nodeType === 3) {
            return target.box
          }
          return target?.nodeType === 1 ? target.getBoundingClientRect() : rect(0, 0, 0, 0)
        },
      }
    },
    createTreeWalker: (root: El, what: number) => {
      const nodes: NodeLike[] = []
      const visit = (n: NodeLike) => {
        nodes.push(n)
        if (n.nodeType === 1) {
          for (const c of n.childNodes) {
            visit(c)
          }
        }
      }
      visit(root)
      let i = 0
      return {
        get currentNode() {
          return nodes[0] ?? null
        },
        nextNode() {
          i += 1
          while (i < nodes.length) {
            const n = nodes[i]
            const show =
              (n !== undefined && n.nodeType === 1 && (what & 1) !== 0) ||
              (n !== undefined && n.nodeType === 3 && (what & 4) !== 0)
            if (show) {
              return n
            }
            i += 1
          }
          return null
        },
      }
    },
  }
  const g = globalThis as unknown as Record<string, unknown>
  const keys = [
    'document',
    'innerHeight',
    'innerWidth',
    'getComputedStyle',
    'NodeFilter',
    'DOMRect',
    'Node',
    'Text',
  ]
  const saved = Object.fromEntries(keys.map((k) => [k, g[k]]))
  const install = () => {
    g.document = document
    g.innerHeight = 800
    g.innerWidth = 1000
    g.getComputedStyle = (node: El) => node.css
    g.NodeFilter = { SHOW_ELEMENT: 1, SHOW_TEXT: 4 }
    g.DOMRect = rect
    g.Node = { TEXT_NODE: 3 }
    g.Text = FakeText
  }
  const restore = () => {
    for (const k of keys) {
      g[k] = saved[k]
    }
  }
  return {
    evaluate: async (fn: (arg?: unknown) => unknown, arg?: unknown) => {
      install()
      try {
        return arg === undefined ? fn() : fn(arg)
      } finally {
        restore()
      }
    },
  }
}

function tree() {
  const html = el('HTML', rect(0, 0, 1000, 800))
  const body = el('BODY', rect(0, 0, 1000, 800))
  html.add(body)
  return { html, body }
}

describe('unevenSpacing', () => {
  test('reports a stack whose row gaps differ by more than two pixels', async () => {
    const { html, body } = tree()
    const stack = el('DIV', rect(0, 0, 200, 200))
    const one = fill(el('DIV'), rect(0, 0, 200, 20))
    const two = fill(el('DIV'), rect(0, 32, 200, 20))
    const three = fill(el('DIV'), rect(0, 72, 200, 20))
    attachText(one, 'one')
    attachText(two, 'two')
    attachText(three, 'three')
    stack.add(one, two, three)
    body.add(stack)
    expect(await unevenSpacing(pageOf(html, body) as never)).toEqual([
      { kind: 'gaps', where: 'div', sizes: [12, 20], text: 'onetwothree' },
    ])
  })

  test('ignores even stacks, side-by-side rows, skipped svg, and cards that are not inset', async () => {
    const { html, body } = tree()
    const even = el('DIV', rect(0, 0, 200, 120))
    even.add(
      fill(el('DIV'), rect(0, 0, 200, 20)),
      fill(el('DIV'), rect(0, 28, 200, 20)),
      fill(el('DIV'), rect(0, 56, 200, 20)),
    )
    const beside = el('DIV', rect(220, 0, 200, 80))
    beside.add(
      fill(el('DIV'), rect(220, 0, 60, 20)),
      fill(el('DIV'), rect(290, 0, 60, 20)),
      fill(el('DIV'), rect(360, 0, 60, 20)),
    )
    const abs = fill(el('DIV'), rect(0, 200, 40, 20))
    abs.css.position = 'absolute'
    even.add(abs)
    const svg = el('SVG', rect(0, 300, 80, 80))
    svg.add(fill(el('DIV'), rect(0, 300, 80, 20)))
    const pic = el('IMG', rect(0, 400, 80, 80))
    pic.css.backgroundColor = 'rgb(1, 1, 1)'
    const short = fill(el('DIV'), rect(0, 500, 80, 20))
    const empty = fill(el('DIV'), rect(200, 400, 80, 80))
    const flush = fill(el('DIV'), rect(400, 400, 80, 80))
    flush.add(fill(el('SPAN'), rect(400, 400, 80, 40)))
    const hidden = fill(el('DIV'), rect(0, 600, 80, 20))
    hidden.css.visibility = 'hidden'
    const off = fill(el('DIV'), rect(-50, -50, 10, 10))
    body.add(even, beside, svg, pic, short, empty, flush, hidden, off)
    expect(await unevenSpacing(pageOf(html, body) as never)).toEqual([])
  })

  test('reports a card inset more on one side, and names it from prefix and aria-label', async () => {
    const { html, body } = tree()
    const card = fill(el('DIV'), rect(0, 0, 120, 100))
    card.classList = ['App-card', 'other']
    card.attrs['aria-label'] = 'Tile'
    card.add(fill(el('SPAN'), rect(8, 20, 100, 50)))
    attachText(card, '  label  ')
    const edged = el('DIV', rect(200, 0, 120, 80))
    edged.css.backgroundColor = 'transparent'
    edged.css.borderTopWidth = '1px'
    edged.css.borderTopColor = 'rgb(0, 0, 0)'
    edged.add(fill(el('SPAN'), rect(208, 10, 100, 40)))
    body.add(card, edged)
    expect(
      await unevenSpacing(pageOf(html, body) as never, { skip: '', ownClassPrefix: 'App-' }),
    ).toEqual([
      {
        kind: 'inset',
        where: 'div.App-card[Tile]',
        sizes: [20, 30],
        text: 'label',
      },
      { kind: 'inset', where: 'div', sizes: [10, 30], text: '' },
    ])
  })

  test('gives up on a subtree that paints too many nodes', async () => {
    const { html, body } = tree()
    const stack = el('DIV', rect(0, 0, 200, 200))
    const bulky = fill(el('DIV'), rect(0, 0, 200, 20))
    for (let i = 0; i < 400; i += 1) {
      bulky.add(fill(el('SPAN'), rect(0, 0, 4, 4)))
    }
    stack.add(bulky, fill(el('DIV'), rect(0, 32, 200, 20)), fill(el('DIV'), rect(0, 64, 200, 20)))
    body.add(stack)
    expect(await unevenSpacing(pageOf(html, body) as never)).toEqual([])
  })
})
