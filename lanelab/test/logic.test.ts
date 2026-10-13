import { describe, expect, test } from 'bun:test'

import { Combo } from '../lib/combo'
import { clock, stopwatch } from '../lib/format'
import { arrow, bearing, polar, wrap } from '../lib/math'
import { SCENARIOS, expired, limit, respawnAway, spawn, step } from '../lib/scenarios'

describe('math', () => {
  test('wrap folds angles', () => {
    expect(wrap(190)).toBe(-170)
    expect(wrap(-190)).toBe(170)
    expect(wrap(30)).toBe(30)
  })
  test('polar forward and left', () => {
    const p = polar({ x: 0, y: 0, z: 5 }, 90, 100, 10)
    expect(p.x).toBeCloseTo(-10)
    expect(p.y).toBeCloseTo(100)
    expect(p.z).toBe(5)
  })
  test('bearing positive is left', () => {
    expect(bearing({ x: 0, y: 0, z: 0 }, 0, { x: 0, y: 10, z: 0 })).toBeCloseTo(90)
    expect(arrow(90)).toContain('LEFT')
    expect(arrow(-90)).toContain('RIGHT')
    expect(arrow(0)).toContain('AHEAD')
  })
})

describe('format', () => {
  test('clock and stopwatch', () => {
    expect(clock(61)).toBe('1:01')
    expect(clock(-3)).toBe('0:00')
    expect(stopwatch(75.5)).toBe('1:15.50')
    expect(stopwatch(9.056)).toBe('0:09.06')
  })
})

describe('combo', () => {
  test('streak raises multiplier and lapses', () => {
    const c = new Combo(2, 0.1, 10)
    expect(c.hit(100, false, 0)).toBe(100)
    expect(c.hit(100, true, 1)).toBe(110)
    expect(c.heads).toBe(1)
    expect(c.hit(100, false, 5)).toBe(100)
    expect(c.bestStreak).toBe(2)
    c.drop()
    expect(c.multiplier()).toBe(1)
  })
  test('cap', () => {
    const c = new Combo(2, 0.1, 3)
    for (let i = 0; i < 20; i++) c.hit(100, false, i * 0.1)
    expect(c.multiplier()).toBeCloseTo(1.3)
  })
})

describe('scenarios', () => {
  test('spawn stays in arc and distance', () => {
    for (const s of SCENARIOS) {
      for (let i = 0; i < 200; i++) {
        const t = spawn(s, 0, i)
        expect(t.f).toBeGreaterThanOrEqual(s.near)
        expect(t.f).toBeLessThanOrEqual(s.far)
        expect(Math.abs(t.l)).toBeLessThanOrEqual(limit(s, t.f) + 1e-6)
      }
    }
  })
  test('strafe stays inside arc over time', () => {
    const s = SCENARIOS.find((x) => x.id === 'strafe')!
    const t = spawn(s, 0)
    for (let i = 0; i < 2000; i++) {
      step(s, t, i * 0.016, 0.016)
      expect(Math.abs(t.l)).toBeLessThanOrEqual(limit(s, t.f) + 1e-6)
    }
  })
  test('track stays inside arc', () => {
    const s = SCENARIOS.find((x) => x.id === 'track')!
    const t = spawn(s, 0)
    for (let i = 0; i < 4000; i++) {
      step(s, t, i * 0.016, 0.016)
      expect(Math.abs(t.l)).toBeLessThanOrEqual(limit(s, t.f) + 1e-6)
      expect(t.f).toBeGreaterThan(s.near - 200)
    }
  })
  test('flick expires, others do not', () => {
    const f = SCENARIOS.find((x) => x.id === 'flick')!
    const t = spawn(f, 0)
    expect(expired(f, t, 1)).toBe(false)
    expect(expired(f, t, 2)).toBe(true)
    const c = SCENARIOS.find((x) => x.id === 'click')!
    expect(expired(c, spawn(c, 0), 99)).toBe(false)
  })
  test('respawnAway moves the target', () => {
    const s = SCENARIOS[0]!
    const old = spawn(s, 0)
    let far = 0
    for (let i = 0; i < 50; i++) {
      const n = respawnAway(s, 0, old)
      if (Math.hypot(n.f - old.f, n.l - old.l) > 100) far++
    }
    expect(far).toBeGreaterThan(40)
  })
})
