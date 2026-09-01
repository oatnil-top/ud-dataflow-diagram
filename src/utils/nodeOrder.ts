import type { Node } from '@xyflow/react'

/**
 * React Flow's one ordering rule: a parent must appear before its children in
 * the nodes array.
 *
 * It resolves a child's absolute position while walking the array once, looking
 * the parent up in the lookup it has built so far (@xyflow/system
 * `updateChildNode`). A child that arrives first finds no parent, so it gets no
 * absolute position at all — it paints at its parent-relative coordinates as if
 * they were absolute — and React Flow logs
 * "Parent node <id> not found. Please make sure that parent nodes are in front
 * of their child nodes in the nodes array."
 *
 * Every place that writes `parentId` has to restore the invariant. Today that
 * is the document load path (store/importFormats.ts) and the drag-stop
 * drop-into-group path (utils/groupDrop.ts).
 */
export function sortNodesParentsFirst<T extends Node>(nodes: T[]): T[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const depthCache = new Map<string, number>()

  // Memoized so the sort stays O(n log n) instead of walking the parent chain
  // per comparison. `seen` keeps a corrupt document with a parentId cycle from
  // recursing forever — such a cycle has no valid order, so it settles at 0.
  const depthOf = (nodeId: string, seen: Set<string> = new Set()): number => {
    const cached = depthCache.get(nodeId)
    if (cached !== undefined) return cached
    if (seen.has(nodeId)) return 0
    seen.add(nodeId)
    const parentId = byId.get(nodeId)?.parentId
    const depth = parentId ? depthOf(parentId, seen) + 1 : 0
    depthCache.set(nodeId, depth)
    return depth
  }

  // Array#sort is stable, so nodes at the same depth keep their painting order.
  return [...nodes].sort((a, b) => depthOf(a.id) - depthOf(b.id))
}
