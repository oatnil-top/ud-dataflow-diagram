import { useCallback } from 'react'
import { create } from 'zustand'

/**
 * 7-color palette for multi-field selection
 * Each selected field (and its connected flow) gets a unique color, cycling through these.
 */
export const HIGHLIGHT_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
] as const

export const HIGHLIGHT_BG_COLORS = [
  'rgba(59, 130, 246, 0.08)',  // blue
  'rgba(239, 68, 68, 0.08)',   // red
  'rgba(16, 185, 129, 0.08)',  // emerald
  'rgba(245, 158, 11, 0.08)',  // amber
  'rgba(139, 92, 246, 0.08)',  // violet
  'rgba(236, 72, 153, 0.08)',  // pink
  'rgba(6, 182, 212, 0.08)',   // cyan
] as const

export const HIGHLIGHT_BORDER_COLORS = [
  'rgba(59, 130, 246, 0.4)',   // blue
  'rgba(239, 68, 68, 0.4)',    // red
  'rgba(16, 185, 129, 0.4)',   // emerald
  'rgba(245, 158, 11, 0.4)',   // amber
  'rgba(139, 92, 246, 0.4)',   // violet
  'rgba(236, 72, 153, 0.4)',   // pink
  'rgba(6, 182, 212, 0.4)',    // cyan
] as const

/**
 * What one selection reaches.
 *
 * There are two kinds and they differ ONLY here — in what a click reaches. Everything
 * downstream (the toggle rules, the 7-colour rotation, clearing) is one implementation,
 * because master's requirement (2026-08-29 13:50, card efd95471) is that clicking a node
 * gives *the same effect*, not a second effect that looks like it.
 *
 *   'field'  a click on a field row      → BFS over the field graph, unbounded, both
 *                                          directions (computeConnectedFields)
 *   'node'   a click on a node's body    → the pipes touching that node, then STOP
 *                                          (computeNodeAdjacentPipes)
 *
 * The two depths are a knowing choice by master (13:53 "既有机制,对于其他种类,不用传递"),
 * not an unfinished half. Do not "tidy" the node kind into propagating.
 */
interface SelectionEntry {
  field: { nodeId: string; handleId: string }
  colorIndex: number
  /** Handle keys ("nodeId:handleId") this selection colours. Empty for a node selection — see below. */
  connectedFields: Set<string>
  /** Pipe ids this selection colours directly. Empty for a field selection. */
  connectedPipes: Set<string>
}

/**
 * Why a node selection names PIPES and writes nothing into fieldColorMap.
 *
 * The obvious shape — seed fieldColorMap with the clicked node's handles plus the far end
 * of each edge — was built and measured on 2026-08-29, and it is wrong twice:
 *
 *  1. fieldColorMap has TWO readers, not one. Besides the edge rule in DataflowCanvas, it
 *     is read by useFieldHighlight (below) to paint a field ROW's own background and ring.
 *     Measured: seeding `sinkD:input-userId` alone put `field-highlighted` on that row —
 *     so clicking a Shape node would light a row on some other JsonNode, with nothing on
 *     screen saying why.
 *  2. The edge rule asks only "does each end have SOME colour" and never whether the two
 *     ends came from the same selection. A field BFS closes over the edges it walks, so it
 *     can never half-colour an edge — but a node seed deliberately stops, so with a field
 *     highlight also lit, an unrelated edge whose two ends were coloured by two DIFFERENT
 *     selections would light, in the source end's colour. A false positive.
 *
 * Naming pipe ids removes both by construction rather than by care: a node selection
 * contributes zero handle keys, so neither reader can be reached by accident.
 */
interface HighlightState {
  // Selection key -> entry. ONE map for both kinds on purpose: a node selection is just
  // one more entry, so it coexists with field selections exactly the way two field
  // selections already coexist. There is no second state source and therefore nothing to
  // keep mutually exclusive.
  selections: Map<string, SelectionEntry>
  // Derived: handle key -> colour index. Field selections only.
  fieldColorMap: Map<string, number>
  // Derived: pipe id -> colour index. Node selections only.
  pipeColorMap: Map<string, number>
  // Next color index to assign
  nextColorIndex: number

