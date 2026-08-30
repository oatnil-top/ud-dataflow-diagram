import { useCallback, useState, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  SelectionMode,
  ConnectionMode,
  ReactFlowProvider,
  useReactFlow,
  getNodesBounds,
  getViewportForBounds,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { Trash2, BotMessageSquare } from 'lucide-react'
import { graphToText } from './utils/graphToText'
import { useDataflowHost, useNotify } from './host'
import { useTranslation } from 'react-i18next'
import { useHighlightStore, HIGHLIGHT_COLORS } from './hooks/useHighlight'
import IconSidebar from './components/icons/IconSidebar'
import Toolbar from './components/panels/Toolbar'
import PipeMenu from './components/PipeMenu'
import ContextMenu from './components/ContextMenu'
import CanvasMenu from './components/CanvasMenu'
import JsonImportPanel from './components/panels/JsonImportPanel'
import JsonlImportPanel from './components/panels/JsonlImportPanel'
import GraphImportPanel from './components/panels/GraphImportPanel'
import AIGeneratePanel from './components/panels/AIGeneratePanel'
import ProcessEditorPanel from './components/panels/ProcessEditorPanel'
import NodeRawEditor from './components/panels/NodeRawEditor'
import SetOperationToolbar from './components/panels/SetOperationToolbar'
import PipeMarkerDefs from './components/PipeMarkerDefs'
import { createFlowStore, type FlowStore } from './store/flowStore'
import { FlowStoreContext } from './store/flowStoreContext'
import { DiagramContext, type DiagramContextValue } from './diagramContext'
import { useCanvasShortcuts } from './hooks/useCanvasShortcuts'
import { useCanvasPaste } from './hooks/useCanvasPaste'
import { computeGroupDropUpdates } from './utils/groupDrop'
import { stripSizeWhenCollapsed } from './utils/collapsedNodeSize'
import { nodeTypes, edgeTypes } from './registry'


interface FlowProps {
  store: FlowStore
  // Embed mode hides export/import/example buttons
  embedMode?: boolean
}

function Flow({ store, embedMode }: FlowProps) {
  const nodes = store((state) => state.nodes)
  const pipes = store((state) => state.pipes)
  const onNodesChange = store((state) => state.onNodesChange)
  const onPipesChange = store((state) => state.onPipesChange)
  const onConnect = store((state) => state.onConnect)
  const reconnectPipe = store((state) => state.reconnectPipe)
  const copyNodesToClipboard = store((state) => state.copyNodesToClipboard)
  const pasteNode = store((state) => state.pasteNode)
  const pasteNodesFromClipboard = store((state) => state.pasteNodesFromClipboard)
  const addJsonNode = store((state) => state.addJsonNode)
  const addNoteNode = store((state) => state.addNoteNode)
  const addResourceNode = store((state) => state.addResourceNode)
  const addGroupNode = store((state) => state.addGroupNode)
  const addIconNode = store((state) => state.addIconNode)
  const addShapeNode = store((state) => state.addShapeNode)
  const removeSelection = store((state) => state.removeSelection)
  const duplicateNodes = store((state) => state.duplicateNodes)
  const updateResourceNode = store((state) => state.updateResourceNode)
  const undo = store((state) => state.undo)
  const redo = store((state) => state.redo)
  const canUndo = store((state) => state.canUndo)
  const canRedo = store((state) => state.canRedo)
  const takeSnapshot = store((state) => state.takeSnapshot)

  // Collapsed note/resource nodes render without their persisted size —
  // see stripSizeWhenCollapsed for why the store keeps it and the render drops it
  const renderNodes = useMemo(() => stripSizeWhenCollapsed(nodes), [nodes])

  const selectedNodes = useMemo(() => nodes.filter((n) => n.selected), [nodes])
  const selectedNodeIds = useMemo(() => selectedNodes.map((n) => n.id), [selectedNodes])
  const selectedEdges = useMemo(() => pipes.filter((p) => p.selected), [pipes])
  const selectionCount = selectedNodes.length + selectedEdges.length

  const fieldColorMap = useHighlightStore((state) => state.fieldColorMap)
  const pipeColorMap = useHighlightStore((state) => state.pipeColorMap)
  const selectNode = useHighlightStore((state) => state.selectNode)
  const clearSelection = useHighlightStore((state) => state.clearSelection)
  const { screenToFlowPosition, getNodes } = useReactFlow()

  // Where on the edge the user last clicked, in FLOW coordinates so the pipe
  // menu anchored to it follows pan/zoom (card 04692d7c — the menu used to sit
  // at the midpoint between the two nodes, hundreds of px from a click near
  // either end of a long edge)
  const [edgeClickAnchor, setEdgeClickAnchor] = useState<{ pipeId: string; x: number; y: number } | null>(null)
  // Hide the pipe menu while an endpoint is being dragged to a new handle
  const [isReconnecting, setIsReconnecting] = useState(false)

  // Toggle selection: clicking an already-selected node deselects it
  const handleNodeClick = useCallback((event: React.MouseEvent, node: import('@xyflow/react').Node) => {
    // Highlight the pipes touching this node (card efd95471 — master 13:50: clicking a node
    // should give the same effect field rows already give). Deliberately at the canvas level
    // and not inside any node component: every type in `nodeTypes` goes through this one
    // handler, which is what makes it general instead of seven patches. A field row's own
    // click stops propagation (JsonNode/ProcessNode), so a field click still wins its row.
    selectNode(node.id, pipes, event.ctrlKey || event.metaKey)
    if (node.selected && selectedNodes.length === 1) {
      // Deselect the node by applying a selection change
      onNodesChange([{ id: node.id, type: 'select', selected: false }])
    }
  }, [selectNode, pipes, selectedNodes.length, onNodesChange])

  // Toggle selection for edges: clicking an already-selected edge deselects it
  const handleEdgeClick = useCallback((event: React.MouseEvent, edge: import('@xyflow/react').Edge) => {
    // snapToGrid: false — the default snapping is for placing nodes; a menu
    // anchor snapped to the grid sits up to half a cell away from the pointer
    setEdgeClickAnchor({
      pipeId: edge.id,
      ...screenToFlowPosition({ x: event.clientX, y: event.clientY }, { snapToGrid: false }),
    })
    if (edge.selected && selectedEdges.length === 1) {
      onPipesChange([{ id: edge.id, type: 'select', selected: false }])
    }
  }, [selectedEdges.length, onPipesChange, screenToFlowPosition])

  // Endpoint dropped on another handle — commit through the store (one undo step).
  // Dropped on empty canvas, the library never calls this and the edge stays put.
  const handleReconnect = useCallback((oldEdge: import('@xyflow/react').Edge, newConnection: import('@xyflow/react').Connection) => {
    reconnectPipe(oldEdge as import('./store/flowStore').Pipe, newConnection)
    // The old click point is on the old geometry — let the menu fall back to
    // the reconnected edge's own midpoint instead
    setEdgeClickAnchor(null)
  }, [reconnectPipe])

  const handleDeleteSelection = useCallback(() => {
    // Batch: one undo entry restores the whole selection
    removeSelection(
      selectedNodes.map((n) => n.id),
      selectedEdges.map((e) => e.id),
    )
  }, [selectedNodes, selectedEdges, removeSelection])

  const { t } = useTranslation()
  const host = useDataflowHost()
  const notify = useNotify()

  const handleExportSelection = useCallback(() => {
    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id))
    // Include edges where both source and target are in the selection
    const relevantEdges = pipes.filter(
      (p) => selectedNodeIds.has(p.source) && selectedNodeIds.has(p.target)
    )
    const text = graphToText(selectedNodes, relevantEdges)
    navigator.clipboard.writeText(text)
    notify('info', t('resources.dataflow.copiedForAI'))
  }, [selectedNodes, pipes, t, notify])

  // Compute highlighted pipes - a pipe is highlighted if both endpoints are in the color map
  // Pipes with existing styles (note/image dashed lines) preserve their style unless highlighted
  const styledEdges = useMemo(() => {
    return pipes.map((pipe) => {
      // Selection-first endpoints (owner, 2026-08-27: 选中线条才显示线条的
      // handler): an edge's ends are grabbable only while the edge is
      // SELECTED — reconnectable gates React Flow's invisible r=10 grab
      // circles, and index.css shows the affordance dots on .selected only.
      // Reconnecting is click-the-edge, then drag an end. Side effect worth
      // having: unselected edges' invisible grab circles no longer sit on
      // top of node handles stealing clicks near endpoints.
      //
      // zIndex 1001 while selected: nodes paint above edges (selected nodes
      // at 1000), so without this the node's connection handle would win the
      // overlap strip at the endpoint and the reconnect grab could not be
      // hit there (measured on card 5ec0d836 round 11). Lifting the SELECTED
      // edge above everything makes "the element you selected wins its own
      // handles" hold — draw.io's rule. Accepted trade, stated: while an
      // edge is selected, its 20px interaction band also paints above nodes,
      // so a click near the selected edge re-hits the edge rather than the
      // node under it; a pane click deselects and restores normal order.
      const base = { ...pipe, reconnectable: !!pipe.selected, zIndex: pipe.selected ? 1001 : 0 }
      // ONE highlight style; two ways an edge gets selected into it (card efd95471).
      //
      //  - a FIELD selection colours handles, and an edge is lit when BOTH its ends are
      //    coloured. Safe only because the field BFS closes over the edges it walks, so it
      //    can never colour one end of an edge without the other.
      //  - a NODE selection names pipe ids outright. It has to: it stops at one ring, so it
      //    would half-colour the edges at its boundary, and two selections each colouring
      //    one end of some unrelated edge would light it. Naming pipes cannot do that, and
      //    it also keeps node clicks out of fieldColorMap's OTHER reader (field-row tint).
      //
      // Same class, same palette, same width — the visual is this one branch, not a copy.
      const sourceColor = fieldColorMap.get(`${pipe.source}:${pipe.sourceHandle}`)
      const targetColor = fieldColorMap.get(`${pipe.target}:${pipe.targetHandle}`)
      const fieldColorIndex = sourceColor !== undefined && targetColor !== undefined ? sourceColor : undefined
      // Named-directly wins over inferred-from-both-ends when a pipe is somehow both.
      const colorIndex = pipeColorMap.get(pipe.id) ?? fieldColorIndex

      if (colorIndex !== undefined) {
        const color = HIGHLIGHT_COLORS[colorIndex % HIGHLIGHT_COLORS.length]
        return {
          ...base,
          className: 'edge-highlighted',
          style: { stroke: color, strokeWidth: 3, filter: `drop-shadow(0 0 6px ${color})` },
        }
      }
      // Preserve existing pipe styles (dashed note/resource connections)
      if (pipe.style) return base
      return { ...base, className: '', style: undefined }
    })
  }, [pipes, fieldColorMap, pipeColorMap])

  const [jsonImportOpen, setJsonImportOpen] = useState(false)
  const [jsonlImportOpen, setJsonlImportOpen] = useState(false)
  const [graphImportOpen, setGraphImportOpen] = useState(false)
  const [aiGenerateOpen, setAiGenerateOpen] = useState(false)
  const [processEditorOpen, setProcessEditorOpen] = useState(false)
  const [newNodePosition, setNewNodePosition] = useState({ x: 100, y: 100 })
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; flowPosition: { x: number; y: number } } | null>(null)
  const [iconSidebarOpen, setIconSidebarOpen] = useState(true)  // Open by default
  const [lastCanvasClick, setLastCanvasClick] = useState<{ x: number; y: number } | null>(null)

  // Keyboard shortcuts: copy, duplicate, undo, redo
  useCanvasShortcuts({ getNodes, copyNodesToClipboard, duplicateNodes, undo, redo })

  // Paste handler — images into resource nodes, cross-diagram JSON, resource:// URIs, note fallback
  useCanvasPaste({
    getNodes,
    screenToFlowPosition,
    pasteNode,
    pasteNodesFromClipboard,
    updateResourceNode,
    addResourceNode,
    addNoteNode,
    t,
  })

  // Snapshot before drag so position changes can be undone
  const handleNodeDragStart = useCallback(() => {
    takeSnapshot()
  }, [takeSnapshot])

  // Drop node(s) into/out of groups on drag stop
  // When multiple nodes are selected, React Flow passes all dragged nodes as the third parameter
  const handleNodeDragStop = useCallback((_event: React.MouseEvent, _draggedNode: import('@xyflow/react').Node, draggedNodes: import('@xyflow/react').Node[]) => {
    const updates = computeGroupDropUpdates(getNodes(), draggedNodes)

    if (updates.size === 0) return

    // Apply all updates in a single setState call
    store.setState((state) => ({
      nodes: state.nodes.map((n) => {
        const update = updates.get(n.id)
        if (!update) return n
        return {
          ...n,
          parentId: update.parentId,
          position: update.position,
          ...(update.clearExtent ? { extent: undefined } : {}),
        }
      }),
    }))
  }, [getNodes, store])

  const handleOpenJsonImport = useCallback(() => {
    // Place new node at center of viewport
    const position = screenToFlowPosition({
      x: window.innerWidth / 2 - 100,
      y: window.innerHeight / 2 - 100,
    })
    setNewNodePosition(position)
    setJsonImportOpen(true)
  }, [screenToFlowPosition])

  // Right-click context menu
  const handleContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault()
    const flowPosition = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })
    setLastCanvasClick(flowPosition) // Track for element placement
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      flowPosition,
    })
  }, [screenToFlowPosition])

  const handleCreateEmptyNode = useCallback(() => {
    if (contextMenu) {
      addJsonNode('New Node', [], contextMenu.flowPosition)
    }
  }, [contextMenu, addJsonNode])

  const handleCreateNoteFromMenu = useCallback(() => {
    if (contextMenu) {
      addNoteNode('Note', '', contextMenu.flowPosition)
    }
  }, [contextMenu, addNoteNode])

  const handleCreateResourceFromMenu = useCallback(() => {
    if (contextMenu) {
      addResourceNode('Resource', undefined, contextMenu.flowPosition)
    }
  }, [contextMenu, addResourceNode])

  const handleCreateGroupFromMenu = useCallback(() => {
    if (contextMenu) {
      addGroupNode('Group', contextMenu.flowPosition)
    }
  }, [contextMenu, addGroupNode])

  const handleCreateShapeFromMenu = useCallback(() => {
    if (contextMenu) {
      addShapeNode('Shape', 'rectangle', contextMenu.flowPosition)
    }
  }, [contextMenu, addShapeNode])

  // handleCreateIconFromMenu removed — sidebar handles icon creation

  const handleImportJsonFromMenu = useCallback(() => {
    if (contextMenu) {
      setNewNodePosition(contextMenu.flowPosition)
      setJsonImportOpen(true)
    }
  }, [contextMenu])

  const handleImportJsonlFromMenu = useCallback(() => {
    if (contextMenu) {
      setNewNodePosition(contextMenu.flowPosition)
      setJsonlImportOpen(true)
    }
  }, [contextMenu])

  // Import graph JSON - opens the panel
  const handleImportGraph = useCallback(() => {
    setGraphImportOpen(true)
  }, [])

  // AI generate - opens the panel.
  // Offered only when the host has an `ai` member (host.ts): with none there is nothing
  // behind the button, and "Copy prompt" stays as the way to drive a model by hand.
  const handleAIGenerate = useCallback(() => {
    setAiGenerateOpen(true)
  }, [])
  const onAIGenerate = host.ai ? handleAIGenerate : undefined

  // Get viewport center in flow coordinates (for placing imported nodes)
  const getViewportCenter = useCallback(() => {
    return screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    })
  }, [screenToFlowPosition])

  // Canvas menu handlers (for non-context menu usage)
  const handleCanvasCreateNode = useCallback(() => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2 - 100,
      y: window.innerHeight / 2 - 100,
    })
    addJsonNode('New Node', [], position)
  }, [screenToFlowPosition, addJsonNode])

  const handleCanvasCreateNote = useCallback(() => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2 - 100,
      y: window.innerHeight / 2 - 100,
    })
    addNoteNode('Note', '', position)
  }, [screenToFlowPosition, addNoteNode])

  const handleCanvasCreateResource = useCallback(() => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2 - 100,
      y: window.innerHeight / 2 - 100,
    })
    addResourceNode('Resource', undefined, position)
  }, [screenToFlowPosition, addResourceNode])

  const handleCanvasCreateGroup = useCallback(() => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2 - 200,
      y: window.innerHeight / 2 - 150,
    })
    addGroupNode('Group', position)
  }, [screenToFlowPosition, addGroupNode])

  const handleCanvasCreateShape = useCallback(() => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2 - 80,
      y: window.innerHeight / 2 - 40,
    })
    addShapeNode('Shape', 'rectangle', position)
  }, [screenToFlowPosition, addShapeNode])

  // Helper: get placement position — use last canvas click, or viewport center as fallback
  const getPlacementPosition = useCallback((offsetX = 0, offsetY = 0) => {
    if (lastCanvasClick) {
      return { x: lastCanvasClick.x + offsetX, y: lastCanvasClick.y + offsetY }
    }
    return screenToFlowPosition({
      x: window.innerWidth / 2 + offsetX,
      y: window.innerHeight / 2 + offsetY,
    })
  }, [lastCanvasClick, screenToFlowPosition])

  // Add icon from sidebar — place at last click or center
  const handleSidebarAddIcon = useCallback((name: string, icon: string) => {
    addIconNode(name, icon, getPlacementPosition())
  }, [addIconNode, getPlacementPosition])

  // Add group from sidebar
  const handleSidebarAddGroup = useCallback((name: string, icon?: string, stylePreset?: string) => {
    addGroupNode(name, getPlacementPosition(), undefined, { icon, stylePreset })
  }, [addGroupNode, getPlacementPosition])

  // Add data node from sidebar
  const handleSidebarAddNode = useCallback(() => {
    addJsonNode('New Node', [], getPlacementPosition())
  }, [addJsonNode, getPlacementPosition])

  // Add note from sidebar
  const handleSidebarAddNote = useCallback(() => {
    addNoteNode('Note', '', getPlacementPosition())
  }, [addNoteNode, getPlacementPosition])

  // Add shape from sidebar
  const handleSidebarAddShape = useCallback(() => {
    addShapeNode('Shape', 'rectangle', getPlacementPosition())
  }, [addShapeNode, getPlacementPosition])

  const handleCanvasImportJson = useCallback(() => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2 - 100,
      y: window.innerHeight / 2 - 100,
    })
    setNewNodePosition(position)
    setJsonImportOpen(true)
  }, [screenToFlowPosition])

  const handleCanvasImportJsonl = useCallback(() => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2 - 100,
      y: window.innerHeight / 2 - 100,
    })
    setNewNodePosition(position)
    setJsonlImportOpen(true)
  }, [screenToFlowPosition])

  return (
    <FlowStoreContext.Provider value={store}>
      <div className="w-full h-full relative">
        <ReactFlow
          nodes={renderNodes}
          edges={styledEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onPipesChange}
          onConnect={onConnect}
          onReconnect={handleReconnect}
          onReconnectStart={() => setIsReconnecting(true)}
          onReconnectEnd={() => setIsReconnecting(false)}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onNodeDragStart={handleNodeDragStart}
          onNodeDragStop={handleNodeDragStop}
          onPaneContextMenu={handleContextMenu}
          onPaneClick={(event) => {
            setContextMenu(null)
            clearSelection()
            // Track last click position for element placement
            setLastCanvasClick(screenToFlowPosition({ x: event.clientX, y: event.clientY }))
          }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          minZoom={0.05}
          maxZoom={4}
          snapToGrid
          snapGrid={[15, 15]}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          connectionMode={ConnectionMode.Loose}
          panOnDrag={[1, 2]}
          /* Figma-style viewport feel (owner, 2026-08-27): two-finger
             trackpad scroll PANS the canvas, pinch zooms. macOS reports a
             pinch as ctrl+wheel, which zoomOnPinch (default on) handles —
             so with plain scroll flipped to pan, zooming stays available
             everywhere: pinch on trackpads, Ctrl+wheel (same event shape)
             or ⌘+wheel (zoomActivationKeyCode) on mice, and the +/- canvas
             controls. Deliberate trade: a plain mouse wheel now pans
             vertically instead of zooming, exactly as Figma does. */
          panOnScroll
          zoomOnScroll={false}
          deleteKeyCode={['Backspace', 'Delete']}
          defaultEdgeOptions={{
            type: 'dataflow',
            animated: false,
            selectable: true,
            style: { stroke: '#94a3b8', strokeWidth: 1.5 },
          }}
        >
          <Background gap={24} size={1} color="#e8e8e8" />
          <Controls />
          <PipeMarkerDefs />
          {/* Pipe menu only for a single selected edge — with a mixed or multi
              selection the batch toolbar below is the one control that shows */}
          {selectedEdges.length === 1 && selectedNodes.length === 0 && !isReconnecting && (
            <PipeMenu clickAnchor={edgeClickAnchor} />
          )}
          <MiniMap
            nodeStrokeWidth={3}
            zoomable
            pannable
            style={{ backgroundColor: '#f8fafc' }}
            nodeColor={(node) => {
              if (node.type === 'json') return '#1e293b' // slate-800 (dark node bg)
              if (node.type === 'process') return '#7c3aed' // violet-600
              if (node.type === 'note') return '#d97706' // amber-600
              if (node.type === 'resource') return '#0ea5e9' // sky-500
              if (node.type === 'group') return '#93c5fd' // blue-300
              return '#64748b'
            }}
          />
        </ReactFlow>

        {/* Only show toolbar in standalone mode */}
        {!embedMode && (
          <Toolbar
            onOpenJsonImport={handleOpenJsonImport}
            onAIGenerate={onAIGenerate}
            embedMode={embedMode}
            getViewportCenter={getViewportCenter}
          />
        )}

        {/* Selection action buttons */}
        {selectionCount > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
            <button
              onClick={handleExportSelection}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg shadow-lg transition-colors text-sm font-medium"
            >
              <BotMessageSquare size={14} />
              Export {selectionCount} items
            </button>
            <button
              onClick={handleDeleteSelection}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-lg transition-colors text-sm font-medium"
            >
              <Trash2 size={14} />
              Delete {selectionCount} items
            </button>
          </div>
        )}

        {/* Set operation toolbar — shown when exactly 2 JSON nodes are selected */}
        <SetOperationToolbar selectedNodeIds={selectedNodeIds} />

        <JsonImportPanel
          isOpen={jsonImportOpen}
          onClose={() => setJsonImportOpen(false)}
          position={newNodePosition}
        />

        <ProcessEditorPanel
          isOpen={processEditorOpen}
          onClose={() => setProcessEditorOpen(false)}
          position={newNodePosition}
        />

        <JsonlImportPanel
          isOpen={jsonlImportOpen}
          onClose={() => setJsonlImportOpen(false)}
          position={newNodePosition}
        />

        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            onCreateNode={handleCreateEmptyNode}
            onCreateNote={handleCreateNoteFromMenu}
            onCreateResource={handleCreateResourceFromMenu}
            onCreateGroup={handleCreateGroupFromMenu}
            onCreateShape={handleCreateShapeFromMenu}
            onShowElements={() => setIconSidebarOpen(true)}
            onImportJson={handleImportJsonFromMenu}
            onImportJsonl={handleImportJsonlFromMenu}
            onImportGraph={handleImportGraph}
            onAIGenerate={onAIGenerate}
          />
        )}

        {/* Elements panel — always available like drawio shape panel */}
        <IconSidebar
          isOpen={iconSidebarOpen}
          onToggle={() => setIconSidebarOpen(!iconSidebarOpen)}
          onAddIcon={handleSidebarAddIcon}
          onAddGroup={handleSidebarAddGroup}
          onAddNode={handleSidebarAddNode}
          onAddNote={handleSidebarAddNote}
          onAddShape={handleSidebarAddShape}
        />

        {/* Canvas menu (top-left button group) - only in embed mode */}
        {embedMode && (
          <CanvasMenu
            onCreateNode={handleCanvasCreateNode}
            onCreateNote={handleCanvasCreateNote}
            onCreateResource={handleCanvasCreateResource}
            onCreateGroup={handleCanvasCreateGroup}
            onCreateShape={handleCanvasCreateShape}
            onImportJson={handleCanvasImportJson}
            onImportJsonl={handleCanvasImportJsonl}
            onImportGraph={handleImportGraph}
            onAIGenerate={onAIGenerate}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
          />
        )}

        <GraphImportPanel
          isOpen={graphImportOpen}
          onClose={() => setGraphImportOpen(false)}
          getViewportCenter={getViewportCenter}
        />

        {host.ai && (
          <AIGeneratePanel
            isOpen={aiGenerateOpen}
            onClose={() => setAiGenerateOpen(false)}
            getViewportCenter={getViewportCenter}
          />
        )}

        <NodeRawEditor />
      </div>
    </FlowStoreContext.Provider>
  )
}

