import type { Node } from '@xyflow/react'
import type { AnyNode, Pipe } from './flowStore'
import type { Field, JsonNodeData, OutputField, ProcessNodeData } from '../types'
import { generateId } from '../types'
import { sortNodesParentsFirst } from '../utils/nodeOrder'

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
 *
 * ctx.sameIdMeansSameNode flips ONE of those two clauses and only for the
 * paste entry points: an incoming id that collides with a CANVAS node is then
 * the same node — skipped, with its pipes resolving to the node already there.
 * Within-document duplicates are untouched by the flag and still re-mint, so
 * f5063687's criterion 4 (a document carrying repeated ids must not break)
 * holds identically on every path.
 *
 * The flag exists because a chat model asked to extend a diagram echoes what
 * it was shown (design fb629b6a §5 out⑥, 3/3 nodes echoed), and re-minting
 * those gives the user two of everything. Its real job is idempotence: master,
 * 2026-09-01 — "json 是可读可写,可复现幂等" — importing one payload twice
 * must leave the same graph as importing it once.
 *
 * The same flag also decides what an EMPTY `nodes` means. On the paste path it means
 * "only add these connections" — the delta a model writes when the new thing is a wire
 * between two nodes already on screen, which is the second half of master's "添加节点和
 * 关联" (2026-09-01). Everywhere else it still means "this document is an empty diagram"
 * and the payload is refused, as it always was.
 *
 * ⛔ It is off by default and MUST stay off for replace-mode opens and for
 * `ud apply` whole-document replacement. Leaking it there would change what
 * opening an existing file does, which is the one symptom nobody tests for.
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
  /**
   * Paste-entry-point semantics — one flag, because these three rules are the same
   * reading of the payload ("this is a delta onto what is on screen") and any one of
   * them leaking onto a replace-mode open changes what opening a file does:
   *   1. an incoming node id that matches a canvas node IS that node — skip it and
   *      resolve its pipes to the one on screen;
   *   2. a pipe whose endpoints exist nowhere is dropped and counted, not stored unseen;
   *   3. a payload with no nodes at all is a pure pipe delta, not an empty diagram.
   * See the file header for why this is opt-in and what must never turn it on.
   */
  sameIdMeansSameNode?: boolean
}

