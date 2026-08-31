import { useCallback, useMemo } from 'react'
import type { NodeMouseHandler } from '@xyflow/react'
import type { AnyNode, FlowStore, Pipe } from '../store/flowStore'

/**
 * An edge whose note end is collapsed: still mounted, painted nowhere.
 * The visual is entirely in index.css (opacity + visibility).
 */
export const NOTE_EDGE_MUTED = 'pipe-note-muted'
/** ...and temporarily un-muted, because the pointer is on one of its two ends. */
export const NOTE_EDGE_REVEALED = 'pipe-note-revealed'

/**
 * What a collapsed note is hiding, and what the pointer is un-hiding.
 *
 * ONE rule produces every row of the card's table (a8596103):
 *
 *   muted    = an end of the edge is a note whose data.collapsed is true
 *   revealed = muted AND the hovered node is one of that edge's two ends
 *
 * "一端折叠一端没折叠，以 note 那端的状态为准" is not a special case here — it is what
 * `muted` already says by testing *either* end: the only way an edge is muted is that a
 * collapsed note is on it, so the note端 decides by construction.
 *
 * The card's bonus (hover a NODE → show the collapsed notes pointing at it) is likewise
 * not a second feature. It is the same `revealed` line read from the other end. It is in
 * because leaving it out would have cost an extra condition, not because it was chased.
 *
 * MUTED, NOT REMOVED. `hidden: true` would be cheaper — React Flow unmounts the edge and
 * stops pathing it — but an unmounted element cannot fade out, and acceptance 3 asks for a
 * fade on the way out as well as in. So the edges stay mounted with visibility:hidden,
 * which paints nothing and takes no pointer events. The standing cost of that choice is
 * measured, not assumed — see the note above the rules in index.css.
 *
 * Pure, so the rule is testable without a canvas, a store or a DOM (see
 * __tests__/useCollapsedNoteEdges.test.ts) — same shape as computeNodeAdjacentPipes.
 */
export function computeNoteEdgeClasses(
  nodes: AnyNode[],
  pipes: Pipe[],
  hoveredNodeId: string | null,
): Map<string, string> {
  const collapsedNotes = new Set<string>()
  for (const node of nodes) {
    if (node.type === 'note' && (node.data as { collapsed?: boolean }).collapsed) {
      collapsedNotes.add(node.id)
    }
  }

  const classes = new Map<string, string>()
  if (collapsedNotes.size === 0) return classes

  for (const pipe of pipes) {
    if (!collapsedNotes.has(pipe.source) && !collapsedNotes.has(pipe.target)) continue
    const revealed = hoveredNodeId !== null && (pipe.source === hoveredNodeId || pipe.target === hoveredNodeId)
    classes.set(pipe.id, revealed ? `${NOTE_EDGE_MUTED} ${NOTE_EDGE_REVEALED}` : NOTE_EDGE_MUTED)
  }
  return classes
}

/**
 * The canvas-side half: the per-pipe classes plus the two handlers that feed the shared
 * hover state. Shared by DataflowCanvas and DataflowReadonlyPreview so a collapsed note
 * behaves identically in the editor and in the read-only viewer — the card's repro
 * (`/learn/azure/network/foundation/`) is opened through the viewer, so fixing only the
 * editor would have fixed nothing the reporter can see.
 *
 * The store is a PARAMETER, not a useFlowStore() context read. Both callers render their
 * <FlowStoreContext.Provider> inside their own return, so at the point this hook runs
 * there is no provider above it yet and a context read throws — which is how the existing
 * canvas and preview tests caught it.
 */
export function useCollapsedNoteEdges(store: FlowStore, nodes: AnyNode[], pipes: Pipe[]) {
  const hoveredNodeId = store((s) => s.hoveredNodeId)
  const setHoveredNode = store((s) => s.setHoveredNode)
  const clearHoveredNode = store((s) => s.clearHoveredNode)

  const noteEdgeClasses = useMemo(
    () => computeNoteEdgeClasses(nodes, pipes, hoveredNodeId),
    [nodes, pipes, hoveredNodeId],
  )

  const onNodeMouseEnter = useCallback<NodeMouseHandler>(
    (_event, node) => setHoveredNode(node.id),
    [setHoveredNode],
  )
  const onNodeMouseLeave = useCallback<NodeMouseHandler>(
    (_event, node) => clearHoveredNode(node.id),
    [clearHoveredNode],
  )

  return { noteEdgeClasses, onNodeMouseEnter, onNodeMouseLeave }
}