export interface DataflowCanvasRef {
  fitViewForCapture: () => Promise<{ width: number; height: number }>;
}

interface DataflowCanvasWrapperProps {
  initialContent?: string
  embedMode?: boolean
  onStoreReady?: (store: FlowStore) => void
  onCanvasRefReady?: (ref: DataflowCanvasRef) => void
  /** Which stored diagram this is, so nodes can resolve their images through it. */
  diagram?: DiagramContextValue
}

function FlowWithCapture({
  store,
  embedMode,
  onCanvasRefReady,
}: {
  store: FlowStore
  embedMode?: boolean
  onCanvasRefReady?: (ref: DataflowCanvasRef) => void
}) {
  const { fitView, getNodes, setViewport } = useReactFlow()

  // Provide capture helpers to parent
  useEffect(() => {
    if (onCanvasRefReady) {
      const ref: DataflowCanvasRef = {
        fitViewForCapture: async () => {
          const nodes = getNodes()
          if (nodes.length === 0) {
            return { width: 800, height: 600 }
          }

          // Calculate bounds of all nodes
          const bounds = getNodesBounds(nodes)

          // Add padding
          const padding = 50
          const width = bounds.width + padding * 2
          const height = bounds.height + padding * 2

          // Calculate viewport to fit all nodes
          const viewport = getViewportForBounds(
            bounds,
            width,
            height,
            0.5, // minZoom
            2,   // maxZoom
            0.1  // padding
          )

          // Set viewport to show all nodes
          setViewport(viewport, { duration: 0 })

          // Wait for viewport to update
          await new Promise(resolve => setTimeout(resolve, 100))

          return { width, height }
        },
      }
      onCanvasRefReady(ref)
    }
  }, [fitView, getNodes, setViewport, onCanvasRefReady])

  return (
    <Flow
      store={store}
      embedMode={embedMode}
    />
  )
}

