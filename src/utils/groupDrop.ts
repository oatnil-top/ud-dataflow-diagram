import type { Node } from '@xyflow/react'
import { sortNodesParentsFirst } from './nodeOrder'

/**
 * A group's frame in flow units, with the same fallback chain the drop test has always
 * used. `measured` is React Flow's own measurement of the rendered element, which is what
 * makes a COLLAPSED group read as its ~150x28 chip: `stripSizeWhenCollapsed` deletes the
 * persisted width/height at the render boundary, so the chip is all there is left to
 * measure.
 */
function groupFrame(g: Node): { w: number; h: number } {
  return {
    w: g.measured?.width ?? g.width ?? (g.style as Record<string, number>)?.width ?? 400,
    h: g.measured?.height ?? g.height ?? (g.style as Record<string, number>)?.height ?? 300,
  }
}

/** Is this group folded to a chip? The one bit `applyCollapsedGroups` acts on. */
function isCollapsed(g: Node): boolean {
  return (g.data as { collapsed?: boolean } | undefined)?.collapsed === true
}

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
      // A folded group takes nothing in (card 1cb78460). Until this line the exclusion was
      // an accident of arithmetic, not a rule: the test below is "is the dragged node's
      // TOP-LEFT inside the group's frame", and a collapsed group's frame is its ~150x28
      // chip, which is smaller than the node you are dragging — so covering the chip puts
      // your top-left above and left of it and the test fails. Land the corner ON the chip
      // instead (with snapToGrid at 15px, roughly 9 columns by 2 rows) and the node WAS
      // adopted: it became a descendant of a collapsed group, `applyCollapsedGroups`
      // stamped it `hidden`, and it vanished from the canvas with nothing to say so but
      // the chip's count going up by one. Refusing outright is also the honest half of the
      // chip's new rejected state — a chip that says "no" while a precise drop still says
      // "yes" would be worse than the silence it replaces. ⛔ Adopting into a folded group
      // is a FEATURE (it needs an unfold-on-drop or a reveal), not this fix.
      if (isCollapsed(g)) return false
      const gAbs = absPos(g.id)
      const { w: gw, h: gh } = groupFrame(g)
      return abs.x >= gAbs.x && abs.x <= gAbs.x + gw
          && abs.y >= gAbs.y && abs.y <= gAbs.y + gh
    })

    // Pick the innermost (smallest area) group as drop target
    const targetGroup = candidates.length > 0
      ? candidates.reduce((best, g) => {
          const b = groupFrame(best)
          const c = groupFrame(g)
          return (c.w * c.h) < (b.w * b.h) ? g : best
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

/**
 * The folded group a drag is currently over, or null — the chip's "you cannot put anything
 * in here" state (card 1cb78460). Pure, and called on every drag frame, so it returns early
 * on the common diagram that has no folded group at all.
 *
 * ## Why OVERLAP here and CORNER in the drop test above
 * They answer different questions and neither can borrow the other's predicate:
 *
 * - The drop test asks "where does this node BELONG", and React Flow's own answer for a
 *   node is its top-left corner. That is long-standing behaviour for expanded groups and
 *   this card does not touch it.
 * - The chip asks "does the user think they are putting something in me". They think so as
 *   soon as the node they are dragging covers the chip — which is exactly the reported
 *   gesture, and its corner is then ABOVE and LEFT of the chip, matching no corner test.
 *   Answering with the corner test would light the chip up almost never, on the one
 *   gesture the card was filed about.
 *
 * The two cannot contradict each other, because the guard above refuses EVERY folded
 * group: overlap is a strict superset of the corner case, and on all of it the chip's
 * claim ("this will not adopt your node") is true.
 */
export function findDropRejectingGroup(allNodes: Node[], draggedNodes: Node[]): string | null {
  const collapsed = allNodes.filter((n) => n.type === 'group' && isCollapsed(n))
  if (collapsed.length === 0 || draggedNodes.length === 0) return null

  const nodeMap = new Map(allNodes.map((n) => [n.id, n]))
  function absPos(nodeId: string): { x: number; y: number } {
    const node = nodeMap.get(nodeId)
    if (!node) return { x: 0, y: 0 }
    if (node.parentId) {
      const pp = absPos(node.parentId)
      return { x: pp.x + node.position.x, y: pp.y + node.position.y }
    }
    return node.position
  }
  const draggedIds = new Set(draggedNodes.map((n) => n.id))

  for (const g of collapsed) {
    if (draggedIds.has(g.id)) continue // a folded group being dragged does not reject itself
    const gAbs = absPos(g.id)
    const { w: gw, h: gh } = groupFrame(g)
    for (const dragged of draggedNodes) {
      const abs = dragged.parentId
        ? (() => {
            const p = absPos(dragged.parentId!)
            return { x: p.x + dragged.position.x, y: p.y + dragged.position.y }
          })()
        : dragged.position
      const { w: dw, h: dh } = { w: dragged.measured?.width ?? 0, h: dragged.measured?.height ?? 0 }
      const overlaps =
        abs.x < gAbs.x + gw && abs.x + dw > gAbs.x && abs.y < gAbs.y + gh && abs.y + dh > gAbs.y
      if (overlaps) return g.id
    }
  }
  return null
}

/**
 * Apply the drop updates to the nodes array, parents first.
 *
 * Writing `parentId` is only half the move: React Flow also needs the parent to
 * sit ahead of the child in the array (see utils/nodeOrder.ts). `addGroupNode`
 * prepends, so the newer of two groups is always at a lower index — dropping it
 * into an older group put the child in front of its parent every time, and the
 * nested group painted at its parent-relative coordinates as if they were
 * absolute. The relationship itself was stored correctly, so a reload — which
 * sorts on the way in — showed it in the right place, which is what made the
 * bug look like it came and went.
 */
export function applyGroupDropUpdates<T extends Node>(
  nodes: T[],
  updates: Map<string, GroupDropUpdate>,
): T[] {
  if (updates.size === 0) return nodes
  const next = nodes.map((n) => {
    const update = updates.get(n.id)
    if (!update) return n
    return {
      ...n,
      parentId: update.parentId,
      position: update.position,
      ...(update.clearExtent ? { extent: undefined } : {}),
    }
  })
  return sortNodesParentsFirst(next)
}