  selectField: (nodeId: string, handleId: string, pipes: PipeData[], multiSelect: boolean) => void
  selectNode: (nodeId: string, pipes: PipeData[], multiSelect: boolean) => void
  clearSelection: () => void
}

type PipeData = { id: string; source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null }

/**
 * Selection-map keys are TAGGED by kind so the two key spaces cannot overlap.
 *
 * Untagged, a node key would have to be `${nodeId}:` — and ProcessNode really does call
 * useFieldHighlight with an empty handleId (`inputField ? ... : ''`), producing that exact
 * string, which would make a field row report itself selected because its node was clicked.
 * A tag is cheaper than remembering that. These keys are internal: never stored, never
 * rendered, never compared against fieldColorMap (a different key space).
 */
const fieldSelectionKey = (nodeId: string, handleId: string) => `f:${nodeId}:${handleId}`
const nodeSelectionKey = (nodeId: string) => `n:${nodeId}`

/**
 * Get complementary handle (input-X <-> output-X) for flow-through
 */
const getComplementaryHandle = (handleId: string): string | null => {
  if (handleId.startsWith('input-')) return 'output-' + handleId.slice(6)
  if (handleId.startsWith('output-')) return 'input-' + handleId.slice(7)
  return null
}

/**
 * BFS to find all connected fields from a starting field
 */
const computeConnectedFields = (
  startField: { nodeId: string; handleId: string },
  pipes: PipeData[]
): Set<string> => {
  const visited = new Set<string>()
  const startKey = `${startField.nodeId}:${startField.handleId}`
  visited.add(startKey)
  const queue = [startKey]

  // Add complementary handle of start field
  const startComplement = getComplementaryHandle(startField.handleId)
  if (startComplement) {
    const key = `${startField.nodeId}:${startComplement}`
    visited.add(key)
    queue.push(key)
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    const [nodeId, handleId] = current.split(':')

    // Add complementary handle (flow through the field)
    const complement = getComplementaryHandle(handleId)
    if (complement) {
      const key = `${nodeId}:${complement}`
      if (!visited.has(key)) {
        visited.add(key)
        queue.push(key)
      }
    }

    // Follow pipe connections
    for (const pipe of pipes) {
      // Downstream
      if (pipe.source === nodeId && pipe.sourceHandle === handleId) {
        const next = `${pipe.target}:${pipe.targetHandle}`
        if (!visited.has(next)) {
          visited.add(next)
          queue.push(next)
        }
      }
      // Upstream
      if (pipe.target === nodeId && pipe.targetHandle === handleId) {
        const next = `${pipe.source}:${pipe.sourceHandle}`
        if (!visited.has(next)) {
          visited.add(next)
          queue.push(next)
        }
      }
    }
  }

  return visited
}

/**
 * Every pipe with an end on this node, and then stop.
 *
 * This is the whole of "don't propagate": both ends of each touching pipe are inside the
 * answer, but the node at the far end is never expanded. Pure, so it is unit-testable
 * without a canvas or a store (see __tests__/useHighlight.test.ts).
 *
 * Self-loops and parallel edges fall out correctly because the answer is a Set of pipe ids.
 */
export const computeNodeAdjacentPipes = (nodeId: string, pipes: PipeData[]): Set<string> => {
  const found = new Set<string>()
  for (const pipe of pipes) {
    if (pipe.source === nodeId || pipe.target === nodeId) found.add(pipe.id)
  }
  return found
}

/**
 * Rebuild the fieldColorMap from all selections
 */
const buildFieldColorMap = (selections: Map<string, SelectionEntry>): Map<string, number> => {
  const map = new Map<string, number>()
  for (const entry of selections.values()) {
    for (const fieldKey of entry.connectedFields) {
      // First selection to claim a field wins
      if (!map.has(fieldKey)) {
        map.set(fieldKey, entry.colorIndex)
      }
    }
  }
  return map
}

/** Same first-claim-wins rule as buildFieldColorMap, over pipe ids. */
const buildPipeColorMap = (selections: Map<string, SelectionEntry>): Map<string, number> => {
  const map = new Map<string, number>()
  for (const entry of selections.values()) {
    for (const pipeId of entry.connectedPipes) {
      if (!map.has(pipeId)) map.set(pipeId, entry.colorIndex)
    }
  }
  return map
}

