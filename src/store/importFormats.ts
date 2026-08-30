import type { Node } from '@xyflow/react'
import type { AnyNode, Pipe } from './flowStore'
import type { Field, JsonNodeData, OutputField, ProcessNodeData } from '../types'
import { generateId } from '../types'

/**
 * Parser for the one JSON format accepted by importGraph: the full React Flow
 * graph (the same shape exportGraph writes). This is the only format of a
 * stored diagram's data (master, 2026-08-26: "全量的 JSON 是储存的唯一格式") —
 * the retired simplified ({name, fields} nodes) and architecture (top-level
 * `groups` key) dialects are detected by detectLegacyDialect and rejected,
 * never parsed.
 *
 * Geometry is optional: `position` is a declaration the document MAY carry,
 * not an obligation. A graph carrying no positions at all is laid out by
 * computeTopologicalLayout on import (agents declare structure, the editor
 * solves geometry).
 *
 * The parser is pure: it reads the raw data plus an ImportContext and
 * returns the nodes/pipes to append. The store decides how to apply them
 * (snapshot vs replace).
 *
 * ID stability rule (master, 2026-08-26: "每个节点的 ID 应该是稳定的"):
 * an id the document carries is kept; one that is missing, empty, or collides
 * with an already-taken id is minted fresh. "Already taken" covers both the
 * canvas content (ctx.existingNodes/existingPipes — empty on a replace-mode
 * open, so a stored document round-trips its ids byte-for-byte) and earlier
 * entries of the same import (a document that duplicates an id inside itself
 * keeps the first occurrence; references resolve to that first occurrence).
 */

export interface ImportContext {
  generateNodeId: () => string
  generatePipeId: () => string
  /** Nodes already on the canvas — merged imports are offset to their right */
  existingNodes: AnyNode[]
  /** Pipes already on the canvas — their ids must not be claimed by an import */
  existingPipes?: Pipe[]
  /** When set, imported top-level nodes are centered on this canvas point */
  viewportCenter?: { x: number; y: number }
}

export interface ParsedGraph {
  nodes: AnyNode[]
  pipes: Pipe[]
}

/**
 * Name the retired dialect a payload is written in, or null when it is not
 * one. This is a shape probe, not a parser: it builds nothing, it only lets
 * the import entry points tell the user WHY their JSON was refused (they are
 * probably holding output from a retired copy-prompt). Same discriminators
 * the old dialect dispatch used: a top-level `groups` key marked the
 * architecture format, and a first node shaped {name, fields} without
 * type/data marked the simplified format.
 */
export function detectLegacyDialect(data: {
  nodes?: unknown[]
  groups?: unknown[]
}): 'architecture' | 'simplified' | null {
  if (Array.isArray(data.groups) && data.groups.length > 0) return 'architecture'
  const first = (data.nodes || [])[0] as
    | { name?: unknown; fields?: unknown; type?: unknown; data?: unknown }
    | undefined
  if (first && first.name && first.fields && !first.type && !first.data) return 'simplified'
  return null
}

/**
 * Parse import JSON in the full React Flow format.
 * Returns null when the payload contains nothing importable or is written in
 * a retired dialect (callers surface the specific reason via
 * detectLegacyDialect before calling this).
 * May throw on malformed structures — callers treat that as a failed import.
 */
export function parseImportedGraph(data: {
  nodes?: unknown[]
  pipes?: unknown[]
  edges?: unknown[]
  groups?: unknown[]
  direction?: unknown
}, ctx: ImportContext): ParsedGraph | null {
  const rawNodes = (data.nodes || []) as Node[]
  const rawPipes = (data.pipes || data.edges || []) as Pipe[]
  if (rawNodes.length === 0) return null
  if (detectLegacyDialect(data)) return null
  // Graph-level `direction` is the one intent word the format accepts.
  // LR is the DEFAULT (owner, 2026-08-26: "横着从左往右阅读比较好,从上往下,
  // 竖着不好看" — an unconditional preference, stated over a graph with zero
  // field-level edges, which is why this is not conditioned on edge style);
  // a document opts into top-down by declaring direction: TB.
  const direction: LayoutDirection = data.direction === 'TB' ? 'TB' : 'LR'
  return parseReactFlowFormat(rawNodes, rawPipes, ctx, direction)
}

