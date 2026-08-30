import type { Node } from '@xyflow/react'

export interface GroupDropUpdate {
  parentId: string | undefined
  position: { x: number; y: number }
  clearExtent?: boolean
}

/**
 * Pure drop-into/out-of-group computation for a drag-stop.
 * Given all current nodes and the nodes that were dragged (whose positions
 * React Flow has already updated), returns the parentId/position changes to
 * apply, keyed by node id. Nodes with no change are omitted.
 *
 * When multiple nodes are selected, React Flow passes all dragged nodes.
 */
export function computeGroupDropUpdates(
  allNodes: Node[],
  draggedNodes: Node[],
): Map<string, GroupDropUpdate> {
  const groups = allNodes.filter((n) => n.type === 'group')
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]))

  // Recursive absolute position — walks full parentId chain
  function absPos(nodeId: string): { x: number; y: number } {
    const node = nodeMap.get(nodeId)
    if (!node) return { x: 0, y: 0 }
    if (node.parentId) {
      const pp = absPos(node.parentId)
      return { x: pp.x + node.position.x, y: pp.y + node.position.y }
    }
    return node.position
  }

  // Check if ancestorId is an ancestor of nodeId (prevents circular nesting)
  function isDescendant(ancestorId: string, nodeId: string): boolean {
    let current = nodeMap.get(nodeId)
    while (current?.parentId) {
      if (current.parentId === ancestorId) return true
      current = nodeMap.get(current.parentId)
    }
    return false
  }

  // Build a map of node updates: nodeId → { parentId, position }
  const updates = new Map<string, GroupDropUpdate>()

  // Build a map of dragged node positions (these have the updated position from React Flow)
  const draggedMap = new Map(draggedNodes.map(n => [n.id, n]))

  for (const draggedNode of draggedNodes) {
    // Use the dragged node's current position (which React Flow has updated)
    // For abs position: if it has a parent, add parent's abs position
    let abs: { x: number; y: number }
    if (draggedNode.parentId) {
      const parentAbs = absPos(draggedNode.parentId)
      abs = { x: parentAbs.x + draggedNode.position.x, y: parentAbs.y + draggedNode.position.y }
    } else {
      abs = draggedNode.position
    }

    // Find candidate groups at this absolute position, excluding self and descendants
    const candidates = groups.filter((g) => {
      if (g.id === draggedNode.id) return false // Can't drop into self
      if (draggedMap.has(g.id)) return false // Skip groups that are also being dragged
      // For groups: prevent circular nesting
      if (draggedNode.type === 'group' && isDescendant(draggedNode.id, g.id)) return false
      const gAbs = absPos(g.id)
      const gw = (g.measured?.width ?? g.width ?? (g.style as Record<string, number>)?.width ?? 400)
      const gh = (g.measured?.height ?? g.height ?? (g.style as Record<string, number>)?.height ?? 300)
      return abs.x >= gAbs.x && abs.x <= gAbs.x + gw
          && abs.y >= gAbs.y && abs.y <= gAbs.y + gh
    })

    // Pick the innermost (smallest area) group as drop target
    const targetGroup = candidates.length > 0
      ? candidates.reduce((best, g) => {
          const bw = best.measured?.width ?? best.width ?? (best.style as Record<string, number>)?.width ?? 400
          const bh = best.measured?.height ?? best.height ?? (best.style as Record<string, number>)?.height ?? 300
          const gw = g.measured?.width ?? g.width ?? (g.style as Record<string, number>)?.width ?? 400
          const gh = g.measured?.height ?? g.height ?? (g.style as Record<string, number>)?.height ?? 300
          return (gw * gh) < (bw * bh) ? g : best
        })
      : undefined

    const currentParent = draggedNode.parentId
    const targetParentId = targetGroup?.id

    if (currentParent === targetParentId) continue // No change for this node

    if (targetParentId) {
      // Moving into a group: convert absolute → relative to target group's absolute pos
      const targetAbs = absPos(targetParentId)
      updates.set(draggedNode.id, {
        parentId: targetParentId,
        position: {
          x: abs.x - targetAbs.x,
          y: abs.y - targetAbs.y,
        },
      })
    } else {
      // Moving out of a group: use absolute position
      updates.set(draggedNode.id, {
        parentId: undefined,
        position: { x: abs.x, y: abs.y },
        clearExtent: true,
      })
    }
  }

  return updates
}
