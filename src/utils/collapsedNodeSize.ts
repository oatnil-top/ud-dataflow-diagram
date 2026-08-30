import type { AnyNode } from '../store/flowStore'

/**
 * Strip persisted width/height from COLLAPSED note/resource nodes, at the
 * render boundary only.
 *
 * Why: a node's persisted size (top-level `width`/`height` written by
 * NodeResizer, or `style.width`/`style.height` set at creation/import) is
 * applied by React Flow as inline style on the node wrapper. A collapsed
 * note/resource renders a 32×32 square, but the wrapper kept its expanded
 * size — so everything that reads node geometry was wrong at once: the four
 * perimeter handles (absolutely positioned, they anchor to the wrapper, the
 * nearest positioned ancestor) landed on the invisible expanded perimeter,
 * edges connected mid-air (e.g. width:680 → node-top off by 324px,
 * node-right by 648px), the minimap drew a 680px bar, and the click/marquee
 * hit area stayed 680px wide.
 *
 * The store and the wire format are deliberately NOT touched: the expanded
 * size must survive collapse→expand round-trips and export. Only the node
 * objects handed to <ReactFlow> lose the size, so the wrapper shrink-wraps
 * the 32×32 square and every geometry consumer agrees with what is visible.
 *
 * Only note/resource have a collapsed body render (their components early
 * return the small square); json field-collapse changes content height but
 * those nodes carry no persisted size, so they are not mapped here.
 */
export function stripSizeWhenCollapsed(nodes: AnyNode[]): AnyNode[] {
  return nodes.map((node) => {
    const hasCollapsedBody = node.type === 'note' || node.type === 'resource'
    if (!hasCollapsedBody || !(node.data as { collapsed?: boolean }).collapsed) return node

    const hasSize =
      node.width !== undefined ||
      node.height !== undefined ||
      node.style?.width !== undefined ||
      node.style?.height !== undefined
    if (!hasSize) return node

    const { width: _w, height: _h, style, ...rest } = node
    if (!style) return rest
    const { width: _sw, height: _sh, ...restStyle } = style
    return Object.keys(restStyle).length > 0 ? { ...rest, style: restStyle } : rest
  })
}