// ---------------------------------------------------------------------------
// Shared helpers

/**
 * Allocator implementing the ID stability rule (see file header): claim()
 * returns the preferred id when it is a non-empty, not-yet-taken string, and
 * mints a fresh one otherwise. Seed it with the ids already on the canvas so
 * merge imports cannot collide; seed it with nothing for a replace-mode open
 * so stored ids survive untouched.
 */
function createIdAllocator(taken: Iterable<string>, generate: () => string) {
  const used = new Set(taken)
  return (preferred?: unknown): string => {
    let id = typeof preferred === 'string' && preferred !== '' && !used.has(preferred)
      ? preferred
      : generate()
    // generate() is short-random (types/index.ts generateId) — re-roll the
    // astronomically unlikely collision instead of silently duplicating
    while (used.has(id)) id = generate()
    used.add(id)
    return id
  }
}

// Backward compat: ensure all fields and output fields have IDs (old graphs)
function ensureFieldIds(fields: Field[]): Field[] {
  return fields.map((f) => ({
    ...f,
    id: f.id || generateId(),
    children: f.children ? ensureFieldIds(f.children) : undefined,
  }))
}

function ensureOutputFieldIds(fields: OutputField[]): OutputField[] {
  return fields.map((f) => ({ ...f, id: f.id || generateId() }))
}

/** Backfill field IDs on freshly built json/process nodes (mutates in place) */
export function ensureNodeFieldIds(node: AnyNode): void {
  if (node.type === 'json') {
    const data = node.data as JsonNodeData
    if (data.fields) data.fields = ensureFieldIds(data.fields)
  }
  if (node.type === 'process') {
    const data = node.data as ProcessNodeData
    if (data.outputFields) data.outputFields = ensureOutputFieldIds(data.outputFields)
  }
}

/** Shift top-level nodes so their centroid lands on the viewport center */
function centerOnViewport(nodes: Node[], viewportCenter?: { x: number; y: number }): void {
  if (!viewportCenter) return
  const topLevel = nodes.filter((n) => !n.parentId)
  if (topLevel.length === 0) return
  const cx = topLevel.reduce((s, n) => s + n.position.x, 0) / topLevel.length
  const cy = topLevel.reduce((s, n) => s + n.position.y, 0) / topLevel.length
  const dx = viewportCenter.x - cx
  const dy = viewportCenter.y - cy
  for (const node of topLevel) {
    node.position = { x: node.position.x + dx, y: node.position.y + dy }
  }
}

/** Merged imports without an explicit center land to the right of existing content */
function mergeOffsetX(ctx: ImportContext): number {
  if (ctx.viewportCenter || ctx.existingNodes.length === 0) return 0
  return Math.max(...ctx.existingNodes.map((n) => n.position.x)) + 500
}

// ---------------------------------------------------------------------------
// Full React Flow format (the only format)

