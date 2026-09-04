/**
 * Path geometry for pipes with user-placed waypoints (owner, 2026-09-04: anchors
 * that control an edge's route, persisted with the document).
 *
 * A pipe WITHOUT waypoints keeps React Flow's smoothstep routing (DataflowEdge.tsx);
 * the moment it has anchors, the route becomes the user's: straight segments through
 * every anchor with rounded corners. Straight, not re-smoothstepped — an anchor is a
 * statement about where the line should bend, and orthogonal re-routing between
 * anchors would move the bend away from where it was put.
 *
 * Pure functions of points, unit-tested without a canvas.
 */

export interface Point {
  x: number
  y: number
}

/**
 * SVG path through all points (endpoints included) with corners rounded by `radius`,
 * clamped to half of each adjoining segment so short segments never overshoot.
 */
export function buildWaypointPath(points: Point[], radius = 8): string {
  if (points.length < 2) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const p = points[i]
    const next = points[i + 1]
    const d1 = Math.hypot(p.x - prev.x, p.y - prev.y)
    const d2 = Math.hypot(next.x - p.x, next.y - p.y)
    const r = Math.min(radius, d1 / 2, d2 / 2)
    if (r < 0.5 || d1 === 0 || d2 === 0) {
      d += ` L ${p.x} ${p.y}`
      continue
    }
    const a = { x: p.x + ((prev.x - p.x) / d1) * r, y: p.y + ((prev.y - p.y) / d1) * r }
    const b = { x: p.x + ((next.x - p.x) / d2) * r, y: p.y + ((next.y - p.y) / d2) * r }
    d += ` L ${a.x} ${a.y} Q ${p.x} ${p.y} ${b.x} ${b.y}`
  }
  const last = points[points.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

/** The point halfway along the polyline (by arc length) — the label's anchor. */
export function polylineMidpoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return points[0]
  const lengths: number[] = []
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const l = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    lengths.push(l)
    total += l
  }
  if (total === 0) return points[0]
  let remaining = total / 2
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const t = lengths[i] === 0 ? 0 : remaining / lengths[i]
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      }
    }
    remaining -= lengths[i]
  }
  return points[points.length - 1]
}

/** Midpoint of each straight segment — where the "add an anchor" handles sit. */
export function segmentMidpoints(points: Point[]): Point[] {
  const mids: Point[] = []
  for (let i = 1; i < points.length; i++) {
    mids.push({ x: (points[i - 1].x + points[i].x) / 2, y: (points[i - 1].y + points[i].y) / 2 })
  }
  return mids
}
