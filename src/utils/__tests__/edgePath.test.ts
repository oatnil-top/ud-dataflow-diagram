// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildWaypointPath, polylineMidpoint, segmentMidpoints } from '../edgePath'

/**
 * Route-anchor geometry (owner 2026-09-04). Pure functions — what matters is that
 * the path really passes the anchors, corners never overshoot short segments, and
 * the label lands halfway along the route the user drew.
 */

describe('buildWaypointPath', () => {
  it('threads every anchor: each interior point appears as a Q control point', () => {
    const d = buildWaypointPath([
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 },
    ])
    expect(d.startsWith('M 0 0')).toBe(true)
    expect(d).toContain('Q 100 0')
    expect(d).toContain('Q 100 100')
    expect(d.endsWith('L 200 100')).toBe(true)
  })

  it('a corner between short segments clamps its radius instead of overshooting', () => {
    // Segments of length 6: radius clamps to 3, so the L before the corner sits
    // 3px from it, never past the segment start
    const d = buildWaypointPath([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }], 8)
    expect(d).toContain('L 3 0')
    expect(d).toContain('Q 6 0 6 3')
  })

  it('coincident points do not produce NaN', () => {
    const d = buildWaypointPath([{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 10, y: 5 }])
    expect(d).not.toContain('NaN')
  })
})

describe('polylineMidpoint / segmentMidpoints', () => {
  it('midpoint is halfway by ARC length, not the middle point of the list', () => {
    // 100 + 300 total: half = 200 → 100 into the second segment
    const mid = polylineMidpoint([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 400, y: 0 }])
    expect(mid).toEqual({ x: 200, y: 0 })
  })

  it('segment midpoints sit between consecutive points', () => {
    expect(segmentMidpoints([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }])).toEqual([
      { x: 50, y: 0 }, { x: 100, y: 25 },
    ])
  })
})
