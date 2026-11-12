import { expect, test } from 'bun:test'
import { perTen, type Sample } from './meter.ts'

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
