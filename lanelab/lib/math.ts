// Small geometry and random helpers. They import only types, so tests run
// them without the game.
import type { Vector } from 'modlock'

export const rad = (degrees: number): number => (degrees * Math.PI) / 180
export const deg = (radians: number): number => (radians * 180) / Math.PI
export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v))
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const between = (lo: number, hi: number): number =>
  lo + Math.random() * (hi - lo)
export const pick = <T,>(items: readonly T[]): T =>
  items[Math.floor(Math.random() * items.length)] as T

/** wrap folds an angle in degrees into -180 to 180. */
export function wrap(degrees: number): number {
  let d = degrees % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

/**
 * polar places a point relative to an origin that faces yaw: forward along
 * the yaw, left a quarter turn counterclockwise from it.
 */
export function polar(
  origin: Vector,
  yaw: number,
  forward: number,
  left: number,
  up = 0,
): Vector {
  const r = rad(yaw)
  const fx = Math.cos(r), fy = Math.sin(r)
  return {
    x: origin.x + fx * forward - fy * left,
    y: origin.y + fy * forward + fx * left,
    z: origin.z + up,
  }
}

export function dist2d(a: Vector, b: Vector): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function speed2d(v: Vector): number {
  return Math.hypot(v.x, v.y)
}

/** bearing is where to lies relative to a viewer facing yaw: positive is left. */
export function bearing(from: Vector, yaw: number, to: Vector): number {
  return wrap(deg(Math.atan2(to.y - from.y, to.x - from.x)) - yaw)
}

/** arrow draws a bearing as plain text, since fonts differ between clients. */
export function arrow(relative: number): string {
  const a = Math.abs(relative)
  if (a < 12) return '^ AHEAD ^'
  if (a > 150) return 'v BEHIND v'
  const side = relative > 0 ? '<' : '>'
  if (a < 45) return side.repeat(1) + ' ' + (relative > 0 ? 'LEFT' : 'RIGHT')
  return side.repeat(3) + ' ' + (relative > 0 ? 'LEFT' : 'RIGHT')
}

/** yawOf is the yaw in degrees from one point to another. */
export function yawOf(from: Vector, to: Vector): number {
  return deg(Math.atan2(to.y - from.y, to.x - from.x))
}
