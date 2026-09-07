import { useMemo, useState } from 'react'
import { ReactFlow, Background, ReactFlowProvider, ConnectionMode } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
// The dataflow stylesheet, not just ReactFlow's. Without it the node components'
// own chrome has no opacity rule and shows unconditionally, and the read-only
// rules below are not defined at all.
import './index.css'

import { nodeTypes, edgeTypes } from './registry'
import { stripSizeWhenCollapsed } from './utils/collapsedNodeSize'
import { applyCollapsedGroups } from './utils/collapsedGroups'
import PipeMarkerDefs from './components/PipeMarkerDefs'
import { createFlowStore } from './store/flowStore'
import { FlowStoreContext } from './store/flowStoreContext'
import { DiagramContext, type DiagramContextValue } from './diagramContext'
import { useCollapsedNoteEdges, NOTE_EDGE_REVEALED } from './hooks/useCollapsedNoteEdges'

interface DataflowReadonlyPreviewProps {
  /** The diagram's JSON, as stored in a `.dataflow.json` file. */
  content: string
  /** Which stored diagram this is, so its image nodes resolve through it. */
  diagram?: DiagramContextValue
}

/**
 * A diagram rendered for looking at, not editing.
 *
 * It shares the node and edge registry with the editor (./registry) rather than keeping
 * its own: an unregistered node type renders as a blank box with no error, so a private
 * copy would silently lose whichever type the editor gained next.
 *
 * It still creates a real flow store, because the node components read one through
 * FlowStoreContext and throw without a provider. What makes this read-only is that every
 * interaction is off and no toolbar, minimap or controls are mounted — nothing here can
 * produce a change, so nothing needs to save one.
 */
function Preview({ content, diagram }: DataflowReadonlyPreviewProps) {
  const [store] = useState(() => {
    const s = createFlowStore()
    try {
      s.getState().importGraph(content, undefined, { replace: true })
    } catch (e) {
      console.error('Failed to import dataflow content for preview:', e)
    }
    return s
  })

  const storeNodes = store((s) => s.nodes)
  const storePipes = store((s) => s.pipes)
  // ...and the same collapsed-GROUP transform (card 20d64f9b). A diagram saved with a
  // folded group must open folded HERE too — this viewer is where a shared diagram is
  // read, and a group that unfolded itself in the viewer would be a different diagram
  // from the one the author saved.
  const { nodes: groupedNodes, pipes } = useMemo(
    () => applyCollapsedGroups(storeNodes, storePipes),
    [storeNodes, storePipes],
  )
  // Same render-boundary size strip as the editor canvas — a collapsed note
  // keeps its expanded size in the data but must not occupy it on screen
  const nodes = useMemo(() => stripSizeWhenCollapsed(groupedNodes), [groupedNodes])

  // ...and the same collapsed-note edge muting, for the same reason: this viewer is
  // where the card's diagram is actually read (card a8596103). Read-only does not mean
  // inert — hover is not an edit, so it works here exactly as it does in the editor.
  const { noteEdgeClasses, onNodeMouseEnter, onNodeMouseLeave } = useCollapsedNoteEdges(store, storeNodes, pipes)
  const edges = useMemo(
    () =>
      noteEdgeClasses.size === 0
        ? pipes
        : pipes.map((pipe) => {
            const noteClass = noteEdgeClasses.get(pipe.id)
            if (!noteClass) return pipe
            return {
              ...pipe,
              className: noteClass,
              data: { ...pipe.data, noteMuted: true, noteRevealed: noteClass.includes(NOTE_EDGE_REVEALED) },
            }
          }),
    [pipes, noteEdgeClasses],
  )

  const diagramContext = useMemo<DiagramContextValue>(
    () => ({ dataflowId: diagram?.dataflowId, historyId: diagram?.historyId }),
    [diagram?.dataflowId, diagram?.historyId],
  )

  return (
    <DiagramContext.Provider value={diagramContext}>
      <FlowStoreContext.Provider value={store}>
        <div className="dataflow-readonly w-full h-full min-h-[320px]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseLeave={onNodeMouseLeave}
            fitView
            /* Loose, exactly as the editor canvas (DataflowCanvas.tsx) — and not optional.
               Every perimeter handle a node exposes is type="source" (NodePerimeterHandles:
               the editor went all-source + Loose as one change in 6ad6ecde2, because a
               stored pipe may leave from or arrive at any side). So a pipe's targetHandle
               names a SOURCE handle, and React Flow only searches a node's source handles
               for an edge's target end under Loose. Under the default Strict it finds no
               target handle, returns no position, and draws nothing — silently, because
               the error-008 warning goes through devWarn and a production build never
               prints it. That is how this viewer showed every node and zero edges from
               the day it was introduced until card 89b04194. Sharing the node registry
               with the editor pulls in its handle scheme; this is the other half of it. */
            connectionMode={ConnectionMode.Loose}
            minZoom={0.05}
            maxZoom={4}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            edgesFocusable={false}
            nodesFocusable={false}
            panOnDrag
            /* Same Figma-style viewport feel as the editor canvas
               (DataflowCanvas.tsx): two-finger scroll pans, pinch /
               Ctrl+wheel / ⌘+wheel zooms. A read-only viewer pans and zooms
               the same way the editor does. */
            panOnScroll
            zoomOnScroll={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} size={1} color="#e8e8e8" />
            <PipeMarkerDefs />
          </ReactFlow>
        </div>
      </FlowStoreContext.Provider>
    </DiagramContext.Provider>
  )
}

export default function DataflowReadonlyPreview(props: DataflowReadonlyPreviewProps) {
  return (
    <ReactFlowProvider>
      <Preview {...props} />
    </ReactFlowProvider>
  )
}