function parseReactFlowFormat(
  rawNodes: Node[],
  rawPipes: Pipe[],
  ctx: ImportContext,
  direction: LayoutDirection = 'LR',
): ParsedGraph {
  const offsetX = mergeOffsetX(ctx)

  // Geometry is optional. A graph with NO positions at all (the shape the
  // prompts teach agents to write) runs through the topological solver, keyed
  // by the document's node ids and fed each node's ESTIMATED size, so a
  // 14-field json node gets 14 fields worth of vertical room, not a fixed
  // slot. A PARTIALLY positioned graph does not enter the solver: positioned
  // nodes must never move because a neighbor was added; the missing ones are
  // placed next to their connected neighbors afterwards (see
  // placeUnpositionedNodes below).
  const positionless = (node: Node) => (node as { position?: unknown }).position == null
  const solved: Record<string, { x: number; y: number }> | null =
    rawNodes.length > 0 && rawNodes.every(positionless)
      ? computeTopologicalLayout(
          rawNodes.map((n, i) => n.id ?? `#${i}`),
          rawPipes.map((p) => ({ from: p.source, to: p.target })),
          Object.fromEntries(rawNodes.map((n, i) => [n.id ?? `#${i}`, estimateNodeSize(n)])),
          direction,
        )
      : null

  // Keep document ids; mint only on collision (ID stability rule, file header).
  // On a duplicate inside the document the first occurrence keeps the id, and
  // oldToNewId is first-write-wins so edges/parentId resolve to that first
  // occurrence — deterministic, and the graph stays valid.
  const claimNodeId = createIdAllocator(ctx.existingNodes.map((n) => n.id), ctx.generateNodeId)
  const oldToNewId: Record<string, string> = {}
  // Nodes still missing a position after the full-graph solve (the partial
  // case) get a placeholder here and are placed by neighbor after the pipes
  // are resolved — placement needs the remapped edges to know who neighbors
  // whom.
  const unplaced = new Set<string>()
  const nodes = rawNodes.map((node, i) => {
    const newId = claimNodeId(node.id)
    if (node.id && oldToNewId[node.id] === undefined) oldToNewId[node.id] = newId
    const position = node.position ?? solved?.[node.id ?? `#${i}`]
    if (position == null) unplaced.add(newId)
    return {
      ...node,
      id: newId,
      // Only offset top-level nodes; children keep relative position
      position: position == null
        ? { x: 0, y: 0 }
        : node.parentId
          ? position
          : { x: position.x + offsetX, y: position.y },
    }
  })
  // Second pass: remap parentId references
  for (const node of nodes) {
    if (node.parentId) {
      node.parentId = oldToNewId[node.parentId] || node.parentId
    }
  }

  // Groups must come before their children (React Flow requirement).
  // Depth-based sort handles multi-level nesting; depths are memoized so the
  // sort stays O(n log n) instead of walking the parent chain per comparison.
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const depthCache = new Map<string, number>()
  const depthOf = (nodeId: string): number => {
    const cached = depthCache.get(nodeId)
    if (cached !== undefined) return cached
    const node = byId.get(nodeId)
    const depth = node?.parentId ? depthOf(node.parentId) + 1 : 0
    depthCache.set(nodeId, depth)
    return depth
  }
  nodes.sort((a, b) => depthOf(a.id) - depthOf(b.id))

  // Backward-compat: remap old handle IDs to the unified node-* pattern
  const remapHandle = (handle: string | undefined): string | undefined => {
    if (!handle) return handle
    if (handle.startsWith('note-attach-')) return handle.replace('note-attach-', 'node-')
    if (handle.startsWith('img-')) return handle.replace('img-', 'node-')
    return handle
  }

  const claimPipeId = createIdAllocator((ctx.existingPipes ?? []).map((p) => p.id), ctx.generatePipeId)
  const pipes = rawPipes.map((pipe) => ({
    ...pipe,
    id: claimPipeId(pipe.id),
    type: pipe.type || 'dataflow',
    source: oldToNewId[pipe.source] || pipe.source,
    target: oldToNewId[pipe.target] || pipe.target,
    sourceHandle: remapHandle(pipe.sourceHandle ?? undefined),
    targetHandle: remapHandle(pipe.targetHandle ?? undefined),
  }))

  for (const node of nodes) {
    // Strip legacy attachment data from note nodes
    if (node.type === 'note') {
      delete (node.data as { attachment?: unknown }).attachment
    }
    // Migrate legacy 'image' nodes to 'resource' type
    if (node.type === 'image') {
      node.type = 'resource'
    }
  }

  if (unplaced.size > 0) {
    placeUnpositionedNodes(nodes, pipes, unplaced, ctx.existingNodes, direction)
  }

  fillMissingHandles(nodes, pipes)

  centerOnViewport(nodes, ctx.viewportCenter)
  nodes.forEach((n) => ensureNodeFieldIds(n as AnyNode))
  return { nodes: nodes as AnyNode[], pipes }
}

