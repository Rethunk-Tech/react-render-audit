import { readdirSync, readFileSync, readlinkSync } from 'node:fs'
import process from 'node:process'

// Process-tree memory sampling from Linux /proc, for budget scripts. Every helper answers 0 or '' once a process exits,
// so a walk that races a shutting-down tree needs no error handling.

export const MIB = 1024

const PSS_ROLLUP = /^Pss:\s+(\d+) kB/m
const PSS_LINE = /^Pss:\s+(\d+) kB/
const MAPPING_HEAD = /^[0-9a-f]+-[0-9a-f]+ \S+ \S+ \S+ \S+\s*(.*)$/
const SHARED_OBJECT = /\.so(\.|$)/
const DELETED = / \(deleted\)$/
const CHROMIUM = /chrom|headless_shell/i
const CHILD_TYPE = /--type=([\w-]+)/

const CLOCK_TICKS_PER_S = 100

/** pid -> parent pid of every process, from /proc. */
function parents(): Map<number, number> {
  const map = new Map<number, number>()
  for (const name of readdirSync('/proc')) {
    try {
      const stat = readFileSync(`/proc/${name}/stat`, 'utf8')
      // The command name may hold spaces and parentheses, so the fields start after the last one.
      const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      map.set(Number(name), Number(rest[1]))
    } catch {
      // Not a process, or it ended while the walk ran.
    }
  }
  return map
}

export function tree(root: number): number[] {
  const kids = parents()
  const out = [root]
  for (const parent of out) {
    for (const [pid, ppid] of kids) {
      if (ppid === parent) {
        out.push(pid)
      }
    }
  }
  return out
}

/** KiB of PSS (RSS where the kernel gives no PSS) of one process, 0 once it is gone. */
export function pssKiB(pid: number): number {
  try {
    const text = readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8')
    const pss = PSS_ROLLUP.exec(text)
    return pss ? Number(pss[1]) : 0
  } catch {
    return 0
  }
}

/** The browser's main process: the one of the descendants of `root` that is Chromium and has no --type (its helpers
 * do). Playwright does not hand out the pid. */
export function browserRoot(root = process.pid): number {
  for (const pid of tree(root)) {
    try {
      const args = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')
      if (CHROMIUM.test(args[0] ?? '') && !args.some((a) => a.startsWith('--type='))) {
        return pid
      }
    } catch {
      // Gone already.
    }
  }
  throw new Error('no Chromium process under this one')
}

/** Path of the running executable of a process, '' once it is gone. */
export function exeOf(pid: number): string {
  try {
    return readlinkSync(`/proc/${pid}/exe`).replace(DELETED, '')
  } catch {
    return ''
  }
}

/** Name of a process as the kernel holds it, with a Chromium child's --type appended, '?' once it is gone. */
export function roleOf(pid: number): string {
  try {
    const comm = readFileSync(`/proc/${pid}/comm`, 'utf8').trim()
    // A Chromium child names its role (renderer, gpu-process, utility) only on its command line.
    const role = CHILD_TYPE.exec(readFileSync(`/proc/${pid}/cmdline`, 'utf8'))
    return role?.[1] ? `${comm}:${role[1]}` : comm
  } catch {
    return '?'
  }
}

/** MiB of PSS per process role in a tree (a Chromium child's --type, else its command name), biggest first. */
export function byRole(root: number): [string, number][] {
  const roles = new Map<string, number>()
  for (const pid of tree(root)) {
    const role = roleOf(pid)
    roles.set(role, (roles.get(role) ?? 0) + pssKiB(pid) / MIB)
  }
  return [...roles].sort((a, b) => b[1] - a[1])
}

/** MiB of PSS per mapping of one process: its own executable, anonymous memory (a runtime heap and stacks live
 * there), shared libraries and other files. */
export function mappings(pid: number, exe: string): Record<string, number> {
  const out: Record<string, number> = {
    executable: 0,
    anonymous: 0,
    libraries: 0,
    'other files': 0,
  }
  let kind = 'anonymous'
  try {
    for (const line of readFileSync(`/proc/${pid}/smaps`, 'utf8').split('\n')) {
      const head = MAPPING_HEAD.exec(line)
      if (head) {
        const path = (head[1] ?? '').replace(DELETED, '')
        if (path === exe) {
          kind = 'executable'
        } else if (path === '' || path.startsWith('[')) {
          kind = 'anonymous'
        } else {
          kind = SHARED_OBJECT.test(path) ? 'libraries' : 'other files'
        }
        continue
      }
      const pss = PSS_LINE.exec(line)
      if (pss) {
        out[kind] = (out[kind] ?? 0) + Number(pss[1]) / MIB
      }
    }
  } catch {
    // Gone already.
  }
  return out
}

/** Seconds of CPU (user plus system) the process has used, 0 once it is gone. */
export function cpuSeconds(pid: number): number {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    // The command name may hold spaces, so the numeric fields start after its closing parenthesis.
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    return (Number(fields[11]) + Number(fields[12])) / CLOCK_TICKS_PER_S
  } catch {
    return 0
  }
}
