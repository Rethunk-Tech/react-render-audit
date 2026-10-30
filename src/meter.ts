import type { CDPSession, Page, Request } from '@playwright/test'
import { DEFAULT_GLOBAL } from './hook.ts'

const QUIET_POLL_MS = 100
const DEFAULT_TOP = 8
const KIB = 1024
const MIB = KIB * KIB
const ONE_DECIMAL = 10
const MS_PER_S = 1000
const DWELL_POLL_MS = 100
const DWELL_GRACE_MS = 30_000

// Holds for ms on the page's own clock, polled in the page so a hung renderer fails the wait instead of passing it. For
// dwells that wait on the absence of an event, where no state change exists to wait for.
async function dwell(page: Page, ms: number) {
  await page.waitForFunction(
    ([t0, span]) => Date.now() - (t0 ?? 0) >= (span ?? 0),
    [Date.now(), ms],
    { polling: DWELL_POLL_MS, timeout: ms + DWELL_GRACE_MS },
  )
}

export interface Sample {
  commits: number
  mounts: number
  updates: number
  top: [string, number][]
  /** The components cascades of re-renders started at, with how many re-renders each started, most first. */
  startedBy: [string, number][]
  /** What changed at each root (changed props, or the position and a preview of each changed state hook), by the re-renders it caused. */
  why: [string, number][]
  mutations: number
  longTasks: number
  longMs: number
  calls: number
  callsBy: [string, number][]
  /** The slowest backend calls by method, each method's worst wait in ms, slowest first. */
  slowest: [string, number][]
  layouts: number
  styles: number
  scriptMs: number
  heapMiB: number
  nodes: number
  listeners: number
  /** Wall time from `reset` to the last React commit. */
  settledMs: number
  /** What started the cascades of that last commit. */
  lastWhy: string[]
}

interface PageCounts {
  commits: number
  mounts: number
  updates: number
  names: Record<string, number>
  roots: Record<string, number>
  why: Record<string, number>
  mutations: number
  longTasks: number
  longMs: number
  settledMs: number
  lastWhy: string[]
}

type Metrics = Partial<Record<string, number>>

export interface MeterOptions {
  /** Names the backend method a request calls, or null when the request is not a backend call. */
  backendCall?: (request: Request) => string | null
  /** How many rows each ranked list keeps. */
  top?: number
  /** Component names matching this are left out of `top`: library building blocks, not the app's own. */
  libraryNames?: RegExp | null
  /** The window property the hook script was installed under. */
  global?: string
  /** Hears the line `untilStill` writes when the page does not settle. */
  log?: (line: string) => void
}

export class Meter {
  calls = 0
  private lastCallAt = 0
  private readonly named = new Map<string, number>()
  private readonly started = new Map<Request, number>()
  private readonly worst = new Map<string, number>()
  private before: Metrics = {}
  private readonly page: Page
  private readonly cdp: CDPSession
  private readonly backendCall: (request: Request) => string | null
  private readonly top: number
  private readonly libraryNames: RegExp | null
  private readonly global: string
  private readonly log: (line: string) => void