// ---------------------------------------------------------------------------
// Layout

/**
 * Estimated render size of a node the solver has never seen rendered. The
 * solver runs before React ever measures anything, so these are deliberate
 * estimates derived from the node components' actual CSS — each constant
 * names the classes it comes from. They only need to be close enough that
 * the solver's gaps absorb the error; they are never written to the node.
 *
 * An explicit style.width/height on the node is an author declaration and
 * wins over any estimate (groups/shapes/resources are created with one —
 * flowStore addGroupNode/addShapeNode/addResourceNode).
 */
const SIZE_BY_TYPE: Record<string, { width: number; height: number }> = {
  json: { width: 320, height: 100 },     // min-w-[280px] wrapper + name/value columns (JsonNode.tsx:690); height is per-field, see below
  process: { width: 260, height: 100 },  // min-w-[220px] wrapper (ProcessNode.tsx:215); height per-row, see below
  note: { width: 240, height: 140 },     // style-less note: 36px header + a few text lines (NoteNode.tsx:325)
  resource: { width: 240, height: 200 }, // creation default (flowStore.ts addResourceNode)
  group: { width: 400, height: 300 },    // creation default (flowStore.ts addGroupNode)
  shape: { width: 160, height: 80 },     // creation default (flowStore.ts addShapeNode)
  icon: { width: 110, height: 110 },     // 48px glyph + max-w-[100px] caption (IconNode.tsx)
}
const DEFAULT_SIZE = { width: 280, height: 160 }

// JsonNode vertical rhythm (JsonNode.tsx):
//  header  px-4 py-3 + text-sm line + border  ≈ 45px   (:710)
//  chrome  body py-2 + add-field button (mt-1 py-2 + text-xs) + wrapper borders ≈ 55px (:832, :903)
//  row     py-1.5 + text-[13px] mono line     ≈ 32px   (:149) — children render expanded by default (:72)
//  desc    text-[10px] leading-tight mt-0.5   ≈ 15px   (:250) — only fields that carry desc
const JSON_HEADER_PX = 45
const JSON_CHROME_PX = 55
const JSON_ROW_PX = 32
const JSON_DESC_PX = 15
// ProcessNode: header px-3 py-2 ≈ 38px (:230), rows min-h-[32px] (:85),
// expression footer ≈ 26px when any output exists (:294)
const PROCESS_CHROME_PX = 40
const PROCESS_ROW_PX = 32
const PROCESS_FOOTER_PX = 26

interface SizedField { name?: string; example?: unknown; desc?: string; children?: SizedField[] }

/**
 * Text width in em units: CJK glyphs ≈ 1em, everything else ≈ 0.6em. The
 * node components shrink-wrap and their `truncate` spans are nowrap, so an
 * unconstrained line grows its node to full text width — width estimates
 * must model the text, not assume the min-width constant. Calibrated against
 * rendered nodes on the AMPLS/payment demos (est within ~15%, absorbed by
 * FLOW_GAP).
 */
function textEm(text: string): number {
  let em = 0
  for (const ch of text) em += (ch.codePointAt(0) ?? 0) > 0xff ? 1 : 0.6
  return em
}

/** Count rendered field rows (children render expanded) and desc lines */
function countJsonRows(fields: SizedField[]): { rows: number; descs: number } {
  let rows = 0
  let descs = 0
  const walk = (fs: SizedField[]) => {
    for (const f of fs) {
      rows++
      if (f.desc) descs++
      if (f.children) walk(f.children)
    }
  }
  walk(fields)
  return { rows, descs }
}

