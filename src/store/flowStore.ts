import { create, type StoreApi, type UseBoundStore } from 'zustand'
import {
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  applyNodeChanges,
  applyEdgeChanges,
  reconnectEdge,
} from '@xyflow/react'
import type { JsonNodeData, ProcessNodeData, NoteNodeData, ResourceNodeData, ShapeNodeData, GroupNodeData, IconNodeData, PipeData, Field, OutputField, ShapeVariant } from '../types'
import { generateId } from '../types'
import { applySetOperation, SET_OP_SYMBOLS, type SetOperation } from '../utils/fieldSetOps'
import { sortNodesParentsFirst } from '../utils/nodeOrder'
import { ensureNodeFieldIds, parseImportedGraph } from './importFormats'
import { applyEditPlan as buildEditApplication, type ViewportRect } from './editPlan'
import { arrangeNodes, type ArrangeOp } from '../utils/arrangeNodes'
import type { EditPlan, BadLine } from './dslParser'

// React Flow uses "Edge", we call them "Pipe" in our domain
export type Pipe = Edge<PipeData>
export type AnyNodeData = JsonNodeData | ProcessNodeData | NoteNodeData | ResourceNodeData | ShapeNodeData | GroupNodeData | IconNodeData
export type AnyNode = Node<AnyNodeData>

// Type guards for narrowing node data
function isNoteNode(node: AnyNode): node is Node<NoteNodeData> {
  return node.type === 'note'
}
function isJsonNode(node: AnyNode): node is Node<JsonNodeData> {
  return node.type === 'json'
}
function isProcessNode(node: AnyNode): node is Node<ProcessNodeData> {
  return node.type === 'process'
}
function isResourceNode(node: AnyNode): node is Node<ResourceNodeData> {
  return node.type === 'resource' || node.type === 'image' // 'image' is legacy
}
function isShapeNode(node: AnyNode): node is Node<ShapeNodeData> {
  return node.type === 'shape'
}
function isGroupNode(node: AnyNode): node is Node<GroupNodeData> {
  return node.type === 'group'
}
function isIconNode(node: AnyNode): node is Node<IconNodeData> {
  return node.type === 'icon'
}

export interface FlowState {
  nodes: AnyNode[]
  pipes: Pipe[]
  clipboard: AnyNode | null
  rawEditNodeId: string | null

  /**
   * Which node the pointer is over, or null. Transient view state, deliberately
   * living beside `rawEditNodeId` and `clipboard` rather than in a component:
   * a collapsed note's peek panel (NoteNode) and its edges' visibility
   * (DataflowCanvas / DataflowReadonlyPreview, via useCollapsedNoteEdges) must
   * appear and disappear *together* (card a8596103), and two independent hover
   * booleans cannot be relied on to agree. One store field, one truth.
   *
   * It never enters an undo snapshot (captureSnapshot takes nodes+pipes only)
   * and never sets isDirty — hovering is not an edit.
   */
  hoveredNodeId: string | null

  // Dirty tracking
  isDirty: boolean
  markClean: () => void

  // Undo/Redo
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  takeSnapshot: () => void

  // Actions
  onNodesChange: (changes: NodeChange[]) => void
  onPipesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void

  addJsonNode: (name: string, fields: Field[], position?: { x: number; y: number }) => string
  addProcessNode: (name: string, inputFields: string[], outputFields: OutputField[], position?: { x: number; y: number }) => string
  addNoteNode: (name: string, content?: string, position?: { x: number; y: number }) => string
  addResourceNode: (name: string, resourceId?: string, position?: { x: number; y: number }) => string
  addGroupNode: (name: string, position?: { x: number; y: number }, size?: { width: number; height: number }, opts?: { icon?: string; stylePreset?: string; parentId?: string }) => string
  addIconNode: (name: string, icon: string, position?: { x: number; y: number }) => string
  addShapeNode: (name: string, shape?: ShapeVariant, position?: { x: number; y: number }) => string
  duplicateNode: (nodeId: string) => string | null
  duplicateNodes: (nodeIds: string[]) => string[]
  copyNode: (nodeId: string) => void
  copyNodesToClipboard: (nodeIds: string[]) => void
  pasteNode: (position?: { x: number; y: number }) => string | null
  pasteNodesFromClipboard: (json: string, center: { x: number; y: number }) => string[]
  removeNode: (nodeId: string) => void
  removeSelection: (nodeIds: string[], pipeIds?: string[]) => void

  updateJsonNodeFields: (nodeId: string, fields: Field[], opts?: { renamedPaths?: HandleRename[] }) => void
  updateNodeName: (nodeId: string, name: string) => void
  updateNodeUrl: (nodeId: string, url: string | undefined) => void
  updateProcessNode: (nodeId: string, data: Partial<ProcessNodeData>, opts?: { renamedPaths?: HandleRename[] }) => void
  updateNoteNode: (nodeId: string, data: Partial<NoteNodeData>) => void
  updateResourceNode: (nodeId: string, data: Partial<ResourceNodeData>) => void
  updateGroupNode: (nodeId: string, data: Partial<GroupNodeData>) => void
  updateIconNode: (nodeId: string, data: Partial<IconNodeData>) => void
  updateShapeNode: (nodeId: string, data: Partial<ShapeNodeData>) => void
  updatePipe: (pipeId: string, data: Partial<Pick<PipeData, 'description' | 'sourceMarker' | 'targetMarker' | 'color' | 'lineWidth' | 'lineStyle' | 'animated' | 'labelOffset'>>) => void
  reconnectPipe: (oldPipe: Pipe, newConnection: Connection) => void