export default function DataflowCanvas({
  initialContent,
  embedMode,
  onStoreReady,
  onCanvasRefReady,
  diagram,
}: DataflowCanvasWrapperProps) {
  // Create a new store instance for this canvas
  const [store] = useState(() => {
    const newStore = createFlowStore()
    // Import initial content if provided. `replace` mode keeps the document
    // clean and the undo history empty — opening a file must not count as an
    // edit, and the first Ctrl+Z must not wipe the canvas back to empty.
    if (initialContent) {
      try {
        newStore.getState().importGraph(initialContent, undefined, { replace: true })
      } catch (e) {
        console.error('Failed to import initial content:', e)
      }
    }
    return newStore
  })

  // Notify parent when store is ready
  useEffect(() => {
    onStoreReady?.(store)
  }, [store, onStoreReady])

  // Identity is stable across renders so a node's resolve effect does not re-run
  // on every parent render — the effect keys off this object.
  const diagramContext = useMemo<DiagramContextValue>(
    () => ({ dataflowId: diagram?.dataflowId, historyId: diagram?.historyId }),
    [diagram?.dataflowId, diagram?.historyId],
  )

  return (
    <DiagramContext.Provider value={diagramContext}>
      <ReactFlowProvider>
        <FlowWithCapture
          store={store}
          embedMode={embedMode}
          onCanvasRefReady={onCanvasRefReady}
        />
      </ReactFlowProvider>
    </DiagramContext.Provider>
  )
}
