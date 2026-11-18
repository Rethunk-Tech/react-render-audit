import { describe, expect, test } from 'bun:test'
import { collapsed, covered, layoutBreaks, overflow } from './layout.ts'

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
  before: Css
  after: Css
  rect: Rect
  scrollWidth?: number
  clientWidth?: number
  textContent: string | null
  getAttribute: (name: string) => string | null
  matches: (sel: string) => boolean
  closest: (sel: string) => El | null
  contains: (other: El) => boolean
  getBoundingClientRect: () => Rect
  querySelectorAll: (sel: string) => El[]
  add: (...nodes: NodeLike[]) => El
}
interface Txt {
  nodeType: 3
  parentElement: El | null
  textContent: string | null
  box: Rect
  letter: Rect
}

function FakeText() {
  // covered() uses instanceof Text
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

function txt(
  textContent: string | null,
  box = rect(0, 0, 40, 16),
  letter = rect(0, 0, 8, 16),
): Txt {
  const node = Object.create(FakeText.prototype) as Txt
  node.nodeType = 3
  node.parentElement = null
  node.textContent = textContent
  node.box = box
  node.letter = letter
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
    before: { backgroundColor: 'rgb(0, 0, 0)' },
    after: { backgroundColor: 'rgb(0, 0, 0)' },
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
    contains(other) {
      for (let n: El | null = other; n; n = n.parentElement) {
        if (n === node) {
          return true
        }
      }
      return false
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

function pageEnv(html: El, body: El, hits: Map<string, El | null>) {
  const document = {
    documentElement: html,
    body,
    querySelectorAll: (sel: string) => html.querySelectorAll(sel),
    elementFromPoint: (x: number, y: number) => hits.get(`${x},${y}`) ?? null,
    createRange: () => {
      let target: NodeLike | null = null
      let letter = false
      return {
        setStart(n: Txt) {
          target = n
          letter = true
        },
        setEnd() {
          return
        },
        selectNodeContents(n: NodeLike) {
          target = n
          letter = false
        },
        getBoundingClientRect() {
          if (target && target.nodeType === 3) {
            return letter ? target.letter : target.box
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
    g.getComputedStyle = (node: El, pseudo?: string) => {
      if (pseudo === '::before') {
        return node.before
      }
      if (pseudo === '::after') {
        return node.after
      }
      return node.css
    }
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
  const evaluate = (fn: (arg?: unknown) => unknown, arg?: unknown) => {
    install()
    try {
      return arg === undefined ? fn() : fn(arg)
    } finally {
      restore()
    }
  }
  return { evaluate }
}

function tree() {
  const html = el('HTML', rect(0, 0, 1000, 800))
  const body = el('BODY', rect(0, 0, 1000, 800))
  html.add(body)
  return { html, body }
}

describe('overflow', () => {
  test('reports a page wider than its window, and stays quiet when it fits', () => {
    const { html, body } = tree()
    html.rect = rect(0, 0, 1000, 800)
    html.scrollWidth = 1200
    html.clientWidth = 1000
    const wide = pageEnv(html, body, new Map())
    expect(wide.evaluate(overflow)).toEqual([
      { kind: 'overflow', where: 'html', text: '1200px wide in a 1000px window' },
    ])

    html.scrollWidth = 1001
    const fit = pageEnv(html, body, new Map())
    expect(fit.evaluate(overflow)).toEqual([])
  })
})

describe('collapsed', () => {
  test('reports an in-view sliver and skips hidden layers, off-screen, and squat boxes', () => {
    const { html, body } = tree()
    const hidden = el('DIV', rect(0, 0, 0, 40))
    hidden.attrs.role = 'dialog'
    hidden.css.display = 'none'
    const closed = el('DIV', rect(0, 0, 200, 40))
    closed.attrs.role = 'menu'
    closed.attrs['aria-hidden'] = 'true'
    const faded = el('DIV', rect(0, 0, 200, 40))
    faded.attrs.role = 'listbox'
    faded.css.opacity = '0'
    const ghost = el('DIV', rect(0, 0, 200, 40))
    ghost.attrs.role = 'dialog'
    ghost.css.visibility = 'hidden'

    const sliver = el('IMG', rect(10, 10, 4, 20))
    sliver.attrs.alt = 'logo'
    const labeled = el('BUTTON', rect(20, 10, 4, 24))
    labeled.attrs['aria-label'] = 'go'
    const linked = el('A', rect(30, 10, 4, 24))
    linked.attrs.href = '/'
    linked.add(txt('link'))
    const off = el('IMG', rect(10, 900, 4, 20))
    const squat = el('IMG', rect(40, 10, 4, 4))
    const fat = el('IMG', rect(50, 10, 20, 20))
    const orphan = el('IMG', rect(60, 10, 4, 20))
    orphan.parentElement = null

    body.add(hidden, closed, faded, ghost, sliver, labeled, linked, off, squat, fat)
    body.childNodes.push(orphan)

    const { evaluate } = pageEnv(html, body, new Map())
    expect(evaluate(collapsed)).toEqual([
      { kind: 'collapsed', where: 'body>img', text: '4x20 logo' },
      { kind: 'collapsed', where: 'body>button', text: '4x24 go' },
      { kind: 'collapsed', where: 'body>a', text: '4x24 link' },
    ])
  })

  test('uses the top shown layer and falls back when a control has no name or parent', () => {
    const { html, body } = tree()
    const layer = el('DIV', rect(0, 0, 400, 200))
    layer.attrs.role = 'dialog'
    const btn = el('BUTTON', rect(8, 8, 4, 20))
    layer.add(btn)
    const stray = el('IMG', rect(8, 40, 4, 20))
    body.add(layer, stray)

    const shown = pageEnv(html, body, new Map())
    expect(shown.evaluate(collapsed)).toEqual([
      { kind: 'collapsed', where: 'div>button', text: '4x20 ' },
    ])
  })
})

describe('covered', () => {
  test('reports text under another element and skips every other hit', () => {
    const { html, body } = tree()
    const hits = new Map<string, El | null>()
    const at = (letter: Rect, hit: El | null) => {
      hits.set(`${letter.x + letter.width / 2},${letter.y + letter.height / 2}`, hit)
    }

    const sr = el('SPAN', rect(0, 0, 1, 1))
    sr.add(txt('sr', rect(0, 0, 1, 1), rect(0, 0, 1, 1)))

    const pe = el('SPAN', rect(0, 20, 80, 16))
    pe.css.pointerEvents = 'none'
    pe.add(txt('none', rect(0, 20, 80, 16), rect(0, 20, 8, 16)))

    const short = el('SPAN', rect(0, 40, 80, 16))
    short.add(txt('x', rect(0, 40, 8, 16), rect(0, 40, 8, 16)))

    const blank = el('SPAN', rect(0, 60, 80, 16))
    blank.add(txt('   ', rect(0, 60, 8, 16), rect(0, 60, 8, 16)))
    blank.add(txt(null, rect(0, 60, 8, 16), rect(0, 60, 8, 16)))

    const hidden = el('SPAN', rect(0, 80, 80, 16))
    hidden.css.visibility = 'hidden'
    hidden.add(txt('gone', rect(0, 80, 40, 16), rect(0, 80, 8, 16)))

    const clip = el('DIV', rect(0, 0, 10, 10))
    clip.css.overflowX = 'hidden'
    clip.css.overflowY = 'hidden'
    const clipped = el('SPAN', rect(40, 200, 80, 16))
    clipped.add(txt('clipped out', rect(40, 200, 80, 16), rect(40, 200, 8, 16)))
    clip.add(clipped)

    const hello = el('SPAN', rect(100, 100, 80, 16))
    const helloText = txt('Hello world', rect(100, 100, 80, 16), rect(100, 100, 8, 16))
    hello.add(helloText)
    const overlay = el('DIV', rect(90, 90, 40, 40))
    overlay.attrs['aria-label'] = 'Modal'
    at(helloText.letter, overlay)

    const same = el('SPAN', rect(200, 100, 80, 16))
    const sameText = txt('same box', rect(200, 100, 80, 16), rect(200, 100, 8, 16))
    same.add(sameText)
    at(sameText.letter, same)

    const inner = el('SPAN', rect(300, 100, 80, 16))
    const innerText = txt('inside', rect(300, 100, 80, 16), rect(300, 100, 8, 16))
    const childHit = el('B', rect(300, 100, 20, 16))
    inner.add(innerText, childHit)
    at(innerText.letter, childHit)

    const wrap = el('DIV', rect(400, 80, 120, 60))
    const nested = el('SPAN', rect(400, 100, 80, 16))
    const nestedText = txt('wrapped', rect(400, 100, 80, 16), rect(400, 100, 8, 16))
    nested.add(nestedText)
    wrap.add(nested)
    at(nestedText.letter, wrap)

    const pinHit = el('DIV', rect(500, 90, 40, 40))
    pinHit.css.position = 'sticky'
    const pin = el('SPAN', rect(500, 100, 80, 16))
    const pinText = txt('pinned', rect(500, 100, 80, 16), rect(500, 100, 8, 16))
    pin.add(pinText)
    at(pinText.letter, pinHit)

    const liveHit = el('DIV', rect(600, 90, 40, 40))
    liveHit.attrs['aria-live'] = 'polite'
    const live = el('SPAN', rect(600, 100, 80, 16))
    const liveText = txt('notify', rect(600, 100, 80, 16), rect(600, 100, 8, 16))
    live.add(liveText)
    at(liveText.letter, liveHit)

    const aside = el('ASIDE', rect(700, 90, 40, 40))
    aside.css.position = 'absolute'
    const side = el('SPAN', rect(700, 100, 80, 16))
    const sideText = txt('panel', rect(700, 100, 80, 16), rect(700, 100, 8, 16))
    side.add(sideText)
    at(sideText.letter, aside)

    const clickHit = el('DIV', rect(0, 700, 10, 10))
    clickHit.before = { backgroundColor: 'transparent' }
    clickHit.after = { backgroundColor: 'rgba(0, 0, 0, 0)' }
    const click = el('SPAN', rect(100, 300, 80, 16))
    const clickText = txt('clicker', rect(100, 300, 80, 16), rect(100, 300, 8, 16))
    click.add(clickText)
    at(clickText.letter, clickHit)

    const zero = el('SPAN', rect(100, 400, 80, 16))
    zero.add(txt('wide', rect(100, 400, 80, 16), rect(100, 400, 0, 16)))

    const hiddenDlg = el('DIV', rect(0, 0, 0, 40))
    hiddenDlg.attrs.role = 'dialog'
    const closedMenu = el('DIV', rect(0, 0, 200, 40))
    closedMenu.attrs.role = 'menu'
    closedMenu.css.display = 'none'
    const faded = el('DIV', rect(0, 0, 200, 40))
    faded.attrs.role = 'listbox'
    faded.css.visibility = 'hidden'
    const ghost = el('DIV', rect(0, 0, 200, 40))
    ghost.attrs.role = 'dialog'
    ghost.css.opacity = '0'
    const ariaOff = el('DIV', rect(0, 0, 200, 40))
    ariaOff.attrs.role = 'dialog'
    ariaOff.attrs['aria-hidden'] = 'true'
    const layer = el('DIV', rect(0, 0, 1000, 800))
    layer.attrs.role = 'dialog'
    layer.add(
      sr,
      pe,
      short,
      blank,
      hidden,
      clip,
      hello,
      overlay,
      same,
      inner,
      wrap,
      pin,
      pinHit,
      live,
      liveHit,
      side,
      aside,
      click,
      clickHit,
      zero,
    )
    body.add(hiddenDlg, closedMenu, faded, ghost, ariaOff, layer)

    const { evaluate } = pageEnv(html, body, hits)
    expect(evaluate(covered)).toEqual([
      { kind: 'covered', where: 'div>span', text: '"Hello world" under modal' },
    ])
  })
})

describe('layoutBreaks', () => {
  test('joins collapsed, covered, and overflow findings', async () => {
    const { html, body } = tree()
    html.scrollWidth = 1100
    html.clientWidth = 1000
    const sliver = el('IMG', rect(10, 10, 4, 20))
    sliver.attrs.alt = 'x'
    const hello = el('SPAN', rect(100, 100, 80, 16))
    const helloText = txt('Hi there', rect(100, 100, 80, 16), rect(100, 100, 8, 16))
    hello.add(helloText)
    const overlay = el('DIV', rect(90, 90, 40, 40))
    body.add(sliver, hello, overlay)
    const hits = new Map<string, El | null>([['104,108', overlay]])
    const { evaluate } = pageEnv(html, body, hits)
    const page = {
      evaluate: async (fn: (arg?: unknown) => unknown, arg?: unknown) => evaluate(fn, arg),
    }
    expect(await layoutBreaks(page as never)).toEqual([
      { kind: 'collapsed', where: 'body>img', text: '4x20 x' },
      { kind: 'covered', where: 'body>span', text: '"Hi there" under div' },
      { kind: 'overflow', where: 'html', text: '1100px wide in a 1000px window' },
    ])
  })
})