export function estimateNodeSize(node: {
  type?: string
  style?: { width?: unknown; height?: unknown }
  data?: unknown
}): { width: number; height: number } {
  const base = SIZE_BY_TYPE[node.type ?? ''] ?? DEFAULT_SIZE
  let { width, height } = base
  // A collapsed note/resource renders as a 32×32 square and the renderer
  // strips any persisted size (collapsedNodeSize.ts) — so the estimate must
  // ignore style too, hence the early return.
  if ((node.type === 'note' || node.type === 'resource')
      && (node.data as { collapsed?: boolean } | undefined)?.collapsed) {
    return { width: 32, height: 32 }
  }
  if (node.type === 'note') {
    // A style-less note does not wrap: its width follows the longest content
    // line (measured on the AMPLS demo: 3 long lines rendered 975px against
    // the old 240 constant, which under LR put the next column inside the
    // note). CJK glyphs ≈ 1em, latin ≈ 0.55em at data.fontSize (default 12,
    // NoteNode.tsx); height is the 36px header + py-2 + 1.5-line-height rows.
    const data = node.data as { content?: string; fontSize?: number } | undefined
    const fontSize = typeof data?.fontSize === 'number' ? data.fontSize : 12
    const lines = String(data?.content ?? '').split('\n')
    const longestEm = Math.max(0, ...lines.map((line) =>
      [...line].reduce((s, ch) => s + ((ch.codePointAt(0) ?? 0) > 0xff ? 1 : 0.55), 0)))
    width = Math.max(240, Math.round(longestEm * fontSize) + 26)
    height = 36 + 16 + lines.length * Math.round(fontSize * 1.5)
  }
  if (node.type === 'json') {
    const data = node.data as { name?: string; fields?: SizedField[] } | undefined
    const fields = data?.fields ?? []
    const { rows, descs } = countJsonRows(fields)
    height = JSON_HEADER_PX + JSON_CHROME_PX + rows * JSON_ROW_PX + descs * JSON_DESC_PX
    // Width follows the widest line: field name + example value both render
    // 13px mono nowrap (the example capped at max-w-[240px], JsonNode.tsx),
    // plus toggle/padding chrome ≈ 80px; the header name renders text-sm.
    let widest = textEm(String(data?.name ?? '')) * 14 + 90
    const walk = (fs: SizedField[], depth: number) => {
      for (const f of fs) {
        const example = f.example == null ? 0 : Math.min(textEm(String(f.example)) * 13 + 16, 240)
        widest = Math.max(widest, depth * 20 + textEm(String(f.name ?? '')) * 13 + example + 80)
        if (f.children) walk(f.children, depth + 1)
      }
    }
    walk(fields, 0)
    width = Math.max(width, Math.round(widest))
  }
  if (node.type === 'process') {
    const data = node.data as {
      name?: string
      inputFields?: unknown[]
      outputFields?: { name?: string; expression?: string }[]
    } | undefined
    const rows = Math.max(data?.inputFields?.length ?? 0, data?.outputFields?.length ?? 0)
    height = PROCESS_CHROME_PX + rows * PROCESS_ROW_PX
      + ((data?.outputFields?.length ?? 0) > 0 ? PROCESS_FOOTER_PX : 0)
    // The expression preview is 12px mono in a nowrap `truncate` div inside a
    // shrink-wrapped node — it GROWS the node to the expression's full width
    // (measured: a 44-char expression rendered the node 377px wide against
    // the old 260 constant). Rows render input → output at text-sm.
    let widest = textEm(String(data?.name ?? '')) * 14 + 110
    for (const out of data?.outputFields ?? []) {
      widest = Math.max(widest, textEm(String(out?.expression ?? '')) * 12 + 44)
    }
    const inputs = (data?.inputFields ?? []) as unknown[]
    for (let i = 0; i < rows; i++) {
      const rowText = String(inputs[i] ?? '') + String(data?.outputFields?.[i]?.name ?? '')
      widest = Math.max(widest, textEm(rowText) * 14 + 90)
    }
    width = Math.max(width, Math.round(widest))
  }
  if (typeof node.style?.width === 'number') width = node.style.width
  if (typeof node.style?.height === 'number') height = node.style.height
  return { width, height }
}

