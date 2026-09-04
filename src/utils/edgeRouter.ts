import type { Point } from './edgePath'

/**
 * Orthogonal edge routing (owner, 2026-09-04; design in task 3ed10381 conversation) —
 * the drawio/libavoid family, cut down to what one explicit button needs. Rejected
 * alternatives, for the record: libavoid-WASM (heavy C++ toolchain in an MIT repo),
 * render-time "smart edge" packages (recompute every frame and would overwrite the
 * user's hand-placed anchors — anchors are the user's, routing must be an explicit
 * act), elkjs (reroutes the nodes too; we only want the lines).
 *
 * The output is a waypoints array — exactly what PipeData.waypoints persists and
 * what the user then adjusts by dragging. Routing writes anchors; it never owns them.
 *
 * Sparse orthogonal visibility grid, not per-pixel: candidate coordinates are the
 * margin-inflated edges of every obstacle plus the two endpoints, so a diagram of N
 * nodes yields ~2N+2 lines per axis. A* over (gridpoint, travel direction) with a
 * bend penalty — the penalty is what separates "short but staircased" from "reads
 * like a person routed it".
 *
 * Pure function of geometry. No store, no React Flow — unit-tested headless.
 */

export interface RouteBox {
  x: number
  y: number
  width: number
  height: number
}

export interface RouteOptions {
  /** Clearance kept around obstacles. */
  margin?: number
  /** Extra cost per 90° turn, in flow units of equivalent length. */
  bendPenalty?: number
}

interface InflatedBox { x: number; y: number; w: number; h: number }

/**
 * Route from `start` to `goal` around `obstacles`, both endpoints excluded from the
 * result. Returns the interior bend points ([] = go straight / no route found —
 * callers fall back to automatic smoothstep either way, so failure is never worse
 * than today). Obstacles that CONTAIN an endpoint are dropped from blocking: the
 * endpoints sit on node borders, and a neighbor's inflated halo over a handle must
 * not wall the route in.
 */
export function routeOrthogonal(
  start: Point,
  goal: Point,
  obstacles: RouteBox[],
  options: RouteOptions = {},
): Point[] {
  const margin = options.margin ?? 24
  const bendPenalty = options.bendPenalty ?? 40

  const contains = (b: InflatedBox, p: Point) => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h
  const boxes: InflatedBox[] = obstacles
    .map((b) => ({ x: b.x - margin, y: b.y - margin, w: b.width + 2 * margin, h: b.height + 2 * margin }))
    .filter((b) => !contains(b, start) && !contains(b, goal))

  // A horizontal run at y is blocked when it overlaps a box's OPEN interior —
  // running along an inflated border is allowed, that is what the border is for.
  const hBlocked = (x1: number, x2: number, y: number) =>
    boxes.some((b) => y > b.y && y < b.y + b.h && Math.min(x1, x2) < b.x + b.w && Math.max(x1, x2) > b.x)
  const vBlocked = (x: number, y1: number, y2: number) =>
    boxes.some((b) => x > b.x && x < b.x + b.w && Math.min(y1, y2) < b.y + b.h && Math.max(y1, y2) > b.y)

  const xsSet = new Set<number>([start.x, goal.x])
  const ysSet = new Set<number>([start.y, goal.y])
  for (const b of boxes) {
    xsSet.add(b.x); xsSet.add(b.x + b.w)
    ysSet.add(b.y); ysSet.add(b.y + b.h)
  }
  const xs = [...xsSet].sort((a, b) => a - b)
  const ys = [...ysSet].sort((a, b) => a - b)
  const sx = xs.indexOf(start.x), sy = ys.indexOf(start.y)
  const gx = xs.indexOf(goal.x), gy = ys.indexOf(goal.y)

  // A* over (x-index, y-index, incoming direction). dir: 0 horizontal, 1 vertical,
  // 2 start (no bend charged on the first move).
  const H = ys.length
  const stateKey = (ix: number, iy: number, dir: number) => (ix * H + iy) * 3 + dir
  const gScore = new Map<number, number>()
  const cameFrom = new Map<number, number>()
  const heap: [number, number, number, number, number][] = [] // [f, g, ix, iy, dir]
  const push = (entry: [number, number, number, number, number]) => {
    heap.push(entry)
    let i = heap.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (heap[parent][0] <= heap[i][0]) break
      ;[heap[parent], heap[i]] = [heap[i], heap[parent]]
      i = parent
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length > 0) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = 2 * i + 2
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  const heuristic = (ix: number, iy: number) => Math.abs(xs[ix] - xs[gx]) + Math.abs(ys[iy] - ys[gy])

  const startKey = stateKey(sx, sy, 2)
  gScore.set(startKey, 0)
  push([heuristic(sx, sy), 0, sx, sy, 2])
  let goalState = -1

  while (heap.length > 0) {
    const [, g, ix, iy, dir] = pop()
    const k = stateKey(ix, iy, dir)
    if ((gScore.get(k) ?? Infinity) < g) continue
    if (ix === gx && iy === gy) { goalState = k; break }

    const steps: [number, number, number][] = [
      [ix + 1, iy, 0], [ix - 1, iy, 0], [ix, iy + 1, 1], [ix, iy - 1, 1],
    ]
    for (const [nx, ny, ndir] of steps) {
      if (nx < 0 || ny < 0 || nx >= xs.length || ny >= ys.length) continue
      if (ndir === 0 && hBlocked(xs[ix], xs[nx], ys[iy])) continue
      if (ndir === 1 && vBlocked(xs[ix], ys[iy], ys[ny])) continue
      const stepCost = ndir === 0 ? Math.abs(xs[nx] - xs[ix]) : Math.abs(ys[ny] - ys[iy])
      const ng = g + stepCost + (dir !== 2 && dir !== ndir ? bendPenalty : 0)
      const nk = stateKey(nx, ny, ndir)
      if (ng < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, ng)
        cameFrom.set(nk, k)
        push([ng + heuristic(nx, ny), ng, nx, ny, ndir])
      }
    }
  }

  if (goalState === -1) return []

  // Reconstruct, then drop collinear middles and the two endpoints.
  const path: Point[] = []
  for (let k: number | undefined = goalState; k !== undefined; k = cameFrom.get(k)) {
    const cell = Math.floor(k / 3)
    path.push({ x: xs[Math.floor(cell / H)], y: ys[cell % H] })
    if (k === startKey) break
  }
  path.reverse()

  const simplified: Point[] = []
  for (const p of path) {
    const a = simplified[simplified.length - 2]
    const b = simplified[simplified.length - 1]
    if (a && b && ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))) {
      simplified[simplified.length - 1] = p
    } else if (!b || b.x !== p.x || b.y !== p.y) {
      simplified.push(p)
    }
  }
  return simplified.slice(1, -1).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
}
