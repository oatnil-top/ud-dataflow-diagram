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
 * Only note/resource/group have a collapsed body render (their components
 * early return a small chip); json field-collapse changes content height but
 * those nodes carry no persisted size, so they are not mapped here.
 *
 * A collapsed GROUP is the same problem one size up (card 20d64f9b): its
 * persisted style.width/height is what makes the container a container, so a
 * collapsed group that kept it would leave a 700x360 invisible rectangle
 * swallowing clicks over the whole canvas region its members used to occupy,
 * with the chip's four handles pinned to that rectangle's edges.
 */
export function stripSizeWhenCollapsed(nodes: AnyNode[]): AnyNode[] {
  return nodes.map((node) => {
    const hasCollapsedBody = node.type === 'note' || node.type === 'resource' || node.type === 'group'
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

/**
 * The size a COLLAPSED group's chip renders at (card 20d64f9b).
 *
 * An estimate, in the same spirit as importFormats' SIZE_BY_TYPE and derived from the
 * chip's own CSS in GroupNode.tsx: `h-7` (28px) tall, `px-2` plus a 4px gap either side
 * of the optional icon, a 13px label, and a fixed allowance for the hidden-count badge
 * and the expand button. It is never written to the node — it only has to be close
 * enough for the facing-side rule to pick the same handle a human would.
 *
 * It cannot model the count digits (the size of the chip depends on how many nodes are
 * hidden, which the geometry layer has no list to count), so the allowance covers a
 * two-digit badge; a wider chip only moves an edge's landing point by a few px.
 */
export function collapsedGroupChipSize(data: { name?: string; icon?: string } | undefined): { width: number; height: number } {
  // CJK glyphs are about 1em, latin about 0.6em — the same ratio the layout solver uses.
  const em = [...String(data?.name ?? '')].reduce(
    (sum, ch) => sum + ((ch.codePointAt(0) ?? 0) > 0xff ? 1 : 0.6), 0)
  const padding = 16          // px-2 both sides
  const icon = data?.icon ? 20 : 0
  const badgeAndButton = 34   // hidden-count badge + expand button
  const width = Math.max(96, Math.round(padding + icon + em * 13 + badgeAndButton))
  return { width, height: 28 }
}
