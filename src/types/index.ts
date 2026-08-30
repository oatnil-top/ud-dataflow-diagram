// Dataflow Diagram Element Model
//
// Direct mapping (no transformation):
//
//   +-----------+        Pipe         +-----------+
//   | JsonNode  |--------------------→| JsonNode  |
//   | (source)  |  field-to-field     | (target)  |
//   +-----------+                     +-----------+
//
// With transformation (ProcessNode in the middle):
//
//   +-----------+    Pipe    +-------------+    Pipe    +-----------+
//   | JsonNode  |----------→| ProcessNode |----------→| JsonNode  |
//   | (source)  |           | (transform) |           | (target)  |
//   +-----------+           +-------------+           +-----------+
//
// NoteNode can be free-floating or attached to a node/field.
//
//   +------------+         +-----------+
//   | NoteNode   |· · · · ·| JsonNode  |  attached to node
//   | "any text" |         +-----------+
//   +------------+
//                          +-----------+
//   +------------+         | JsonNode  |
//   | NoteNode   |· · · · ·|  .field   |  attached to field
//   +------------+         +-----------+
//
// GroupNode visually contains child nodes (e.g. tables in a database).
//
//   +--- db1 ---------------------+
//   | +-----------+ +-----------+ |
//   | | JsonNode  | | JsonNode  | |
//   | | users     | | orders    | |
//   | +-----------+ +-----------+ |
//   +-----------------------------+
//
// All elements (JsonNode, ProcessNode, NoteNode, GroupNode, Pipe) implement ElementData.

// Short random ID generator for elements and fields
export function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

// Field representation with hybrid path format (supports nesting)
export interface Field {
  id: string            // Unique ID (allows duplicate names)
  name: string          // Field key name: "age" (not full path)
  path: string[]        // Full path for access: ["profile", "age"]
  type: string          // "string" | "number" | "boolean" | "object" | "array" etc.
  example: unknown      // Sample value from JSON
  desc?: string         // Optional description shown as tooltip on hover
  children?: Field[]    // Nested fields for objects
}

// Base element type - all element data types (nodes and pipes) must implement this
export interface ElementData extends Record<string, unknown> {
  name: string
  url?: string          // Optional URL — when set, node title becomes a clickable link
}

// JSON Node - can be source or target
export interface JsonNodeData extends ElementData {
  fields: Field[]
}

// Process Node - transformation node
export interface ProcessNodeData extends ElementData {
  inputFields: string[]
  outputFields: OutputField[]
}

export interface OutputField {
  id: string            // Unique ID (allows duplicate names)
  name: string
  expression: string    // JS template literal: `${name}-${id}`
  desc?: string         // Optional description shown as tooltip on hover
}

// Note Node - pure text annotation, foldable, connectable to multiple nodes
export interface NoteNodeData extends ElementData {
  content: string        // Markdown/plain text content
  collapsed: boolean     // Whether the note body is folded
  fillColor?: string     // Background color (default: #fffbeb — amber-50)
  borderColor?: string   // Border color (default: #fef3c7 — amber-200)
  headerColor?: string   // Header background color (default: #fef3c7 — amber-100)
  textColor?: string     // Text color (default: #92400e — amber-800)
  fontSize?: number      // Font size in px (default: 12)
}

// Resource Node - references an uploaded resource by ID
export interface ResourceNodeData extends ElementData {
  resourceId?: string    // Resource ID — resolved to presigned URL at render time
  src?: string           // Legacy: inline data URL (for backward compat with old diagrams)
  mimeType?: string      // MIME type hint for rendering (e.g. 'image/png', 'application/pdf')
  alt?: string           // Alt text / caption
  collapsed: boolean     // Whether the body is folded
  uploading?: boolean    // Transient: true while an upload is in progress (not persisted)
}

// Group style preset names
export type GroupStylePreset = 'cloud' | 'region' | 'network' | 'security' | 'cluster' | 'service' | 'danger' | 'subtle'

// Group Node - visual container to group related nodes (e.g. "db1", "db2")
export interface GroupNodeData extends ElementData {
  icon?: string            // Optional icon ID from registry: "lucide:Cloud", "lucide:Network" etc.
  color?: string           // Fill color (css value)
  borderStyle?: 'solid' | 'dashed' | 'dotted'
  borderColor?: string     // Border color (css value)
  borderWidth?: number     // Border width in px (1, 2, 3)
  opacity?: number         // Background opacity 0-100
  rounded?: boolean        // Rounded corners (default true)
  stylePreset?: GroupStylePreset  // Named preset — sets defaults for all style fields
}

// Icon Node - standalone architecture icon (server, database, user, cloud resource etc.)
export interface IconNodeData extends ElementData {
  icon: string           // Icon ID from registry: "lucide:Database", "lucide:Server" etc.
  color?: string         // Icon stroke/line color (css value, default: #475569)
  fill?: string          // Icon fill color (css value, default: none — outline-only)
  strokeWidth?: number   // Icon stroke width (1, 1.5, 2, 2.5, 3; default: 2)
}

// Shape variants for geometric shape nodes
export type ShapeVariant =
  | 'rectangle'
  | 'rounded-rectangle'
  | 'circle'
  | 'diamond'
  | 'parallelogram'
  | 'hexagon'
  | 'triangle'
  | 'cylinder'

// Shape Node - basic geometric shape with text inside
export interface ShapeNodeData extends ElementData {
  shape: ShapeVariant       // Geometric shape type
  text: string              // Text content (supports multi-line)
  fillColor?: string        // Fill color (default: #eef2ff)
  strokeColor?: string      // Border color (default: #6366f1)
  strokeWidth?: number      // Border width (default: 2)
  textColor?: string        // Text color (default: #1e1e1e)
  fontSize?: number         // Font size in px (default: 13)
  textAlign?: 'left' | 'center' | 'right'  // Text alignment (default: center)
}

// Cardinality marker types for pipe endpoints (ER-diagram style)
export type PipeMarker = 'arrow' | 'one' | 'many' | 'none'

// Line style for pipes
export type PipeLineStyle = 'solid' | 'dashed' | 'dotted'

// Pipe - connection between fields across nodes
export interface PipeData extends ElementData {
  sourceField?: string   // Source field path (dot notation)
  targetField?: string   // Target field path (dot notation)
  description?: string   // Label shown on the edge
  sourceMarker?: PipeMarker  // Marker at source end (default: 'none')
  targetMarker?: PipeMarker  // Marker at target end (default: 'arrow')
  color?: string             // Stroke color (default: '#94a3b8')
  lineWidth?: number         // Stroke width (default: 2)
  lineStyle?: PipeLineStyle  // Line dash style (default: 'solid')
  animated?: boolean         // Animated dashed flow (default: false)
  // Label displacement from the path midpoint, in flow units (card 249e596f).
  // An offset rather than an absolute point: the label stays attached to the
  // edge when either endpoint node is moved. Without this field two edges
  // sharing a source handle and a target column render their labels on the
  // exact same midpoint — the author has no way to pull them apart, and two
  // stacked labels can read as one false sentence.
  labelOffset?: { x: number; y: number }
}

// Map from element type string to its data type
export interface ElementDataMap {
  json: JsonNodeData
  process: ProcessNodeData
  note: NoteNodeData
  resource: ResourceNodeData
  shape: ShapeNodeData
  group: GroupNodeData
  icon: IconNodeData
  pipe: PipeData
}

// All registered element type strings
export type FlowElementType = keyof ElementDataMap

// Node-only types (excludes pipe)
export type FlowNodeType = Exclude<FlowElementType, 'pipe'>
