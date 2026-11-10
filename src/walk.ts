import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'
import { collapsed, covered, type LayoutBreak, overflow } from './page/layout.ts'

const SETTLE_MS = 3000
const HALF_SETTLE_MS = SETTLE_MS / 2
const DRIVER_START_MS = 800
const DEFAULT_VIEW = { width: 1400, height: 840 }
const DEFAULT_DRIVER = '/usr/bin/WebKitWebDriver'
const DEFAULT_BROWSER = '/usr/libexec/webkit2gtk-4.1/MiniBrowser'

/** A step clicks the element of that role whose accessible name matches, in the page. */
export interface Step {
  role: 'tab' | 'button' | 'menuitem'
  name: string
  /** Searches only inside this container, for a name another control shares. */
  within?: string
}
/** The screens in an order where each is reached from the one before by clicking, so the app loads once. `from` is what
 * leads back to a screen's starting point after a reload, when a step finds nothing to click. */
export interface Screen {
  name: string
  steps: Step[]
  from?: Step[]
}

export interface Walk {
  /** The page the walk loads first. */
  url: string
  screens: Screen[]
  /** The driver's environment: whatever makes MiniBrowser open on the display meant for it. */
  env: Record<string, string>
  /** A folder for a picture of each screen loading and settled, in `loading/` and beside it. */
  shots?: string
  /** WebKitWebDriver's path. */
  driver?: string
  /** MiniBrowser's path. */
  browser?: string
  /** WebKitWebDriver's port; a free one when unset. */
  port?: number
  view?: { width: number; height: number }
  /** Hears a line as each screen is checked. */
  log?: (line: string) => void
}

/** A layout break on a screen, or a step that found nothing to click (`where` is its role, `text` its name). */
export type WalkBreak = { screen: string } & (
  | LayoutBreak
  | { kind: 'missing'; where: string; text: string }
)

type Json = Record<string, unknown>
const isJson = (v: unknown): v is Json => typeof v === 'object' && v !== null

async function call(base: string, method: string, path: string, body?: Json): Promise<unknown> {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const json: unknown = await res.json()
  if (!(res.ok && isJson(json))) {
    throw new Error(`${method} ${path}: ${JSON.stringify(json).slice(0, ERROR_PREVIEW_CHARS)}`)
  }
  return json.value
}

// The page-side click: the first element of the role whose aria-label or text matches, waiting up to a few seconds.
const CLICK = `
  const [role, pattern, within, done] = arguments
  const re = new RegExp(pattern)
  const sel = { tab: '[role=tab]', button: 'button,[role=button]', menuitem: '[role=menuitem]' }[role]
  const start = Date.now()
  const tryClick = () => {
    const el = [...(within ? document.querySelector(within) ?? document : document).querySelectorAll(sel)].find((e) => re.test((e.getAttribute('aria-label') ?? e.textContent ?? '').trim()))
    if (el) { el.click(); done(true) } else if (Date.now() - start > 8000) { done(false) } else { setTimeout(tryClick, 200) }
  }
  tryClick()
`
// The page-side wait: done once the DOM has not changed for quiet ms, or max ms have passed.
const STILL = `
  const [quiet, max, done] = arguments
  const start = Date.now()
  let last = start
  const watch = new MutationObserver(() => { last = Date.now() })
  watch.observe(document, { subtree: true, childList: true, attributes: true, characterData: true })
  const tick = () => {
    const now = Date.now()
    if (now - last >= quiet || now - start >= max) { watch.disconnect(); done(true) } else { setTimeout(tick, 50) }
  }
  tick()
`
const QUIET_MS = 300
const ERROR_PREVIEW_CHARS = 300
const check = (fn: () => unknown) => `return (${fn.toString()})()`

/** One WebDriver session: the driver's address and the session's id. */
interface Session {
  base: string
  id: string
}

const click = async ({ base, id }: Session, s: Step) =>
  Boolean(
    await call(base, 'POST', `/session/${id}/execute/async`, {
      script: CLICK,
      args: [s.role, s.name, s.within ?? ''],
    }),
  )

const still = ({ base, id }: Session, maxMs: number) =>
  call(base, 'POST', `/session/${id}/execute/async`, { script: STILL, args: [QUIET_MS, maxMs] })

async function load(session: Session, url: string) {
  await call(session.base, 'POST', `/session/${session.id}/url`, { url })
  await still(session, SETTLE_MS)
}

