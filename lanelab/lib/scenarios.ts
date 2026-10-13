// Aim Range scenarios. A scenario says how many targets stand, where they
// appear in front of the shooter and how they move. Everything here is pure
// so tests can check it without the game.
import { between, clamp, rad } from './math'

export type Motion = 'still' | 'strafe' | 'flick' | 'track'

export interface Scenario {
  id: string
  name: string
  blurb: string
  targets: number
  motion: Motion
  /** headOnly makes body shots count for nothing. */
  headOnly: boolean
  /** base and head are the points of a body hit and a head hit. */
  base: number
  head: number
  near: number
  far: number
  /** arc is how far to either side of the aim, in degrees, targets stand. */
  arc: number
  /** speed bounds a moving target's sideways speed, in units per second. */
  speed: readonly [number, number]
  /** ttl is how long a flick target lives before it moves, or zero. */
  ttl: number
  /** window is the combo window in seconds. */
  window: number
}

const base = {
  headOnly: false, base: 100, head: 180, near: 500, far: 900, arc: 35,
  speed: [0, 0] as const, ttl: 0, window: 2.2,
}

export const SCENARIOS: readonly Scenario[] = [
  { ...base, id: 'click', name: 'Clicking', targets: 3, motion: 'still',
    blurb: 'Three still targets. Hit one and it jumps. Pure click speed.' },
  { ...base, id: 'head', name: 'Headline', targets: 3, motion: 'still', headOnly: true, head: 220,
    blurb: 'Only head shots count. Body shots score nothing.' },
  { ...base, id: 'strafe', name: 'Strafe Flick', targets: 2, motion: 'strafe', speed: [140, 260], base: 120, head: 220,
    blurb: 'Two targets strafe and reverse. Lead them, then click.' },
  { ...base, id: 'flick', name: 'Reflex Flick', targets: 1, motion: 'flick', ttl: 1.3, arc: 75, near: 450, far: 800, base: 140, head: 240,
    blurb: 'One target flashes at a wide angle and vanishes fast.' },
  { ...base, id: 'switch', name: 'Target Switch', targets: 5, motion: 'still', arc: 55, window: 1.4, base: 90, head: 160,
    blurb: 'Five targets. Chain hits quickly to keep the combo alive.' },
  { ...base, id: 'track', name: 'Tracking', targets: 1, motion: 'track', near: 650, far: 900, base: 12, head: 20, window: 0.5,
    blurb: 'A target glides on a curve. Hold your crosshair on it.' },
  { ...base, id: 'long', name: 'Long Shots', targets: 3, motion: 'still', near: 1300, far: 2200, arc: 25, base: 160, head: 300,
    blurb: 'Far targets. Patience and recoil control.' },
]

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id)
}

/** TargetState is one target's place in the shooter's frame: forward and left. */
export interface TargetState {
  f: number
  l: number
  /** vl is the sideways speed of a strafing target; the sign is the way. */
  vl: number
  flipAt: number
  bornAt: number
  /** phase offsets a tracking target's curve. */
  phase: number
}

/** limit is how far left or right a target at forward distance f may stand. */
export function limit(s: Scenario, f: number): number {
  return f * Math.tan(rad(s.arc))
}

export function spawn(s: Scenario, now: number, index = 0): TargetState {
  const f = between(s.near, s.far)
  const l = between(-limit(s, f), limit(s, f))
  const dir = Math.random() < 0.5 ? -1 : 1
  return {
    f, l, vl: between(s.speed[0], s.speed[1]) * dir,
    flipAt: now + between(0.4, 1.2), bornAt: now, phase: index * 2.1 + Math.random() * 6,
  }
}

/** respawnAway picks a new spot that is not too close to the old one. */
export function respawnAway(s: Scenario, now: number, old: TargetState, index = 0): TargetState {
  let next = spawn(s, now, index)
  for (let i = 0; i < 8; i++) {
    if (Math.hypot(next.f - old.f, next.l - old.l) > 220) break
    next = spawn(s, now, index)
  }
  return next
}

/** step moves one target by dt seconds at game time now. */
export function step(s: Scenario, t: TargetState, now: number, dt: number): void {
  if (s.motion === 'strafe') {
    t.l += t.vl * dt
    const max = limit(s, t.f)
    if (t.l > max) { t.l = max; t.vl = -Math.abs(t.vl) }
    if (t.l < -max) { t.l = -max; t.vl = Math.abs(t.vl) }
    if (now >= t.flipAt) {
      t.vl = -Math.sign(t.vl || 1) * between(s.speed[0], s.speed[1])
      t.flipAt = now + between(0.4, 1.2)
    }
  } else if (s.motion === 'track') {
    const tau = now - t.bornAt
    const mid = (s.near + s.far) / 2
    t.f = mid + 120 * Math.sin(0.65 * tau + t.phase)
    t.l = clamp(260 * Math.sin(1.05 * tau + t.phase * 0.7) + 90 * Math.sin(2.3 * tau), -limit(s, t.f), limit(s, t.f))
  }
}

export function expired(s: Scenario, t: TargetState, now: number): boolean {
  return s.motion === 'flick' && s.ttl > 0 && now - t.bornAt > s.ttl
}
