import type { NodeTypes, EdgeTypes } from '@xyflow/react'

import JsonNode from './components/nodes/JsonNode'
import ProcessNode from './components/nodes/ProcessNode'
import NoteNode from './components/nodes/NoteNode'
import ResourceNode from './components/nodes/ResourceNode'
import GroupNode from './components/nodes/GroupNode'
import IconNode from './components/nodes/IconNode'
import ShapeNode from './components/nodes/ShapeNode'
import DataflowEdge from './components/DataflowEdge'

/**
 * The one registry of what a diagram's nodes and edges render as.
 *
 * Every surface that draws a diagram imports these — the editor canvas and the read-only
 * preview on the resource detail page. A node whose `type` is not a key here renders as a
 * blank box with no error, so a second copy of this map is not a duplicate that drifts,
 * it is a second surface that silently loses whichever type the other one gained.
 *
 * Node components read the flow store through FlowStoreContext, so any surface using
 * these must provide one; there is no standalone mode.
 */
export const nodeTypes: NodeTypes = {
  json: JsonNode,
  process: ProcessNode,
  note: NoteNode,
  resource: ResourceNode,
  image: ResourceNode, // Legacy alias — old diagrams may have type: 'image'
  group: GroupNode,
  icon: IconNode,
  shape: ShapeNode,
}

export const edgeTypes: EdgeTypes = {
  dataflow: DataflowEdge,
}
