import { expect, test } from 'bun:test'
import { Meter, perTen, type Sample } from './meter.ts'

const sample: Sample = {
  commits: 1,
  mounts: 0,
  updates: 0,
  top: [],
  startedBy: [],
  why: [],
  mutations: 0,
  longTasks: 0,
  longMs: 0,
  calls: 0,
  callsBy: [],
  slowest: [],
  layouts: 0,
  styles: 0,
  scriptMs: 0,
  heapMiB: 0,
  nodes: 0,
  listeners: 0,
  settledMs: 0,
  lastWhy: [],
}

test('perTen rejects watchedMs <= 0', () => {
  expect(() => perTen(sample, 0)).toThrow()
})

test('perTen scales per-window counters including callsBy and longTasks', () => {
  const got = perTen(
    { ...sample, calls: 2, callsBy: [['save', 2]], longTasks: 4, scriptMs: 20 },
    20_000,
  )
  expect(got.calls).toBe(1)
  expect(got.callsBy).toEqual([['save', 1]])
  expect(got.longTasks).toBe(2)
  expect(got.scriptMs).toBe(10)
})

function stubPage(read: unknown = null) {
  return {
    evaluate: async () => read,
    on() {
      /* Meter constructor binds request listeners. */
    },
    mainFrame: () => ({}),
  }
}

test('Meter enables Performance before reading metrics', async () => {
  const sent: string[] = []
  const cdp = {
    send: async (method: string) => {
      sent.push(method)
      return { metrics: [] }
    },
  }
  await new Meter(stubPage() as never, cdp as never).reset()
  const enable = sent.indexOf('Performance.enable')
  const get = sent.indexOf('Performance.getMetrics')
  expect(enable).toBeGreaterThanOrEqual(0)
  expect(enable).toBeLessThan(get)
})

test('libraryNames matching is independent of g and y flags', async () => {
  const page = stubPage({
    commits: 0,
    mounts: 0,
    updates: 0,
    names: { MuiBox: 3, List: 2, App: 1 },
    roots: {},
    why: {},
    mutations: 0,
    longTasks: 0,
    longMs: 0,
    settledMs: 0,
    lastWhy: [],
  })
  const cdp = {
    send: async () => ({ metrics: [] }),
  }
  const { top } = await new Meter(page as never, cdp as never, {
    libraryNames: /^(Mui|List)/g,
  }).read()
  expect(top.map(([n]) => n)).toEqual(['App'])
})

test('a main-frame navigation drops in-flight backend calls', async () => {
  const handlers = new Map<string, ((arg: never) => void)[]>()
  const main = {}
  const page = {
    evaluate: async () => 0,
    on(event: string, fn: (arg: never) => void) {
      handlers.set(event, [...(handlers.get(event) ?? []), fn])
    },
    mainFrame: () => main,
  }
  const fire = (event: string, arg: never) => {
    for (const fn of handlers.get(event) ?? []) {
      fn(arg)
    }
  }
  const lines: string[] = []
  const meter = new Meter(page as never, { send: async () => ({ metrics: [] }) } as never, {
    backendCall: () => 'save',
    log: (line) => {
      lines.push(line)
    },
  })
  fire('request', {} as never)
  await meter.untilStill(1, 0)
  expect(lines.at(-1)).toContain('save')
  fire('framenavigated', {} as never)
  await meter.untilStill(1, 0)
  expect(lines.at(-1)).toContain('save')
  fire('framenavigated', main as never)
  await meter.untilStill(1, 0)
  expect(lines.at(-1)).toMatch(/calls in flight: none$/)
})