// Gaps between estimated boxes. The retired fixed grid was 380×320 slots;
// with real sizes subtracted that grid implied roughly these gaps, so a
// graph of average-sized nodes lays out at a familiar density — only
// unusually tall/wide nodes now get the extra room they need.
// FLOW_GAP separates consecutive layers (along the reading direction),
// SIBLING_GAP separates nodes inside one layer.
const SIBLING_GAP = 60
const FLOW_GAP = 100
const LAYOUT_MARGIN = 50

export type LayoutDirection = 'LR' | 'TB'

/**
 * Compute node positions using topological layering.
 * Default direction is LR: root nodes (sources only) form the leftmost
 * column and the flow reads left to right — the owner's stated preference
 * for how a diagram should read. `direction: 'TB'` lays layers top-down
 * instead. Nodes in the same layer stack along the perpendicular axis.
 *
 * Content-aware: each layer advances by its predecessor's largest extent
 * along the flow axis (widest node for LR, tallest for TB) plus a fixed
 * gap, and the in-layer axis advances by each node's own extent — no fixed
 * slot grid. `sizes` carries the estimated box per node id; ids without one
 * fall back to DEFAULT_SIZE.
 */
export function computeTopologicalLayout(
  nodeNames: string[],
  edges: { from: string; to: string }[],
  sizes: Record<string, { width: number; height: number }> = {},
  direction: LayoutDirection = 'LR',
): Record<string, { x: number; y: number }> {
  const sizeOf = (name: string) => sizes[name] ?? DEFAULT_SIZE

  // Build adjacency: from → [to], and track incoming edges
  const children: Record<string, string[]> = {}
  const incomingCount: Record<string, number> = {}
  const nodeSet = new Set(nodeNames)

  for (const name of nodeNames) {
    children[name] = []
    incomingCount[name] = 0
  }

  for (const edge of edges) {
    if (!nodeSet.has(edge.from) || !nodeSet.has(edge.to)) continue
    children[edge.from].push(edge.to)
    incomingCount[edge.to]++
  }

  // BFS to assign depth layers (Kahn's algorithm)
  const depth: Record<string, number> = {}
  const queue: string[] = []

  // Start with root nodes (no incoming edges)
  for (const name of nodeNames) {
    if (incomingCount[name] === 0) {
      queue.push(name)
      depth[name] = 0
    }
  }

  let head = 0
  while (head < queue.length) {
    const current = queue[head++]
    for (const child of children[current]) {
      // Use max depth to handle multiple parents
      const newDepth = depth[current] + 1
      if (depth[child] === undefined || newDepth > depth[child]) {
        depth[child] = newDepth
      }
      incomingCount[child]--
      if (incomingCount[child] === 0) {
        queue.push(child)
      }
    }
  }

  // Assign remaining nodes (cycles) to the deepest layer + 1
  const maxDepth = Math.max(0, ...Object.values(depth))
  for (const name of nodeNames) {
    if (depth[name] === undefined) {
      depth[name] = maxDepth + 1
    }
  }

  // Group nodes by layer
  const layers: Record<number, string[]> = {}
  for (const name of nodeNames) {
    const d = depth[name]
    if (!layers[d]) layers[d] = []
    layers[d].push(name)
  }

  // Sort nodes within each layer: nodes with more children first (hubs on the left)
  for (const d of Object.keys(layers)) {
    layers[Number(d)].sort((a, b) => children[b].length - children[a].length)
  }

  // Assign positions. LR: each layer is a COLUMN — X advances by the widest
  // node of the column just placed (so a wide node pushes the next column
  // right instead of under it), Y stacks each node's own height, the column
  // centered on y=0. TB is the transpose: layers are rows, Y advances by the
  // tallest node, X packs widths, rows centered on x=0.
  const positions: Record<string, { x: number; y: number }> = {}
  const depthsInOrder = Object.keys(layers).map(Number).sort((a, b) => a - b)
  const along = (name: string) => (direction === 'LR' ? sizeOf(name).width : sizeOf(name).height)
  const across = (name: string) => (direction === 'LR' ? sizeOf(name).height : sizeOf(name).width)
  let flow = LAYOUT_MARGIN
  for (const d of depthsInOrder) {
    const names = layers[d]
    const layerSpan = names.reduce((s, n) => s + across(n), 0) + SIBLING_GAP * (names.length - 1)
    let pos = -layerSpan / 2 + LAYOUT_MARGIN
    let largest = 0
    for (const name of names) {
      positions[name] = direction === 'LR' ? { x: flow, y: pos } : { x: pos, y: flow }
      pos += across(name) + SIBLING_GAP
      largest = Math.max(largest, along(name))
    }
    flow += largest + FLOW_GAP
  }

  return positions
}