export interface ParsedGraph {
  nodes: AnyNode[]
  pipes: Pipe[]
  /**
   * What did not make it in, so the entry point can show it rather than let the
   * user count nodes. All zero/empty unless ctx.sameIdMeansSameNode is set —
   * nothing is skipped or dropped on the other paths.
   */
  skippedNodes: number
  skippedPipes: number
  /** Pipes whose endpoints matched no node here and none on the canvas. */
  droppedPipes: { source: string; target: string }[]
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
  // A payload with no nodes means two opposite things depending on who is asking, so the
  // reading is taken from the same flag that already forks this parser:
  //
  //  - paste path — "only add these connections". The prompt tells the model to output
  //    ONLY what is new, and when the new thing is a connection between two nodes already
  //    on the canvas, `nodes` is legitimately empty. Refusing it broke the second half of
  //    master's "添加节点和关联" (2026-09-01).
  //  - every other path (replace-mode open, `ud apply` whole-document replacement) —
  //    "this document is an empty diagram". Importing a pipe list into a canvas that is
  //    about to be discarded would attach wires to nodes that are on their way out.
  //
  // So a nodeless payload is importable only when it is a delta AND actually carries
  // connections; an empty-everything payload stays refused on every path.
  const isPipeDelta = ctx.sameIdMeansSameNode === true && rawNodes.length === 0 && rawPipes.length > 0
  if (rawNodes.length === 0 && !isPipeDelta) return null
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

/**
 * Shift top-level nodes so their centroid lands on the viewport center.
 *
 * `anchored` names nodes that were already given a spot relative to something on the
 * canvas — they are excluded from both the centroid and the shift, because moving them
 * would undo the placement that put them next to their neighbor.
 */
function centerOnViewport(
  nodes: Node[],
  viewportCenter?: { x: number; y: number },
  anchored?: Set<string>,
): void {
  if (!viewportCenter) return
  const topLevel = nodes.filter((n) => !n.parentId && !anchored?.has(n.id))
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
  const existingIds = new Set(ctx.existingNodes.map((n) => n.id))

  // Paste mode only: an incoming id that names a canvas node is that node. Those
  // entries are set aside here — before ids, layout or pipes are computed — so the
  // rest of this function simply never sees them. Within-document duplicates are NOT
  // filtered here; they still fall through to the allocator (file header).
  const skipped = ctx.sameIdMeansSameNode
    ? rawNodes.filter((n) => typeof n.id === 'string' && existingIds.has(n.id))
    : []
  const skippedIds = new Set(skipped.map((n) => n.id))
  const incoming = skippedIds.size > 0 ? rawNodes.filter((n) => !skippedIds.has(n.id)) : rawNodes

  // Geometry is optional. A graph with NO positions at all (the shape the
  // prompts teach agents to write) runs through the topological solver, keyed
  // by the document's node ids and fed each node's ESTIMATED size, so a
  // 14-field json node gets 14 fields worth of vertical room, not a fixed
  // slot. A PARTIALLY positioned graph does not enter the solver: positioned
  // nodes must never move because a neighbor was added; the missing ones are
  // placed next to their connected neighbors afterwards (see
  // placeUnpositionedNodes below).
  //
  // Skipping anything disqualifies the whole-graph solve too: the payload is then a
  // delta onto a canvas that already has a human layout, and re-solving it would move
  // nothing (the solver only writes the incoming nodes) while placing them as if the
  // canvas were empty. placeUnpositionedNodes anchors them to their real neighbors.
  const positionless = (node: Node) => (node as { position?: unknown }).position == null
  const solved: Record<string, { x: number; y: number }> | null =
    incoming.length > 0 && skippedIds.size === 0 && incoming.every(positionless)
      ? computeTopologicalLayout(
          incoming.map((n, i) => n.id ?? `#${i}`),
          rawPipes.map((p) => ({ from: p.source, to: p.target })),
          Object.fromEntries(incoming.map((n, i) => [n.id ?? `#${i}`, estimateNodeSize(n)])),
          direction,
        )
      : null

  // Keep document ids; mint only on collision (ID stability rule, file header).
  // On a duplicate inside the document the first occurrence keeps the id, and
  // oldToNewId is first-write-wins so edges/parentId resolve to that first
  // occurrence — deterministic, and the graph stays valid.
  const claimNodeId = createIdAllocator(ctx.existingNodes.map((n) => n.id), ctx.generateNodeId)
  // A skipped id maps to itself: every pipe and parentId that referenced it now
  // resolves to the node already on the canvas.
  const oldToNewId: Record<string, string> = Object.fromEntries([...skippedIds].map((id) => [id, id]))
  // Nodes still missing a position after the full-graph solve (the partial
  // case) get a placeholder here and are placed by neighbor after the pipes
  // are resolved — placement needs the remapped edges to know who neighbors
  // whom.
  const unplaced = new Set<string>()
  const nodes = incoming.map((node, i) => {
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

  // Groups must come before their children (React Flow requirement) —
  // utils/nodeOrder.ts explains what breaks when they do not. Sorted in place
  // because the rest of this function keeps reading `nodes`.
  nodes.splice(0, nodes.length, ...sortNodesParentsFirst(nodes))

  // Backward-compat: remap old handle IDs to the unified node-* pattern
  const remapHandle = (handle: string | undefined): string | undefined => {
    if (!handle) return handle
    if (handle.startsWith('note-attach-')) return handle.replace('note-attach-', 'node-')
    if (handle.startsWith('img-')) return handle.replace('img-', 'node-')
    return handle
  }

  const claimPipeId = createIdAllocator((ctx.existingPipes ?? []).map((p) => p.id), ctx.generatePipeId)
  const resolved = rawPipes.map((pipe) => ({
    ...pipe,
    type: pipe.type || 'dataflow',
    source: oldToNewId[pipe.source] || pipe.source,
    target: oldToNewId[pipe.target] || pipe.target,
    sourceHandle: remapHandle(pipe.sourceHandle ?? undefined),
    targetHandle: remapHandle(pipe.targetHandle ?? undefined),
  }))

  // Paste mode only: a pipe whose endpoints are neither being imported nor already on
  // the canvas can never render, and today it is kept in state invisibly — which is what
  // "the nodes arrived but the edges vanished" looks like from the outside (card
  // f22030f3). Drop it and count it, so the summary can name the missing endpoint.
  // Every other path keeps its dangling pipes exactly as before: dropping them on a
  // replace-mode open would delete edges out of a stored document on its next save.
  const droppedPipes: { source: string; target: string }[] = []
  let kept = resolved
  if (ctx.sameIdMeansSameNode) {
    const reachable = new Set([...nodes.map((n) => n.id), ...ctx.existingNodes.map((n) => n.id)])
    kept = resolved.filter((pipe) => {
      if (reachable.has(pipe.source) && reachable.has(pipe.target)) return true
      droppedPipes.push({ source: pipe.source, target: pipe.target })
      return false
    })
  }
  const pipes = kept.map((pipe) => ({ ...pipe, id: claimPipeId(pipe.id) }))

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

  const anchored = unplaced.size > 0
    ? placeUnpositionedNodes(nodes, pipes, unplaced, ctx.existingNodes, direction)
    : new Set<string>()

  // Existing canvas nodes are visible to the handle filler so that a pipe reaching from
  // a new node to one already on screen gets anchors from real geometry. Without them
  // that pipe's ends stay undeclared — and, because the handles are then not stable
  // across two imports of the same payload, so does idempotence.
  fillMissingHandles(nodes, pipes, ctx.existingNodes)

  // A node that was just placed beside its neighbor on the canvas must not then be
  // shifted to the middle of the viewport, away from the neighbor that chose its spot.
  centerOnViewport(nodes, ctx.viewportCenter, ctx.sameIdMeansSameNode ? anchored : undefined)
  nodes.forEach((n) => ensureNodeFieldIds(n as AnyNode))

  // Deduplicate against the canvas AFTER handles are filled: an incoming pipe that omits
  // its handles is only recognisable as "the one already there" once both ends carry the
  // same computed anchors. This is what makes a second import of one payload a no-op.
  let skippedPipes = 0
  let finalPipes = pipes
  if (ctx.sameIdMeansSameNode && (ctx.existingPipes?.length ?? 0) > 0) {
    const onCanvas = new Set((ctx.existingPipes ?? []).map(pipeIdentity))
    finalPipes = pipes.filter((pipe) => {
      if (!onCanvas.has(pipeIdentity(pipe))) return true
      skippedPipes++
      return false
    })
  }

  return {
    nodes: nodes as AnyNode[],
    pipes: finalPipes,
    skippedNodes: skipped.length,
    skippedPipes,
    droppedPipes,
  }
}

/** What makes two pipes the same connection: both endpoints and both anchors. */
function pipeIdentity(pipe: Pipe): string {
  return [pipe.source, pipe.target, pipe.sourceHandle ?? '', pipe.targetHandle ?? ''].join('\u0000')
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
function fillMissingHandles(nodes: Node[], pipes: Pipe[], existingNodes: AnyNode[] = []): void {
  // Imported nodes win on a shared id (they are the ones being positioned right now);
  // existing ones are here so a pipe reaching onto the canvas can still find geometry.
  const byId = new Map<string, Node>([...existingNodes, ...nodes].map((n) => [n.id, n as Node]))
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
): Set<string> {
  /** Nodes whose spot was chosen by a neighbor rather than by the fallback. */
  const anchoredToNeighbor = new Set<string>()
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
    if (anchorId !== undefined) anchoredToNeighbor.add(node.id)
    occupied.push(box)
    positionedById.set(node.id, node)
    unplaced.delete(node.id)
  }
  return anchoredToNeighbor
}
