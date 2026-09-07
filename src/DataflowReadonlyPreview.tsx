import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  ReactFlowProvider,
  ConnectionMode,
  useReactFlow,
  useStore,
} from '@xyflow/react'
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

  useFitOnceMeasured(nodes.length > 0)

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

/**
 * Land on the whole diagram — once, after React Flow has measured the nodes.
 *
 * This is the viewer's half of commit 8865912 ("the declared fitView was fitting one
 * node"), which only ever fixed the editor. `fitView` on <ReactFlow> resolves ONE queued
 * fit, and something consumes that queue a frame before anything has been measured:
 * `GroupNode`, `NoteNode` and `ResourceNode` each call `useUpdateNodeInternals()(id)` in a
 * mount effect (they exist to re-measure the perimeter handles when a chip and a frame
 * swap). React Flow schedules that on a `requestAnimationFrame` and passes itself
 * `{ triggerFitView: false }` — but the store's implementation never destructures that
 * argument (`@xyflow/react` 12.10.0 declares the parameter in `types/store.d.ts` and drops
 * it in the runtime). The rAF beats the ResizeObserver's first broadcast, so the fit sees
 * the single node that call just measured, frames it, and empties the queue before the
 * real measurements land.
 *
 * Measured in Chromium at a 1280x800 pane, a diagram spanning x:0..1270: icon nodes only
 * fit at 0.909 and look right, but ONE group / note / resource anywhere in the diagram
 * takes the viewer to 2.43 (expanded group: `min(1280/440, 800/330)`, i.e. the group's own
 * 400x300 frame and nothing else) or to the 4.0 maxZoom when that group is collapsed and
 * `stripSizeWhenCollapsed` has shrunk it to a chip — with the right-hand nodes off-screen
 * either way. Collapse is not the trigger, it only makes the number worse.
 *
 * ⛔ The editor's `useNodesInitialized` gate does NOT work here, and looks like it should:
 * that flag is only ever written by `setNodes`, and this viewer passes no `onNodesChange`,
 * so measurements never flow back into the nodes prop and the flag stays false forever.
 * Gate on React Flow's own `nodeLookup` instead — `updateNodeInternals` writes the store on
 * both of its branches, so this selector re-runs when a measurement lands.
 *
 * `didFit` keeps it to once: this viewer never adds a node, but a `hidden` flip from the
 * collapsed-note hover would otherwise re-frame the diagram under the reader.
 *
 * @param hasNodes false for an empty diagram, where every node is measured vacuously and a
 *   fit would be a viewport jump to nothing.
 */
function useFitOnceMeasured(hasNodes: boolean): void {
  const allMeasured = useStore((s) => {
    if (s.nodeLookup.size === 0) return false
    for (const [, node] of s.nodeLookup) {
      // A hidden node (every descendant of a collapsed group) is excluded from the fit
      // itself by @xyflow/system's getFitViewNodes, so waiting for it would hang forever.
      if (node.hidden) continue
      if (!node.measured?.width || !node.measured?.height) return false
    }
    return true
  })
  const { fitView } = useReactFlow()
  const didFit = useRef(false)

  useEffect(() => {
    if (!hasNodes || !allMeasured || didFit.current) return
    didFit.current = true
    // ⚠️ `padding: 0.1` is React Flow's own default — deliberately NOT the editor's 0.15.
    // This fix is about WHEN the fit runs, not how it frames, so a diagram that was already
    // landing correctly here must land on the same pixels afterwards: measured on devbox,
    // the old group-less diagram ea54c216 reads zoom 0.763 before and after. Borrowing the
    // editor's 0.15 moved it to 0.729 — harmless, but a change to a surface this card did
    // not come to change. (The two never match anyway: the viewer's pane is smaller than
    // the editor's, so equal padding still gives different zoom.)
    //
    // `maxZoom: 1` is the one option that must be written out. The <ReactFlow fitView> prop
    // honours the canvas maxZoom of 4, so a diagram smaller than the pane would open blown
    // up — the same call the editor makes, and for the same reason.
    void fitView({ padding: 0.1, maxZoom: 1 })
  }, [hasNodes, allMeasured, fitView])
}

export default function DataflowReadonlyPreview(props: DataflowReadonlyPreviewProps) {
  return (
    <ReactFlowProvider>
      <Preview {...props} />
    </ReactFlowProvider>
  )
}