const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex')
const MAX_SHOT_BYTES = 33_554_432

/** The driver's answer as screenshot bytes, and only a PNG within the cap: whatever answers on the driver's port
 * would otherwise choose what lands on disk under a name this walk owns. */
export function shotBytes(answer: unknown): Buffer {
  const bytes = Buffer.from(String(answer), 'base64')
  if (bytes.length > MAX_SHOT_BYTES) {
    throw new Error(`screenshot answer is over ${MAX_SHOT_BYTES} bytes`)
  }
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('screenshot answer is not a PNG')
  }
  return bytes
}

async function shoot({ base, id }: Session, file: string) {
  await writeFile(file, shotBytes(await call(base, 'GET', `/session/${id}/screenshot`)))
}

// Reaches one screen from the one before, reloading only when a step finds nothing, and returns its layout breaks. The
// loading picture is taken as the last step lands, the settled one after the wait.
async function visit(session: Session, screen: Screen, w: Walk): Promise<WalkBreak[]> {
  const breaks: WalkBreak[] = []
  let reached = true
  for (const s of screen.steps) {
    reached = reached && (await click(session, s))
    if (w.shots && s === screen.steps.at(-1)) {
      await shoot(session, join(w.shots, 'loading', `${screen.name}.png`))
    }
    await still(session, HALF_SETTLE_MS)
  }
  if (!reached) {
    await load(session, w.url)
    for (const s of [
      ...(screen.from ?? []),
      ...screen.steps.filter((x) => !(screen.from ?? []).includes(x)),
    ]) {
      if (!(await click(session, s))) {
        breaks.push({ screen: screen.name, kind: 'missing', where: s.role, text: s.name })
      }
      if (w.shots && s === screen.steps.at(-1)) {
        await shoot(session, join(w.shots, 'loading', `${screen.name}.png`))
      }
      await still(session, HALF_SETTLE_MS)
    }
  }
  await still(session, SETTLE_MS)
  for (const fn of [collapsed, covered, overflow]) {
    const found = await call(session.base, 'POST', `/session/${session.id}/execute/sync`, {
      script: check(fn),
      args: [],
    })
    for (const b of Array.isArray(found) ? found.filter(isJson) : []) {
      breaks.push({ screen: screen.name, ...(b as unknown as LayoutBreak) })
    }
  }
  if (w.shots) {
    await shoot(session, join(w.shots, `${screen.name}.png`))
  }
  return breaks
}

/** Walks every screen in WebKitGTK through WebKitWebDriver and returns the layout breaks found, or null when the driver
 * or the browser binary is missing. React render counts need Chromium's DevTools protocol, so this only checks and
 * pictures. */
export async function webkitWalk(w: Walk): Promise<WalkBreak[] | null> {
  const driverBin = w.driver ?? DEFAULT_DRIVER
  const browser = w.browser ?? DEFAULT_BROWSER
  if (!(existsSync(driverBin) && existsSync(browser))) {
    return null
  }
  if (w.shots) {
    await mkdir(join(w.shots, 'loading'), { recursive: true })
  }
  const port = w.port ?? (await freePort())
  const base = `http://127.0.0.1:${port}`
  const driver = spawn(driverBin, [`--port=${port}`], { env: w.env, stdio: 'ignore' })
  // A walk interrupted by a signal would leave the driver and its browser running; they go first, then the signal
  // ends the process as it would have.
  const stop = (signal: NodeJS.Signals) => {
    driver.kill()
    process.kill(process.pid, signal)
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  const breaks: WalkBreak[] = []
  try {
    await sleep(DRIVER_START_MS)
    const created = await call(base, 'POST', '/session', {
      capabilities: {
        alwaysMatch: {
          'webkitgtk:browserOptions': { binary: browser, args: ['--automation'] },
        },
      },
    })
    const session = { base, id: isJson(created) ? String(created.sessionId) : '' }
    await call(base, 'POST', `/session/${session.id}/window/rect`, w.view ?? DEFAULT_VIEW).catch(
      () => undefined,
    )
    await load(session, w.url)
    for (const screen of w.screens) {
      breaks.push(...(await visit(session, screen, w)))
      w.log?.(`${screen.name} checked (WebKitGTK)`)
    }
    await call(base, 'DELETE', `/session/${session.id}`)
  } finally {
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
    driver.kill()
  }
  return breaks
}

// A port the system has free, so a driver another walk left behind never takes this one's sessions.
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}