/**
 * Fill in edge handles the document did not declare, from the relative
 * geometry of the two endpoints. Handles are geometry the same way positions
 * are: a declaration the document MAY carry. Without this, React Flow
 * defaults an undeclared source to the node's first handle (node-top,
 * NodePerimeterHandles.tsx PERIMETER_HANDLES[0]) and an undeclared target to
 * the first target-capable handle (a field-level input-<field> on json/
 * process nodes) — so every agent-written edge left the TOP of its source,
 * wrapped around, and entered a side field handle. Measured on the demo
 * graph c5bbc462 (2026-08-26): 3/3 edge pairs crossing, one edge running
 * 469px through a node it doesn't touch.
 *
 * The rule: dominant axis between the two estimated node centers picks the
 * facing sides (target below → node-bottom→node-top, target right →
 * node-right→node-left, and mirrors). Each end is filled independently — a
 * declared handle on either end is NEVER rewritten, so every diagram the
 * editor itself saved (drag-connected edges always carry both handles) is
 * untouched. Like solved positions, filled handles materialize on the first
 * human save.
 */
function fillMissingHandles(nodes: Node[], pipes: Pipe[]): void {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const absCenter = (n: Node): { x: number; y: number } => {
    let x = n.position.x
    let y = n.position.y
    let p = n.parentId ? byId.get(n.parentId) : undefined
    while (p) {
      x += p.position.x
      y += p.position.y
      p = p.parentId ? byId.get(p.parentId) : undefined
    }
    const size = estimateNodeSize(n)
    return { x: x + size.width / 2, y: y + size.height / 2 }
  }
  for (const pipe of pipes) {
    if (pipe.sourceHandle != null && pipe.targetHandle != null) continue
    const source = byId.get(pipe.source)
    const target = byId.get(pipe.target)
    if (!source || !target) continue
    const sc = absCenter(source)
    const tc = absCenter(target)
    const dx = tc.x - sc.x
    const dy = tc.y - sc.y
    const vertical = Math.abs(dy) >= Math.abs(dx)
    const wantSource = vertical ? (dy >= 0 ? 'node-bottom' : 'node-top') : (dx >= 0 ? 'node-right' : 'node-left')
    const wantTarget = vertical ? (dy >= 0 ? 'node-top' : 'node-bottom') : (dx >= 0 ? 'node-left' : 'node-right')
    if (pipe.sourceHandle == null) pipe.sourceHandle = wantSource
    if (pipe.targetHandle == null) pipe.targetHandle = wantTarget
  }
}

