import type { InternalNode } from '@xyflow/react'
import { routeOrthogonal, type RouteBox } from './edgeRouter'
import type { Point } from './edgePath'

/**
 * Bridge between React Flow's runtime geometry and the pure router
 * (utils/edgeRouter.ts): real handle centers as endpoints, every measured node
 * except the pipe's two terminals and their ancestor groups as obstacles (a route
 * out of a group must not treat its own group as a wall). Shared by the pipe
 * menu's single-edge button and the selection bar's batch button, so the two
 * entries cannot route differently.
 */

/**
 * Absolute flow position of a handle's center. With ConnectionMode.Loose the
 * perimeter handles are all type=source, so a pipe's targetHandle may only be
 * found in the source list — search both.
 */
export function handleCenter(node: InternalNode, handleId: string | null | undefined) {
  const all = [
    ...(node.internals.handleBounds?.source ?? []),
    ...(node.internals.handleBounds?.target ?? []),
  ]
  if (all.length === 0) return null
  const h = (handleId ? all.find((hb) => hb.id === handleId) : undefined) ?? all[0]
  return {
    x: node.internals.positionAbsolute.x + h.x + h.width / 2,
    y: node.internals.positionAbsolute.y + h.y + h.height / 2,
    position: h.position,
  }
}

export interface RoutablePipe {
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

/**
 * Waypoints for one pipe, or null when geometry is missing (unmeasured first
 * frame, unknown endpoint). An EMPTY array is a real answer — "go straight" —
 * and callers store it as `undefined` so the document does not carry [].
 */
export function routePipeWaypoints(
  nodeLookup: Map<string, InternalNode>,
  pipe: RoutablePipe,
): Point[] | null {
  const src = nodeLookup.get(pipe.source)
  const tgt = nodeLookup.get(pipe.target)
  if (!src || !tgt) return null
  const s = handleCenter(src, pipe.sourceHandle)
  const g = handleCenter(tgt, pipe.targetHandle)
  if (!s || !g) return null

  const skip = new Set<string>()
  for (const terminal of [src, tgt]) {
    let cur: InternalNode | undefined = terminal
    while (cur) {
      skip.add(cur.id)
      cur = cur.parentId ? nodeLookup.get(cur.parentId) : undefined
    }
  }
  const obstacles: RouteBox[] = []
  for (const [nid, n] of nodeLookup) {
    if (skip.has(nid)) continue
    const w = n.measured?.width
    const h = n.measured?.height
    if (typeof w !== 'number' || typeof h !== 'number') continue
    obstacles.push({
      x: n.internals.positionAbsolute.x,
      y: n.internals.positionAbsolute.y,
      width: w,
      height: h,
    })
  }
  return routeOrthogonal({ x: s.x, y: s.y }, { x: g.x, y: g.y }, obstacles)
}