const derive = (selections: Map<string, SelectionEntry>) => ({
  fieldColorMap: buildFieldColorMap(selections),
  pipeColorMap: buildPipeColorMap(selections),
})

/** A factory, not a constant: handing every caller the same Map instance is a footgun
 *  waiting for the first mutation, even though nothing mutates these today. */
const emptySelection = () => ({
  selections: new Map<string, SelectionEntry>(),
  fieldColorMap: new Map<string, number>(),
  pipeColorMap: new Map<string, number>(),
  nextColorIndex: 0,
})

/**
 * Add / toggle one selection. Shared by selectField and selectNode so the toggle rules and
 * the colour rotation exist once: a node takes the next colour off the same rotation and is
 * treated exactly like a field (Alfred, card efd95471 gate 2).
 */
const applySelection = (
  state: HighlightState,
  selectionKey: string,
  field: { nodeId: string; handleId: string },
  reach: Pick<SelectionEntry, 'connectedFields' | 'connectedPipes'>,
  multiSelect: boolean,
): Partial<HighlightState> => {
  if (multiSelect) {
    const selections = new Map(state.selections)
    // Toggle: ctrl-clicking an existing primary selection removes it
    if (selections.has(selectionKey)) {
      selections.delete(selectionKey)
      return { selections, ...derive(selections) }
    }
    const colorIndex = state.nextColorIndex % HIGHLIGHT_COLORS.length
    selections.set(selectionKey, { field, colorIndex, ...reach })
    return { selections, ...derive(selections), nextColorIndex: state.nextColorIndex + 1 }
  }
  // Single click on the one thing already selected: deselect it
  if (state.selections.size === 1 && state.selections.has(selectionKey)) return emptySelection()
  // Otherwise single click replaces the whole selection — which is what makes clicking
  // another node leave no residue of the previous one.
  const selections = new Map<string, SelectionEntry>([[selectionKey, { field, colorIndex: 0, ...reach }]])
  return { selections, ...derive(selections), nextColorIndex: 1 }
}

export const useHighlightStore = create<HighlightState>((set, get) => ({
  selections: new Map(),
  fieldColorMap: new Map(),
  pipeColorMap: new Map(),
  nextColorIndex: 0,

  selectField: (nodeId, handleId, pipes, multiSelect) => {
    set(applySelection(
      get(),
      fieldSelectionKey(nodeId, handleId),
      { nodeId, handleId },
      { connectedFields: computeConnectedFields({ nodeId, handleId }, pipes), connectedPipes: new Set() },
      multiSelect,
    ))
  },

  // Clicking a node's body. handleId is '' because a body click names no handle — and it
  // must not, since a node has four perimeter handles and the click says nothing about
  // which. That is also why this kind names pipes instead of handles.
  selectNode: (nodeId, pipes, multiSelect) => {
    set(applySelection(
      get(),
      nodeSelectionKey(nodeId),
      { nodeId, handleId: '' },
      { connectedFields: new Set(), connectedPipes: computeNodeAdjacentPipes(nodeId, pipes) },
      multiSelect,
    ))
  },

  clearSelection: () => {
    set(emptySelection())
  },
}))

/**
 * Hook for field highlighting
 * Returns { isHighlighted, colorIndex, toggle } for a specific field
 */
export const useFieldHighlight = (
  nodeId: string,
  handleId: string,
  pipes: PipeData[]
) => {
  const fieldColorMap = useHighlightStore((state) => state.fieldColorMap)
  const selections = useHighlightStore((state) => state.selections)
  const selectField = useHighlightStore((state) => state.selectField)

  // Two different key spaces, deliberately: fieldColorMap is keyed by HANDLE
  // ("nodeId:handleId"), selections by a TAGGED selection key. They were the same string
  // before node selections existed; keeping them the same would let a node selection be
  // mistaken for a field one (see fieldSelectionKey).
  const colorIndex = handleId ? fieldColorMap.get(`${nodeId}:${handleId}`) : undefined
  const isHighlighted = colorIndex !== undefined
  const isSelected = selections.has(fieldSelectionKey(nodeId, handleId))

  const toggle = useCallback((multiSelect = false) => {
    selectField(nodeId, handleId, pipes, multiSelect)
  }, [nodeId, handleId, selectField, pipes])

  return { isHighlighted, isSelected, colorIndex: colorIndex ?? -1, toggle }
}
