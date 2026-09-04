// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { routeOrthogonal, type RouteBox } from '../edgeRouter'
import type { Point } from '../edgePath'

/**
 * The orthogonal router (owner 2026-09-04). What matters: routes never cut through
 * an obstacle's clearance zone, the bend penalty keeps paths simple, straight lines
 * stay straight, and a walled-in endpoint drops the wall instead of failing.
 */

const MARGIN = 24

/** Every consecutive segment (endpoints included) must avoid each box's open interior. */
function assertAvoids(start: Point, goal: Point, waypoints: Point[], obstacles: RouteBox[]) {
  const pts = [start, ...waypoints, goal]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    for (const o of obstacles) {
      const bx = o.x - MARGIN, by = o.y - MARGIN, bw = o.width + 2 * MARGIN, bh = o.height + 2 * MARGIN
      if (a.y === b.y) {
        const crosses = a.y > by && a.y < by + bh && Math.min(a.x, b.x) < bx + bw && Math.max(a.x, b.x) > bx
        expect(crosses, `h-segment ${JSON.stringify([a, b])} crosses ${JSON.stringify(o)}`).toBe(false)
      } else {
        const crosses = a.x > bx && a.x < bx + bw && Math.min(a.y, b.y) < by + bh && Math.max(a.y, b.y) > by
        expect(crosses, `v-segment ${JSON.stringify([a, b])} crosses ${JSON.stringify(o)}`).toBe(false)
      }
    }
  }
}

describe('routeOrthogonal', () => {
  it('aligned endpoints with a clear path need no waypoints', () => {
    expect(routeOrthogonal({ x: 0, y: 50 }, { x: 300, y: 50 }, [])).toEqual([])
  })

  it('an offset pair forks at the corridor midline, like smoothstep does (owner 2026-09-04)', () => {
    const wps = routeOrthogonal({ x: 0, y: 0 }, { x: 100, y: 80 }, [])
    expect(wps).toEqual([{ x: 50, y: 0 }, { x: 50, y: 80 }])
  })

  it('a fan-out forks mid-corridor, not at the source column — verticals must not stack on the source', () => {
    // One gateway at x=0, two targets far right at different heights (the
    // screenshot that prompted midForkWeight)
    const up = routeOrthogonal({ x: 0, y: 300 }, { x: 800, y: 0 }, [])
    const down = routeOrthogonal({ x: 0, y: 300 }, { x: 800, y: 600 }, [])
    for (const wps of [up, down]) {
      expect(wps.length).toBeGreaterThan(0)
      for (const p of wps) {
        // Every bend sits in the middle half of the corridor
        expect(p.x).toBeGreaterThan(200)
        expect(p.x).toBeLessThan(600)
      }
    }
  })

  it('a box in the way is routed around, clearing its margin the whole way', () => {
    const start = { x: 0, y: 100 }
    const goal = { x: 500, y: 100 }
    const wall: RouteBox[] = [{ x: 200, y: 40, width: 100, height: 120 }]
    const wps = routeOrthogonal(start, goal, wall)
    expect(wps.length).toBeGreaterThan(0)
    assertAvoids(start, goal, wps, wall)
  })

  it('an obstacle whose halo swallows an endpoint stops blocking — the route escapes', () => {
    // The neighbor sits 10px from the start point; its 24px margin contains it
    const start = { x: 0, y: 0 }
    const goal = { x: 400, y: 0 }
    const neighbor: RouteBox[] = [{ x: -60, y: 10, width: 50, height: 50 }]
    const wps = routeOrthogonal(start, goal, neighbor)
    // Straight shot is clear of the dropped box — no detour required
    expect(wps).toEqual([])
  })

  it('waypoints are integers', () => {
    const wps = routeOrthogonal({ x: 0.4, y: 0.6 }, { x: 99.7, y: 80.2 }, [])
    for (const p of wps) {
      expect(Number.isInteger(p.x)).toBe(true)
      expect(Number.isInteger(p.y)).toBe(true)
    }
  })
})
