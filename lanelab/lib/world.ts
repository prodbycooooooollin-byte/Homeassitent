// Helpers that read the map through trace.
import { trace, type Vector } from 'modlock'

/** groundAt drops a point onto the floor below it, or returns undefined. */
export function groundAt(p: Vector): Vector | undefined {
  const hit = trace({
    start: { x: p.x, y: p.y, z: p.z + 400 },
    end: { x: p.x, y: p.y, z: p.z - 900 },
  })
  if (!hit || hit.startSolid) return undefined
  return { x: p.x, y: p.y, z: hit.position.z }
}

/** clearBetween reports whether nothing solid lies between two spots at chest height. */
export function clearBetween(a: Vector, b: Vector, up = 70): boolean {
  const hit = trace({
    start: { x: a.x, y: a.y, z: a.z + up },
    end: { x: b.x, y: b.y, z: b.z + up },
  })
  return hit === undefined
}
