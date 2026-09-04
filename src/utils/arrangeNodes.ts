import { estimateNodeSize } from '../store/importFormats'

/**
 * The selection-arrangement operations behind the selection bar's buttons
 * (align left / align right / one row / one column / grid). Pure function of the
 * selected nodes — the store applies the returned positions in one undo step.
 *
 * Coordinate spaces are the load-bearing constraint here. A child node's position is
 * RELATIVE to its parent group (React Flow parentId), so "align these" is only
 * meaningful among nodes that share a space. Two rules keep that honest:
 *
 *  - A selected child whose parent is ALSO selected is carried: it moves with the
 *    parent and takes no part in the arrangement (it is neither moved nor "skipped").
 *  - Of the remaining nodes, the largest same-space cohort is arranged and the rest
 *    are reported in `skippedIds` so the UI can say so — silently arranging mixed
 *    spaces would fling children to absolute coordinates outside their group.
 *    Ties prefer top-level nodes, then the lexicographically smallest space key,
 *    so the outcome never depends on selection order.
 */

export type ArrangeOp = 'align-left' | 'align-right' | 'row' | 'column' | 'grid'

export interface ArrangeableNode {
  id: string
  parentId?: string
  position: { x: number; y: number }
  /** React Flow's runtime measurement; absent on the first frame after an import. */
  measured?: { width?: number; height?: number }
  type?: string
  style?: { width?: unknown; height?: unknown }
  data?: unknown
}

export interface ArrangeResult {
  /** New position per arranged node id. Unchanged nodes may be present with their old position. */
  positions: Map<string, { x: number; y: number }>
  /** Ids whose position actually changed. */
  movedIds: string[]
  /** Selected nodes left out because they live in a different coordinate space. */
  skippedIds: string[]
}

/** Same density as the import layout's sibling gap (importFormats.ts). */
export const ARRANGE_GAP = 60

function sizeOf(n: ArrangeableNode): { width: number; height: number } {
  const est = estimateNodeSize(n)
  return {
    width: typeof n.measured?.width === 'number' ? n.measured.width : est.width,
    height: typeof n.measured?.height === 'number' ? n.measured.height : est.height,
  }
}

export function arrangeNodes(op: ArrangeOp, selected: ArrangeableNode[]): ArrangeResult {
  const selectedIds = new Set(selected.map((n) => n.id))
  // Carried children ride with their selected parent — exclude, don't report.
  const candidates = selected.filter((n) => !(n.parentId && selectedIds.has(n.parentId)))

  // Cohorts by coordinate space ('' = top level).
  const bySpace = new Map<string, ArrangeableNode[]>()
  for (const n of candidates) {
    const key = n.parentId ?? ''
    const list = bySpace.get(key)
    if (list) list.push(n)
    else bySpace.set(key, [n])
  }
  let winner = ''
  let winnerCount = -1
  for (const [key, list] of bySpace) {
    if (
      list.length > winnerCount ||
      (list.length === winnerCount && (key === '' || (winner !== '' && key < winner)))
    ) {
      winner = key
      winnerCount = list.length
    }
  }
  const participants = bySpace.get(winner) ?? []
  const skippedIds = candidates.filter((n) => (n.parentId ?? '') !== winner).map((n) => n.id)

  const positions = new Map<string, { x: number; y: number }>()
  const movedIds: string[] = []
  if (participants.length < 2) return { positions, movedIds, skippedIds }

  const sized = participants.map((n) => ({ n, ...sizeOf(n) }))
  const minX = Math.min(...sized.map((s) => s.n.position.x))
  const minY = Math.min(...sized.map((s) => s.n.position.y))

  const place = (id: string, current: { x: number; y: number }, next: { x: number; y: number }) => {
    positions.set(id, next)
    if (next.x !== current.x || next.y !== current.y) movedIds.push(id)
  }

  if (op === 'align-left') {
    for (const s of sized) place(s.n.id, s.n.position, { x: minX, y: s.n.position.y })
  } else if (op === 'align-right') {
    const rightEdge = Math.max(...sized.map((s) => s.n.position.x + s.width))
    for (const s of sized) place(s.n.id, s.n.position, { x: rightEdge - s.width, y: s.n.position.y })
  } else if (op === 'row') {
    // Anchored at the selection's bounding top-left; ordered by where each node
    // already is, so the row reads in the order the user sees, not import order.
    const ordered = [...sized].sort(
      (a, b) => a.n.position.x - b.n.position.x || a.n.position.y - b.n.position.y || a.n.id.localeCompare(b.n.id),
    )
    let cursor = minX
    for (const s of ordered) {
      place(s.n.id, s.n.position, { x: cursor, y: minY })
      cursor += s.width + ARRANGE_GAP
    }
  } else if (op === 'column') {
    const ordered = [...sized].sort(
      (a, b) => a.n.position.y - b.n.position.y || a.n.position.x - b.n.position.x || a.n.id.localeCompare(b.n.id),
    )
    let cursor = minY
    for (const s of ordered) {
      place(s.n.id, s.n.position, { x: minX, y: cursor })
      cursor += s.height + ARRANGE_GAP
    }
  } else {
    // Grid: ceil(sqrt(n)) columns — square-ish — filled in reading order (top-left
    // to bottom-right of where the nodes already are). Columns are as wide as their
    // widest member and rows as tall as their tallest, so a 110px icon next to a
    // 320px table does not force icon columns to table width.
    const ordered = [...sized].sort(
      (a, b) => a.n.position.y - b.n.position.y || a.n.position.x - b.n.position.x || a.n.id.localeCompare(b.n.id),
    )
    const cols = Math.ceil(Math.sqrt(ordered.length))
    const colWidth: number[] = []
    const rowHeight: number[] = []
    ordered.forEach((s, i) => {
      const c = i % cols
      const r = Math.floor(i / cols)
      colWidth[c] = Math.max(colWidth[c] ?? 0, s.width)
      rowHeight[r] = Math.max(rowHeight[r] ?? 0, s.height)
    })
    const colX: number[] = []
    let x = minX
    for (let c = 0; c < colWidth.length; c++) { colX[c] = x; x += colWidth[c] + ARRANGE_GAP }
    const rowY: number[] = []
    let y = minY
    for (let r = 0; r < rowHeight.length; r++) { rowY[r] = y; y += rowHeight[r] + ARRANGE_GAP }
    ordered.forEach((s, i) => {
      place(s.n.id, s.n.position, { x: colX[i % cols], y: rowY[Math.floor(i / cols)] })
    })
  }

  return { positions, movedIds, skippedIds }
}