/**
 * Place nodes that arrived without a position into a graph that already has
 * geometry — the flagship agent flow: read the exported JSON, add one node,
 * write no coordinates. The rules, in order:
 *
 *  1. Positioned nodes NEVER move. Not one pixel — a human laid them out.
 *  2. A placeless node lands next to a connected neighbor, along the reading
 *     direction: LR puts it right of an upstream neighbor (left of a
 *     downstream-only one), TB below/above. Earlier placements count as
 *     neighbors for later ones, so a chain of new nodes unrolls instead of
 *     stacking.
 *  3. If the chosen spot overlaps anything (estimated boxes), slide along
 *     the perpendicular axis (down for LR, right for TB) until it doesn't.
 *  4. No positioned neighbor at all → below the bounding box of everything
 *     already placed; empty canvas → the creation default (50,50).
 *
 * Coordinates of a child node are relative to its parent (React Flow), so
 * neighbors and collisions only count within the same parentId space.
 */
function placeUnpositionedNodes(
  nodes: Node[],
  pipes: Pipe[],
  unplaced: Set<string>,
  existingNodes: AnyNode[],
  direction: LayoutDirection = 'LR',
): void {
  type Box = { x: number; y: number; width: number; height: number; space: string }
  const spaceOf = (n: { parentId?: string }) => n.parentId ?? ''
  const toBox = (n: Node | AnyNode): Box => ({
    ...n.position, ...estimateNodeSize(n), space: spaceOf(n),
  })
  const occupied: Box[] = [
    ...existingNodes.map(toBox),
    ...nodes.filter((n) => !unplaced.has(n.id)).map(toBox),
  ]
  const overlaps = (a: Box, b: Box) =>
    a.space === b.space &&
    a.x < b.x + b.width && b.x < a.x + a.width &&
    a.y < b.y + b.height && b.y < a.y + a.height

  const positionedById = new Map(
    [...existingNodes, ...nodes.filter((n) => !unplaced.has(n.id))].map((n) => [n.id, n]),
  )

  for (const node of nodes) {
    if (!unplaced.has(node.id)) continue
    const size = estimateNodeSize(node)
    const space = spaceOf(node)

    // First positioned neighbor in the same coordinate space, upstream first
    const upstream = pipes.filter((p) => p.target === node.id).map((p) => p.source)
    const downstream = pipes.filter((p) => p.source === node.id).map((p) => p.target)
    const anchorId = [...upstream, ...downstream].find((id) => {
      const n = positionedById.get(id)
      return n && spaceOf(n) === space
    })

    let spot: { x: number; y: number }
    if (anchorId !== undefined) {
      const anchor = positionedById.get(anchorId)!
      const anchorSize = estimateNodeSize(anchor)
      const downstreamOfAnchor = upstream.includes(anchorId)
      spot = direction === 'LR'
        ? (downstreamOfAnchor
            ? { x: anchor.position.x + anchorSize.width + FLOW_GAP, y: anchor.position.y }
            : { x: anchor.position.x - size.width - FLOW_GAP, y: anchor.position.y })
        : (downstreamOfAnchor
            ? { x: anchor.position.x, y: anchor.position.y + anchorSize.height + FLOW_GAP }
            : { x: anchor.position.x, y: anchor.position.y - size.height - FLOW_GAP })
    } else {
      const inSpace = occupied.filter((b) => b.space === space)
      spot = inSpace.length > 0
        ? {
            x: Math.min(...inSpace.map((b) => b.x)),
            y: Math.max(...inSpace.map((b) => b.y + b.height)) + FLOW_GAP,
          }
        : { x: 50, y: 50 }
    }

    // Slide along the perpendicular axis until the spot is free (occupied is
    // finite, so this ends)
    let box: Box = { ...spot, ...size, space }
    while (occupied.some((b) => overlaps(box, b))) {
      box = direction === 'LR'
        ? { ...box, y: box.y + size.height + SIBLING_GAP }
        : { ...box, x: box.x + size.width + SIBLING_GAP }
    }

    node.position = { x: box.x, y: box.y }
    occupied.push(box)
    positionedById.set(node.id, node)
    unplaced.delete(node.id)
  }
}