  // Hover (see hoveredNodeId). Two co-writers on purpose and safely: NoteNode's own
  // mouse handlers (so the package's node types keep working for anyone who mounts
  // them in their own <ReactFlow> without wiring the canvas handlers) and the
  // canvas-level onNodeMouseEnter/Leave (which is what lets hovering a NON-note node
  // reveal the collapsed notes pointing at it). Both write the same id, so any
  // interleaving is idempotent.
  setHoveredNode: (nodeId: string) => void
  /**
   * Clear only if `nodeId` is still the hovered one. Moving the pointer straight from
   * node A to node B does not guarantee leave(A) arrives before enter(B) — the DOM
   * fires them per element and React batches — so an unguarded clear can wipe B's
   * hover the instant it was set, which shows up as edges that flicker off mid-sweep.
   */
  clearHoveredNode: (nodeId: string) => void

  // Raw editor
  setRawEditNode: (nodeId: string | null) => void
  updateNodeData: (nodeId: string, data: AnyNodeData) => void

  // Set operations on JSON nodes
  generateSetOperation: (nodeIdA: string, nodeIdB: string, operation: SetOperation) => string | null

  // Export/Import
  exportGraph: () => string
  /**
   * Returns null when nothing importable was found — so `if (importGraph(...))` reads
   * the same as it did when this returned a boolean — and an ImportResult otherwise.
   * See ImportResult for what the caller is expected to do with it.
   */
  importGraph: (json: string, viewportCenter?: { x: number; y: number }, opts?: ImportOptions) => ImportResult | null
  /**
   * Apply a parsed DSL edit plan (store/dslParser.ts).
   *
   * Deliberately takes an EditPlan and not text: this store has no way to parse DSL and
   * cannot acquire one, which is the type-level half of "DSL is not a document format"
   * (dslParser.ts header). The plan is already parsed when it arrives, so a parse failure
   * can never reach a snapshot.
   *
   * Returns null only when the plan does nothing at all.
   */
  applyEditPlan: (plan: EditPlan, viewport?: ViewportRect) => ImportResult | null
  clearGraph: () => void

  /**
   * Arrange the CURRENTLY SELECTED nodes (utils/arrangeNodes.ts) in one undo step.
   * Selection is the whole contract: both paste channels leave their new batch
   * selected, so "paste an AI answer → press a button" arranges exactly that batch
   * and nothing else. Returns how many nodes moved and how many selected nodes were
   * left out for living in another coordinate space — the caller owes the user a
   * word when `skipped > 0`.
   */
  arrangeSelection: (op: ArrangeOp) => { moved: number; skipped: number }

  /**
   * The last paste-path import, for the summary bar to render and dismiss.
   *
   * Store state rather than a return value the entry points thread into a component,
   * because three entry points (AICollabPanel, the playground toolbar, canvas Ctrl+V) produce it and
   * one bar renders it. Set only by callers that actually paste — loading the built-in
   * example and the in-app AI panel keep their own toasts and leave this alone.
   */
  importSummary: ImportResult | null
  setImportSummary: (summary: ImportResult | null) => void
}

export interface ImportOptions {
  /** Replace the canvas instead of merging into it (opening a document). */
  replace?: boolean
  /**
   * Paste semantics: an incoming id that names a canvas node IS that node.
   * ⛔ Never set together with `replace` — see importFormats.ts's file header.
   */
  sameIdMeansSameNode?: boolean
}

/**
 * What one import did, in the terms the user is owed after pasting something a model
 * wrote: what landed, what was already there, and what could not be connected. Partial
 * success is deliberate — the import pushes an undo snapshot, so nine nodes out of ten
 * plus a visible count beats refusing all ten and charging the user another round trip
 * through their chat window (design fb629b6a §Q3).
 */
export interface ImportResult {
  addedNodes: number
  addedPipes: number
  /** Nodes the canvas already had under the same id. */
  skippedNodes: number
  /** Connections the canvas already had, endpoints and anchors alike. */
  skippedPipes: number
  /** Connections whose endpoints exist neither in the payload nor on the canvas. */
  droppedPipes: { source: string; target: string }[]
  /**
   * Which channel produced this. The summary bar reads it to know whether "ignored N
   * lines" is even a sentence that can apply — a JSON payload has no lines.
   */
  format: 'json' | 'dsl'
  /** DSL only: nodes that were already on the canvas and were renamed or gained fields. */
  updatedNodes: number
  /** DSL only: field-level links whose field did not exist, connected node-to-node. */
  degradedLinks: number
  /** DSL only: group members that could not be wrapped (editPlan.ts droppedMembers). */
  droppedMembers: { group: string; member: string }[]
  /** DSL only: lines that were not edits, by line number (dslParser.BadLine). */
  ignoredLines: BadLine[]
}

