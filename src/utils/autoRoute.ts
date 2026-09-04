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

export interface PipeRoute {
  waypoints: Point[]
  /** Present only when that end's handle was reassigned (see routePipe). */
  sourceHandle?: string
  targetHandle?: string
}

/** A field-anchored end (output-/input-<field>) carries SEMANTICS — never reassigned. */
const isFieldHandle = (h: string | null | undefined) =>
  Boolean(h && (h.startsWith('output-') || h.startsWith('input-')))

const nodeCenter = (n: InternalNode) => ({
  x: n.internals.positionAbsolute.x + (n.measured?.width ?? 0) / 2,
  y: n.internals.positionAbsolute.y + (n.measured?.height ?? 0) / 2,
})

/** The perimeter handle id (node-*) on `from`'s side facing `to`. */
const facingHandleId = (from: Point, to: Point): string => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  return Math.abs(dx) >= Math.abs(dy)
    ? (dx >= 0 ? 'node-right' : 'node-left')
    : (dy >= 0 ? 'node-bottom' : 'node-top')
}

const hasHandle = (node: InternalNode, id: string) =>
  [...(node.internals.handleBounds?.source ?? []), ...(node.internals.handleBounds?.target ?? [])]
    .some((h) => h.id === id)

/**
 * Route one pipe, or null when geometry is missing (unmeasured first frame,
 * unknown endpoint). An EMPTY waypoints array is a real answer — "go straight" —
 * and callers store it as `undefined` so the document does not carry [].
 *
 * Routing also REARRANGES the endpoint handles (owner, 2026-09-04): each free end
 * moves to the perimeter handle facing the other node, so the route leaves and
 * arrives on the sides it actually travels — routing to mid-corridor while still
 * exiting the back of the node would undo the point of it. Two ends are never
 * touched: a field-anchored handle (its id IS the field reference), and a node
 * that does not carry the node-* perimeter handles.
 */
export function routePipe(
  nodeLookup: Map<string, InternalNode>,
  pipe: RoutablePipe,
): PipeRoute | null {
  const src = nodeLookup.get(pipe.source)
  const tgt = nodeLookup.get(pipe.target)
  if (!src || !tgt) return null

  const srcCenter = nodeCenter(src)
  const tgtCenter = nodeCenter(tgt)
  const wantSource = facingHandleId(srcCenter, tgtCenter)
  const wantTarget = facingHandleId(tgtCenter, srcCenter)
  const sourceHandle = !isFieldHandle(pipe.sourceHandle) && hasHandle(src, wantSource) && pipe.sourceHandle !== wantSource
    ? wantSource
    : undefined
  const targetHandle = !isFieldHandle(pipe.targetHandle) && hasHandle(tgt, wantTarget) && pipe.targetHandle !== wantTarget
    ? wantTarget
    : undefined

  const s = handleCenter(src, sourceHandle ?? pipe.sourceHandle)
  const g = handleCenter(tgt, targetHandle ?? pipe.targetHandle)
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
  const waypoints = routeOrthogonal({ x: s.x, y: s.y }, { x: g.x, y: g.y }, obstacles)
  return {
    waypoints,
    ...(sourceHandle ? { sourceHandle } : {}),
    ...(targetHandle ? { targetHandle } : {}),
  }
}
