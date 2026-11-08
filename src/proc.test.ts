import { describe, expect, test } from 'bun:test'
import process from 'node:process'
import { byRole, cpuSeconds, exeOf, mappings, pssKiB, roleOf, tree } from './proc.ts'

const linux = process.platform === 'linux'
const gone = 2 ** 22

describe.skipIf(!linux)('proc', () => {
  test('tree holds the root', () => {
    expect(tree(process.pid)).toContain(process.pid)
  })

  test('pssKiB reads a live process and answers 0 for a gone one', () => {
    expect(pssKiB(process.pid)).toBeGreaterThan(0)
    expect(pssKiB(gone)).toBe(0)
  })

  test('cpuSeconds never goes negative', () => {
    expect(cpuSeconds(process.pid)).toBeGreaterThanOrEqual(0)
    expect(cpuSeconds(gone)).toBe(0)
  })

  test('mappings splits a process into the four kinds', () => {
    expect(
      Object.keys(mappings(process.pid, process.execPath)).sort((a, b) => a.localeCompare(b)),
    ).toEqual(['anonymous', 'executable', 'libraries', 'other files'])
  })

  test('exeOf names the running executable', () => {
    expect(exeOf(process.pid)).toBe(process.execPath)
    expect(exeOf(gone)).toBe('')
  })

  test('roleOf names a live process and marks a gone one', () => {
    expect(roleOf(process.pid)).not.toBe('')
    expect(roleOf(gone)).toBe('?')
  })

  test('byRole totals a tree by role, biggest first', () => {
    const mibs = byRole(process.pid).map(([, mib]) => mib)
    expect(mibs.length).toBeGreaterThan(0)
    expect(mibs).toEqual([...mibs].sort((a, b) => b - a))
  })
})