export type FlowStore = UseBoundStore<StoreApi<FlowState>>

/**
 * A field/output rename that requires remapping pipe handles.
 * `from`/`to` are dotted path strings (e.g. "user.name") — handle IDs are
 * `input-<path>` / `output-<path>`, so renames must follow the field or every
 * connected pipe silently loses its handle.
 */
export interface HandleRename {
  from: string
  to: string
}

/**
 * Create a flow store instance.
 * In embed mode (when used within DataflowEditor), each editor gets its own store instance.
 * This prevents state conflicts between multiple editors or between the editor and external state.
 */
type Snapshot = { nodes: AnyNode[]; pipes: Pipe[] }
const MAX_HISTORY = 50

export function createFlowStore(): UseBoundStore<StoreApi<FlowState>> {
  const generateNodeId = () => `n_${generateId()}`
  const generatePipeId = () => `p_${generateId()}`

  // History stacks stored as closure variables (not reactive state) for performance
  const past: Snapshot[] = []
  const future: Snapshot[] = []

  function captureSnapshot(state: FlowState): Snapshot {
    // structuredClone is markedly faster than a JSON round-trip and this runs
    // before every mutating action
    return structuredClone({ nodes: state.nodes, pipes: state.pipes })
  }

  // True while a NodeResizer drag is in flight — used to snapshot once per resize
  let isResizing = false

  return create<FlowState>((set, get) => {
    // Helper: push current state to history, clear future
    function pushSnapshot() {
      past.push(captureSnapshot(get()))
      if (past.length > MAX_HISTORY) past.shift()
      future.length = 0
      set({ canUndo: true, canRedo: false, isDirty: true })
    }

    // Helper: drop all history and dirty state (used when replacing content on initial load)
    function resetHistory() {
      past.length = 0
      future.length = 0
      set({ canUndo: false, canRedo: false, isDirty: false })
    }

    // Helper: rewrite pipe handles after field/output renames on a node.
    // Matches exact handles and descendant paths (`output-user` covers `output-user.name`).
    function remapPipeHandles(pipes: Pipe[], nodeId: string, renames: HandleRename[]): Pipe[] {
      if (renames.length === 0) return pipes
      const mapHandle = (handle: string | null | undefined, prefix: 'input-' | 'output-'): string | null | undefined => {
        if (!handle) return handle
        for (const r of renames) {
          const oldHandle = prefix + r.from
          if (handle === oldHandle) return prefix + r.to
          if (handle.startsWith(oldHandle + '.')) return prefix + r.to + handle.slice(oldHandle.length)
        }
        return handle
      }
      return pipes.map((pipe) => {
        if (pipe.source !== nodeId && pipe.target !== nodeId) return pipe
        const updated = { ...pipe }
        if (pipe.source === nodeId) updated.sourceHandle = mapHandle(pipe.sourceHandle, 'output-') ?? undefined
        if (pipe.target === nodeId) updated.targetHandle = mapHandle(pipe.targetHandle, 'input-') ?? undefined
        return updated
      })
    }

    // Helper: absolute canvas position of a node (child positions are parent-relative)
    function absolutePositionOf(node: AnyNode, nodes: AnyNode[]): { x: number; y: number } {
      let x = node.position.x
      let y = node.position.y
      let parentId = node.parentId
      const seen = new Set<string>([node.id])
      while (parentId && !seen.has(parentId)) {
        seen.add(parentId)
        const parent = nodes.find((n) => n.id === parentId)
        if (!parent) break
        x += parent.position.x
        y += parent.position.y
        parentId = parent.parentId
      }
      return { x, y }
    }

    return {
    nodes: [],
    pipes: [],
    clipboard: null,
    rawEditNodeId: null,
    hoveredNodeId: null,
    isDirty: false,
    canUndo: false,
    canRedo: false,

    markClean: () => { set({ isDirty: false }) },

    undo: () => {
      if (past.length === 0) return
      const snapshot = past.pop()!
      future.push(captureSnapshot(get()))
      set({ nodes: snapshot.nodes, pipes: snapshot.pipes, canUndo: past.length > 0, canRedo: true, isDirty: true })
    },

    redo: () => {
      if (future.length === 0) return
      const snapshot = future.pop()!
      past.push(captureSnapshot(get()))
      set({ nodes: snapshot.nodes, pipes: snapshot.pipes, canUndo: true, canRedo: future.length > 0, isDirty: true })
    },

    takeSnapshot: () => {
      pushSnapshot()
    },

    onNodesChange: (changes) => {
      // Snapshot before node removals (Delete key)
      if (changes.some((c) => c.type === 'remove')) {
        pushSnapshot()
      }
      // Snapshot once at the start of a NodeResizer drag so resizes are
      // undoable and mark the document dirty (initial measure events have
      // resizing === undefined and must not dirty a freshly opened graph)
      const resizeEvents = changes.filter((c) => c.type === 'dimensions' && typeof c.resizing === 'boolean')
      if (resizeEvents.length > 0) {
        const resizingNow = resizeEvents.some((c) => c.type === 'dimensions' && c.resizing)
        if (resizingNow && !isResizing) {
          isResizing = true
          pushSnapshot()
        } else if (!resizingNow) {
          isResizing = false
        }
      }
      const updated = applyNodeChanges(changes, get().nodes) as AnyNode[]
      set({ nodes: updated })
    },

    onPipesChange: (changes) => {
      // Snapshot before edge removals (Delete key)
      if (changes.some((c) => c.type === 'remove')) {
        pushSnapshot()
      }
      const newPipes = applyEdgeChanges(changes, get().pipes) as Pipe[]
      set({ pipes: newPipes })
    },

    onConnect: (connection) => {
      if (!connection.source || !connection.target) return
      pushSnapshot()

      const sourceNode = get().nodes.find((n) => n.id === connection.source)
      const targetNode = get().nodes.find((n) => n.id === connection.target)

      const newPipe: Pipe = {
        id: generatePipeId(),
        type: 'dataflow',
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
      }

      // Style note connections with amber dashed line
      const hasNote = (sourceNode && isNoteNode(sourceNode)) || (targetNode && isNoteNode(targetNode))
      // Style resource connections with blue dashed line
      const hasResource = (sourceNode && isResourceNode(sourceNode)) || (targetNode && isResourceNode(targetNode))

      if (hasNote) {
        newPipe.style = { stroke: '#d97706', strokeWidth: 1.5, strokeDasharray: '6 3' }
      } else if (hasResource) {
        newPipe.style = { stroke: '#3b82f6', strokeWidth: 1.5, strokeDasharray: '6 3' }
      }

      set({
        pipes: [...get().pipes, newPipe],
      })
    },

    addJsonNode: (name, fields, position = { x: 100, y: 100 }) => {
      pushSnapshot()
      const id = generateNodeId()
      const newNode: Node<JsonNodeData> = {
        id,
        type: 'json',
        position,
        data: { name, fields },
      }

      set({
        nodes: [...get().nodes, newNode],
      })

      return id
    },

    addProcessNode: (name, inputFields, outputFields, position = { x: 300, y: 100 }) => {
      pushSnapshot()
      const id = generateNodeId()
      const newNode: Node<ProcessNodeData> = {
        id,
        type: 'process',
        position,
        data: { name, inputFields, outputFields },
      }

      set({
        nodes: [...get().nodes, newNode],
      })

      return id
    },

    addNoteNode: (name, content = '', position = { x: 100, y: 100 }) => {
      pushSnapshot()
      const id = generateNodeId()
      const newNode: Node<NoteNodeData> = {
        id,
        type: 'note',
        position,
        data: { name, content, collapsed: false },
      }

      set({
        nodes: [...get().nodes, newNode],
      })

      return id
    },

    addResourceNode: (name, resourceId, position = { x: 100, y: 100 }) => {
      pushSnapshot()
      const id = generateNodeId()
      const newNode: Node<ResourceNodeData> = {
        id,
        type: 'resource',
        position,
        style: { width: 240, height: 200 },
        data: { name, resourceId, collapsed: false },
      }

      set({
        nodes: [...get().nodes, newNode],
      })

      return id
    },

    addGroupNode: (name, position = { x: 100, y: 100 }, size = { width: 400, height: 300 }, opts) => {
      pushSnapshot()
      const id = generateNodeId()

      const nodeData: GroupNodeData = { name }
      if (opts?.icon) nodeData.icon = opts.icon
      if (opts?.stylePreset) nodeData.stylePreset = opts.stylePreset as GroupNodeData['stylePreset']

      const newNode: Node<GroupNodeData> = {
        id,
        type: 'group',
        position,
        data: nodeData,
        style: { width: size.width, height: size.height },
        ...(opts?.parentId ? { parentId: opts.parentId } : {}),
      }

      // Prepending puts the group ahead of the plain nodes it will contain; the
      // sort then puts it back behind its OWN parent when `opts.parentId` was
      // given, which prepending alone gets backwards (utils/nodeOrder.ts).
      set({
        nodes: sortNodesParentsFirst([newNode, ...get().nodes]) as AnyNode[],
      })

      return id
    },

    addIconNode: (name, icon, position = { x: 100, y: 100 }) => {
      pushSnapshot()
      const id = generateNodeId()
      const newNode: Node<IconNodeData> = {
        id,
        type: 'icon',
        position,
        data: { name, icon },
      }
      set({ nodes: [...get().nodes, newNode] })
      return id
    },

    addShapeNode: (name, shape = 'rectangle', position = { x: 100, y: 100 }) => {
      pushSnapshot()
      const id = generateNodeId()
      const newNode: Node<ShapeNodeData> = {
        id,
        type: 'shape',
        position,
        style: { width: 160, height: 80 },
        data: { name, shape, text: '' },
      }
      set({ nodes: [...get().nodes, newNode] })
      return id
    },

    duplicateNode: (nodeId) => {
      const node = get().nodes.find((n) => n.id === nodeId)
      if (!node) return null

      pushSnapshot()
      const newId = generateNodeId()
      const offset = { x: 50, y: 50 }

      // Deep clone the data; keep style (persisted size) and parentId
      // (position is parent-relative, so the copy must stay in the group)
      const clonedData = JSON.parse(JSON.stringify(node.data))

      const newNode: AnyNode = {
        id: newId,
        type: node.type,
        position: {
          x: node.position.x + offset.x,
          y: node.position.y + offset.y,
        },
        data: clonedData,
        ...(node.style ? { style: JSON.parse(JSON.stringify(node.style)) } : {}),
        ...(node.parentId && get().nodes.some((n) => n.id === node.parentId)
          ? { parentId: node.parentId }
          : {}),
      }

      set({
        nodes: [...get().nodes, newNode],
      })

      return newId
    },

    duplicateNodes: (nodeIds) => {
      const state = get()
      const idSet = new Set(nodeIds)
      const sources = state.nodes.filter((n) => idSet.has(n.id))
      if (sources.length === 0) return []

      // One snapshot for the whole batch so a single undo reverts it
      pushSnapshot()
      const offset = { x: 50, y: 50 }
      const idMap = new Map<string, string>()
      const newNodes: AnyNode[] = sources.map((node) => {
        const newId = generateNodeId()
        idMap.set(node.id, newId)
        // A child whose parent is also duplicated follows the new parent and
        // keeps its relative position; otherwise it stays in its own group
        const parentDuplicated = node.parentId && idMap.has(node.parentId)
        const parentAlive = node.parentId && state.nodes.some((n) => n.id === node.parentId)
        return {
          id: newId,
          type: node.type,
          position: parentDuplicated
            ? { ...node.position }
            : { x: node.position.x + offset.x, y: node.position.y + offset.y },
          data: JSON.parse(JSON.stringify(node.data)),
          ...(node.style ? { style: JSON.parse(JSON.stringify(node.style)) } : {}),
          ...(parentDuplicated
            ? { parentId: idMap.get(node.parentId!) }
            : parentAlive
              ? { parentId: node.parentId }
              : {}),
        } as AnyNode
      })

      // Duplicate pipes whose endpoints were both duplicated
      const newPipes: Pipe[] = state.pipes
        .filter((p) => idMap.has(p.source) && idMap.has(p.target))
        .map((pipe) => ({
          ...JSON.parse(JSON.stringify(pipe)),
          id: generatePipeId(),
          source: idMap.get(pipe.source)!,
          target: idMap.get(pipe.target)!,
        }))

      set({
        nodes: [...get().nodes, ...newNodes],
        pipes: [...get().pipes, ...newPipes],
      })
      return newNodes.map((n) => n.id)
    },

    copyNode: (nodeId) => {
      const node = get().nodes.find((n) => n.id === nodeId)
      if (!node) return

      // Deep clone the node for clipboard
      const clonedNode = JSON.parse(JSON.stringify(node))
      set({ clipboard: clonedNode })
    },

    copyNodesToClipboard: (nodeIds) => {
      const { nodes, pipes } = get()
      const selectedSet = new Set(nodeIds)
      const selectedNodes = nodes.filter((n) => selectedSet.has(n.id))
      if (selectedNodes.length === 0) return

      const selectedPipes = pipes.filter(
        (p) => selectedSet.has(p.source) && selectedSet.has(p.target),
      )

      const payload = JSON.stringify({
        _dataflow: true,
        nodes: JSON.parse(JSON.stringify(selectedNodes)),
        pipes: JSON.parse(JSON.stringify(selectedPipes)),
      })

      navigator.clipboard.writeText(payload).catch(() => {})

      // Also keep single-node internal clipboard for same-diagram fallback
      if (selectedNodes.length === 1) {
        set({ clipboard: JSON.parse(JSON.stringify(selectedNodes[0])) })
      }
    },

    pasteNodesFromClipboard: (json, center) => {
      let parsed: { _dataflow?: boolean; nodes?: AnyNode[]; pipes?: Pipe[] }
      try {
        parsed = JSON.parse(json)
      } catch {
        return []
      }
      if (!parsed._dataflow || !Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
        return []
      }

      // Only snapshot once we know the payload is really pasteable — a failed
      // paste must not pollute undo history or mark the document dirty
      pushSnapshot()

      const srcNodes: AnyNode[] = parsed.nodes
      const srcPipes: Pipe[] = parsed.pipes || []
      const srcIds = new Set(srcNodes.map((n) => n.id))

      // Children of copied groups have parent-relative positions — only
      // top-level pasted nodes participate in centering and get re-positioned
      const isTopLevel = (n: AnyNode) => !n.parentId || !srcIds.has(n.parentId)
      const topLevelSrc = srcNodes.filter(isTopLevel)
      const cx = topLevelSrc.reduce((s, n) => s + n.position.x, 0) / topLevelSrc.length
      const cy = topLevelSrc.reduce((s, n) => s + n.position.y, 0) / topLevelSrc.length

      // Map old IDs → new IDs
      const idMap = new Map<string, string>()
      const newNodes: AnyNode[] = srcNodes.map((node) => {
        const newId = generateNodeId()
        idMap.set(node.id, newId)
        const clonedData = JSON.parse(JSON.stringify(node.data))
        const newNode = {
          id: newId,
          type: node.type,
          position: isTopLevel(node)
            ? {
                x: center.x + (node.position.x - cx),
                y: center.y + (node.position.y - cy),
              }
            : { ...node.position },
          data: clonedData,
          ...(node.style ? { style: JSON.parse(JSON.stringify(node.style)) } : {}),
          ...(node.parentId && idMap.has(node.parentId)
            ? { parentId: idMap.get(node.parentId) }
            : {}),
        } as AnyNode
        ensureNodeFieldIds(newNode)
        return newNode
      })

      const newPipes: Pipe[] = srcPipes
        .filter((p) => idMap.has(p.source) && idMap.has(p.target))
        .map((pipe) => ({
          ...JSON.parse(JSON.stringify(pipe)),
          id: generatePipeId(),
          source: idMap.get(pipe.source)!,
          target: idMap.get(pipe.target)!,
        }))

      set({
        nodes: [...get().nodes, ...newNodes],
        pipes: [...get().pipes, ...newPipes],
      })

      return newNodes.map((n) => n.id)
    },

    pasteNode: (position) => {
      const { clipboard } = get()
      if (!clipboard) return null

      pushSnapshot()
      const newId = generateNodeId()
      const offset = { x: 50, y: 50 }

      // Deep clone the data; keep style (persisted size).
      // With no explicit position we paste next to the original, so a child
      // node keeps its parentId (positions are parent-relative). An explicit
      // position is absolute canvas coordinates, so the copy is unparented.
      const clonedData = JSON.parse(JSON.stringify(clipboard.data))
      const parentAlive = clipboard.parentId && get().nodes.some((n) => n.id === clipboard.parentId)

      const newNode: AnyNode = {
        id: newId,
        type: clipboard.type,
        position: position || {
          x: clipboard.position.x + offset.x,
          y: clipboard.position.y + offset.y,
        },
        data: clonedData,
        ...(clipboard.style ? { style: JSON.parse(JSON.stringify(clipboard.style)) } : {}),
        ...(!position && parentAlive ? { parentId: clipboard.parentId } : {}),
      }

      set({
        nodes: [...get().nodes, newNode],
      })

      return newId
    },

    removeNode: (nodeId) => {
      get().removeSelection([nodeId])
    },

    removeSelection: (nodeIds, pipeIds = []) => {
      const state = get()
      const removedSet = new Set(nodeIds.filter((id) => state.nodes.some((n) => n.id === id)))
      const removedPipeSet = new Set(pipeIds)
      if (removedSet.size === 0 && removedPipeSet.size === 0) return

      pushSnapshot()
      const nodes = get().nodes

      // Surviving children of removed groups get reparented to their nearest
      // surviving ancestor; their position is re-expressed relative to it
      // (or as absolute canvas coordinates when no ancestor survives).
      const survivors = nodes
        .filter((node) => !removedSet.has(node.id))
        .map((node) => {
          if (!node.parentId || !removedSet.has(node.parentId)) return node

          let ancestorId: string | undefined = node.parentId
          const visited = new Set<string>()
          while (ancestorId && removedSet.has(ancestorId) && !visited.has(ancestorId)) {
            visited.add(ancestorId)
            ancestorId = nodes.find((n) => n.id === ancestorId)?.parentId
          }
          const abs = absolutePositionOf(node, nodes)
          const ancestor = ancestorId ? nodes.find((n) => n.id === ancestorId) : undefined
          const ancestorAbs = ancestor ? absolutePositionOf(ancestor, nodes) : { x: 0, y: 0 }
          return {
            ...node,
            parentId: ancestor ? ancestor.id : undefined,
            extent: undefined,
            position: { x: abs.x - ancestorAbs.x, y: abs.y - ancestorAbs.y },
          }
        })

      set({
        nodes: survivors,
        pipes: get().pipes.filter(
          (pipe) => !removedPipeSet.has(pipe.id) && !removedSet.has(pipe.source) && !removedSet.has(pipe.target)
        ),
      })
    },

    updateJsonNodeFields: (nodeId, fields, opts) => {
      pushSnapshot()
      set({
        nodes: get().nodes.map((node) =>
          node.id === nodeId && isJsonNode(node)
            ? { ...node, data: { ...node.data, fields } }
            : node
        ),
        pipes: remapPipeHandles(get().pipes, nodeId, opts?.renamedPaths ?? []),
      })
    },

    updateNodeName: (nodeId, name) => {
      pushSnapshot()
      set({
        nodes: get().nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, name } }
            : node
        ),
      })
    },

    updateNodeUrl: (nodeId, url) => {
      pushSnapshot()
      set({
        nodes: get().nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, url: url || undefined } }
            : node
        ),
      })
    },

    updateProcessNode: (nodeId, data, opts) => {
      pushSnapshot()
      set({
        nodes: get().nodes.map((node) =>
          node.id === nodeId && isProcessNode(node)
            ? { ...node, data: { ...node.data, ...data } }
            : node
        ),
        pipes: remapPipeHandles(get().pipes, nodeId, opts?.renamedPaths ?? []),
      })
    },

    updateNoteNode: (nodeId, data) => {
      pushSnapshot()
      set({
        nodes: get().nodes.map((node) =>
          node.id === nodeId && isNoteNode(node)
            ? { ...node, data: { ...node.data, ...data } }
            : node
        ),
      })
    },

    updateResourceNode: (nodeId, data) => {
      pushSnapshot()
      set({
        nodes: get().nodes.map((node) =>
          node.id === nodeId && isResourceNode(node)
            ? { ...node, data: { ...node.data, ...data } }
            : node
        ),
      })
    },

    updateGroupNode: (nodeId, data) => {
      pushSnapshot()
      set({
        nodes: get().nodes.map((node) =>
          node.id === nodeId && isGroupNode(node)
            ? { ...node, data: { ...node.data, ...data } }
            : node
        ),
      })
    },

    updateIconNode: (nodeId, data) => {
      pushSnapshot()
      set({
        nodes: get().nodes.map((node) =>
          node.id === nodeId && isIconNode(node)
            ? { ...node, data: { ...node.data, ...data } }
            : node
        ),
      })
    },

    updateShapeNode: (nodeId, data) => {
      pushSnapshot()
      set({
        nodes: get().nodes.map((node) =>
          node.id === nodeId && isShapeNode(node)
            ? { ...node, data: { ...node.data, ...data } }
            : node
        ),
      })
    },

    updatePipe: (pipeId, data) => {
      pushSnapshot()
      set({
        pipes: get().pipes.map((pipe) =>
          pipe.id === pipeId
            ? { ...pipe, data: { ...pipe.data, ...data } as PipeData }
            : pipe
        ),
      })
    },

    // Drag an existing pipe's endpoint onto another handle (React Flow's built-in
    // reconnect, card 04692d7c). shouldReplaceId: false keeps the pipe's id, so
    // data (description, color, labelOffset...) survives untouched and undo
    // snapshots keep referring to the same edge.
    reconnectPipe: (oldPipe, newConnection) => {
      if (!newConnection.source || !newConnection.target) return
      const current = get().pipes.find((p) => p.id === oldPipe.id)
      if (!current) return
      // Dropping back on the very same handles is a no-op — don't burn an undo step
      if (
        current.source === newConnection.source &&
        current.target === newConnection.target &&
        (current.sourceHandle ?? null) === (newConnection.sourceHandle ?? null) &&
        (current.targetHandle ?? null) === (newConnection.targetHandle ?? null)
      ) return
      pushSnapshot()
      set({
        pipes: reconnectEdge(current, newConnection, get().pipes, { shouldReplaceId: false }) as Pipe[],
      })
    },

    setHoveredNode: (nodeId) => {
      if (get().hoveredNodeId !== nodeId) set({ hoveredNodeId: nodeId })
    },

    clearHoveredNode: (nodeId) => {
      if (get().hoveredNodeId === nodeId) set({ hoveredNodeId: null })
    },

    setRawEditNode: (nodeId) => {
      set({ rawEditNodeId: nodeId })
    },

    updateNodeData: (nodeId, data) => {
      pushSnapshot()
      set({
        nodes: get().nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data }
            : node
        ),
      })
    },

    generateSetOperation: (nodeIdA, nodeIdB, operation) => {
      const state = get()
      const nodeA = state.nodes.find((n) => n.id === nodeIdA)
      const nodeB = state.nodes.find((n) => n.id === nodeIdB)
      if (!nodeA || !nodeB || !isJsonNode(nodeA) || !isJsonNode(nodeB)) return null

      pushSnapshot()

      const resultFields = applySetOperation(nodeA.data.fields, nodeB.data.fields, operation)
      const symbol = SET_OP_SYMBOLS[operation]
      const name = `${nodeA.data.name} ${symbol} ${nodeB.data.name}`

      // Position: centered below the two source nodes
      const midX = (nodeA.position.x + nodeB.position.x) / 2
      const maxY = Math.max(nodeA.position.y, nodeB.position.y)
      const position = { x: midX, y: maxY + 250 }

      const id = generateNodeId()
      const newNode: Node<JsonNodeData> = {
        id,
        type: 'json',
        position,
        data: { name, fields: resultFields },
      }

      // Create pipes from source nodes to result node (node-level)
      const pipeA: Pipe = {
        id: generatePipeId(),
        type: 'dataflow',
        source: nodeIdA,
        target: id,
        sourceHandle: 'node-bottom',
        targetHandle: 'node-top',
        data: { name: '', description: symbol },
        style: { stroke: '#94a3b8', strokeWidth: 2, strokeDasharray: '8 4' },
      }
      const pipeB: Pipe = {
        id: generatePipeId(),
        type: 'dataflow',
        source: nodeIdB,
        target: id,
        sourceHandle: 'node-bottom',
        targetHandle: 'node-top',
        data: { name: '', description: symbol },
        style: { stroke: '#94a3b8', strokeWidth: 2, strokeDasharray: '8 4' },
      }

      set({
        nodes: [...state.nodes, newNode],
        pipes: [...state.pipes, pipeA, pipeB],
      })

      return id
    },

    exportGraph: () => {
      const { nodes, pipes } = get()
      // Strip transient React Flow/UI fields before serialization — they are
      // runtime state and only add noise (and diffs) to saved files
      const cleanNodes = nodes.map(node => {
        const { selected: _sel, dragging: _drag, measured: _meas, ...rest } = node as AnyNode & { measured?: unknown }
        if (isResourceNode(node) && node.data.uploading !== undefined) {
          const { uploading: _, ...cleanData } = node.data
          return { ...rest, data: cleanData }
        }
        return rest
      })
      const cleanPipes = pipes.map(pipe => {
        const { selected: _sel, ...rest } = pipe
        return rest
      })
      return JSON.stringify({ nodes: cleanNodes, pipes: cleanPipes }, null, 2)
    },

    importSummary: null,

    setImportSummary: (summary) => set({ importSummary: summary }),

    importGraph: (json, viewportCenter, opts) => {
      const replace = opts?.replace ?? false
      // Parse and convert BEFORE touching history — a failed import must not
      // push a snapshot (which would mark the document dirty and make the
      // first undo restore a pre-import state the user never saw)
      let parsed
      try {
        // In replace mode the canvas content is discarded, so nothing is
        // "taken": the document's own ids survive verbatim (ID stability rule,
        // importFormats.ts header). In merge mode the current nodes/pipes seed
        // the collision set, so only clashing ids get re-minted.
        parsed = parseImportedGraph(JSON.parse(json), {
          generateNodeId,
          generatePipeId,
          existingNodes: replace ? [] : get().nodes,
          existingPipes: replace ? [] : get().pipes,
          viewportCenter,
          // Replace wins if a caller ever sets both: an open must never gain paste
          // semantics (importFormats.ts file header).
          sameIdMeansSameNode: !replace && (opts?.sameIdMeansSameNode ?? false),
        })
      } catch (e) {
        console.error('Failed to import graph:', e)
        return null
      }
      if (!parsed) return null

      const result: ImportResult = {
        addedNodes: parsed.nodes.length,
        addedPipes: parsed.pipes.length,
        skippedNodes: parsed.skippedNodes,
        skippedPipes: parsed.skippedPipes,
        droppedPipes: parsed.droppedPipes,
        format: 'json',
        updatedNodes: 0,
        degradedLinks: 0,
        droppedMembers: [],
        ignoredLines: [],
      }

      if (replace) {
        // Initial document load: replace content wholesale, no undo entry
        set({ nodes: parsed.nodes, pipes: parsed.pipes })
        resetHistory()
      } else if (parsed.nodes.length > 0 || parsed.pipes.length > 0) {
        pushSnapshot()
        // A merge-import IS a paste: the new batch arrives selected and everything
        // else is deselected, exactly as the DSL channel does (editPlan.ts), so the
        // selection bar's arrange buttons work on what just landed regardless of
        // which format the model answered in. Selection is transient UI state —
        // exportGraph strips it — so this never reaches a saved document. When only
        // pipes landed there is no batch to select and the selection is left alone.
        const incoming = parsed.nodes.length > 0
          ? parsed.nodes.map((n) => ({ ...n, selected: true }))
          : parsed.nodes
        const current = parsed.nodes.length > 0
          ? get().nodes.map((n) => (n.selected ? ({ ...n, selected: false } as AnyNode) : n))
          : get().nodes
        set({
          nodes: [...current, ...incoming],
          pipes: [...get().pipes, ...parsed.pipes],
        })
      }
      // An import that adds nothing (every node was already here — what re-importing the
      // same payload does) touches neither the graph nor the history: no snapshot, no
      // dirty flag. That is what makes importing twice equal importing once.
      return result
    },

    applyEditPlan: (plan, viewport) => {
      const applied = buildEditApplication(plan, {
        nodes: get().nodes,
        pipes: get().pipes,
        generatePipeId,
        viewport,
      })

      const touchedGraph =
        applied.addedNodes > 0 || applied.updatedNodes > 0 || applied.addedPipes > 0
      if (touchedGraph) {
        // One paste is one undo entry. The snapshot is pushed only now, after the plan is
        // known to change something: a paste that changes nothing must not dirty the
        // document or put an empty step in the history.
        pushSnapshot()
        set({ nodes: sortNodesParentsFirst(applied.nodes) as AnyNode[], pipes: applied.pipes })
      }

      return {
        addedNodes: applied.addedNodes,
        addedPipes: applied.addedPipes,
        skippedNodes: 0,
        skippedPipes: applied.skippedPipes,
        droppedPipes: applied.droppedPipes,
        format: 'dsl',
        updatedNodes: applied.updatedNodes,
        degradedLinks: applied.degradedLinks,
        droppedMembers: applied.droppedMembers,
        ignoredLines: applied.ignoredLines,
      }
    },

    clearGraph: () => {
      pushSnapshot()
      set({ nodes: [], pipes: [] })
    },

    arrangeSelection: (op) => {
      const result = arrangeNodes(op, get().nodes.filter((n) => n.selected))
      if (result.movedIds.length === 0) {
        // Nothing would move — no snapshot, or undo grows a step that restores nothing.
        return { moved: 0, skipped: result.skippedIds.length }
      }
      pushSnapshot()
      set({
        nodes: get().nodes.map((n) => {
          const next = result.positions.get(n.id)
          return next && (next.x !== n.position.x || next.y !== n.position.y)
            ? { ...n, position: next }
            : n
        }),
      })
      return { moved: result.movedIds.length, skipped: result.skippedIds.length }
    },
  }})
}

// Default store instance for standalone usage
export const useFlowStore = createFlowStore()