  constructor(
    page: Page,
    cdp: CDPSession,
    {
      backendCall = () => null,
      top = DEFAULT_TOP,
      libraryNames = null,
      global = DEFAULT_GLOBAL,
      log = () => undefined,
    }: MeterOptions = {},
  ) {
    this.page = page
    this.cdp = cdp
    this.backendCall = backendCall
    this.top = top
    this.libraryNames = libraryNames
    this.global = global
    this.log = log
    const settled = (r: Request) => {
      const what = backendCall(r)
      if (what !== null) {
        this.lastCallAt = Date.now()
        const ms = this.lastCallAt - (this.started.get(r) ?? this.lastCallAt)
        this.started.delete(r)
        this.worst.set(what, Math.max(ms, this.worst.get(what) ?? 0))
      }
    }
    // A reload cancels the old document's calls, sometimes with no requestfailed, so they are not left in flight.
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        this.started.clear()
      }
    })
    page.on('requestfinished', settled)
    page.on('requestfailed', settled)
    page.on('request', (r) => {
      const what = backendCall(r)
      if (what !== null) {
        this.calls += 1
        this.started.set(r, Date.now())
        this.named.set(what, (this.named.get(what) ?? 0) + 1)
      }
    })
  }

  /** Waits until React has not committed, no backend call is in flight and none finished for quietMs (counted from the
   * call at the earliest), or maxMs passes. */
  async untilStill(quietMs: number, maxMs: number) {
    const start = Date.now()
    while (Date.now() - start < maxMs) {
      const sinceCommit = await this.page.evaluate(
        (name) => (globalThis as unknown as RenderWindow)[name]?.stillMs() ?? 0,
        this.global,
      )
      const now = Date.now()
      if (
        this.started.size === 0 &&
        Math.min(sinceCommit, now - this.lastCallAt, now - start) >= quietMs
      ) {
        return
      }
      await dwell(this.page, QUIET_POLL_MS)
    }
    const open = [...this.started].map(
      ([r, at]) => `${this.backendCall(r)} (${Date.now() - at} ms)`,
    )
    this.log(`  not still after ${maxMs} ms; calls in flight: ${open.join(', ') || 'none'}`)
  }

  private async metrics(): Promise<Metrics> {
    const { metrics } = await this.cdp.send('Performance.getMetrics')
    return Object.fromEntries(metrics.map((m) => [m.name, m.value]))
  }

  async reset() {
    await this.page.evaluate(
      (name) => (globalThis as unknown as RenderWindow)[name]?.reset(),
      this.global,
    )
    this.calls = 0
    this.named.clear()
    this.worst.clear()
    this.before = await this.metrics()
  }

  async read(): Promise<Sample> {
    const c = await this.page.evaluate(
      (name) => (globalThis as unknown as RenderWindow)[name]?.read(),
      this.global,
    )
    if (!c) {
      throw new Error(
        `window.${this.global} is missing: install hookScript() before the page loads`,
      )
    }
    const m = await this.metrics()
    const delta = (k: string) => (m[k] ?? 0) - (this.before[k] ?? 0)
    return {
      commits: c.commits,
      mounts: c.mounts,
      updates: c.updates,
      top: Object.entries(c.names)
        .filter(([n]) => !this.libraryNames?.test(n))
        .sort((a, b) => b[1] - a[1])
        .slice(0, this.top),
      startedBy: Object.entries(c.roots)
        .sort((a, b) => b[1] - a[1])
        .slice(0, this.top),
      why: Object.entries(c.why)
        .sort((a, b) => b[1] - a[1])
        .slice(0, this.top),
      mutations: c.mutations,
      longTasks: c.longTasks,
      longMs: Math.round(c.longMs),
      settledMs: Math.round(c.settledMs),
      lastWhy: c.lastWhy,
      calls: this.calls,
      callsBy: [...this.named].sort((a, b) => b[1] - a[1]).slice(0, this.top),
      slowest: [...this.worst].sort((a, b) => b[1] - a[1]).slice(0, this.top),
      layouts: delta('LayoutCount'),
      styles: delta('RecalcStyleCount'),
      scriptMs: Math.round(delta('ScriptDuration') * MS_PER_S),
      heapMiB: Math.round(((m.JSHeapUsedSize ?? 0) / MIB) * ONE_DECIMAL) / ONE_DECIMAL,
      nodes: m.Nodes ?? 0,
      listeners: m.JSEventListeners ?? 0,
    }
  }
}

type RenderWindow = Record<
  string,
  { reset: () => void; read: () => PageCounts; stillMs: () => number } | undefined
>

const TEN_S_MS = 10_000

/** Idle figures per 10 s, whatever the watch length. */
export function perTen(s: Sample, watchedMs: number): Sample {
  const k = TEN_S_MS / watchedMs
  const scale = (n: number) => Math.round(n * k)
  return {
    ...s,
    commits: scale(s.commits),
    mounts: scale(s.mounts),
    updates: scale(s.updates),
    mutations: scale(s.mutations),
    calls: scale(s.calls),
    layouts: scale(s.layouts),
    styles: scale(s.styles),
    scriptMs: scale(s.scriptMs),
    top: s.top.map(([n, v]) => [n, scale(v)]),
    startedBy: s.startedBy.map(([n, v]) => [n, scale(v)]),
    why: s.why.map(([n, v]) => [n, scale(v)]),
  }
}
