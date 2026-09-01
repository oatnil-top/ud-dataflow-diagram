import type { Node } from '@xyflow/react'
import type { AnyNode, Pipe } from './flowStore'
import type { Field, JsonNodeData } from '../types'
import { generateId } from '../types'
import { estimateNodeSize, fillMissingHandles } from './importFormats'
import type { EditPlan, DslField, BadLine } from './dslParser'

/**
 * Turn an EditPlan (dslParser.ts) into the graph it describes.
 *
 * Pure: it reads the current nodes/pipes plus a viewport rectangle and RETURNS the new
 * arrays. The store decides whether to commit them (flowStore.applyEditPlan), so every
 * rule below — the merge semantics, the placement criterion — is testable by calling a
 * function, with no React and no canvas (src/store/__tests__/editPlan.test.ts).
 *
 * There is no inverse. An EditPlan comes in, a graph goes out; this module never produces
 * text. See dslParser.ts's header for why that one-way street is the design.
 */

/** The visible canvas, in FLOW coordinates. See DataflowCanvas.getViewportRect. */
export interface ViewportRect {
  x: number
  y: number
  width: number
  height: number
}

export interface EditApplication {
  nodes: AnyNode[]
  pipes: Pipe[]
  addedNodes: number
  /** Nodes that were already on the canvas and got renamed and/or gained fields. */
  updatedNodes: number
  addedPipes: number
  /** Connections the canvas already had. */
  skippedPipes: number
  /** Connections whose endpoints exist neither in the plan nor on the canvas. */
  droppedPipes: { source: string; target: string }[]
  /** Field-level links whose field did not exist — connected node-to-node instead. */
  degradedLinks: number
  /** Ids of the nodes this plan created, so the caller can select them. */
  newNodeIds: string[]
  ignoredLines: BadLine[]
}

// ---------------------------------------------------------------------------
// Field merge. Names are replaced, fields merge by name, and nothing is ever removed.

/**
 * Merge one dotted field declaration into a field tree, in place on a cloned tree.
 *
 * "Never removes" is the load-bearing half: a model asked to add a phone number answers
 * with the phone number alone, and the user's other fifteen columns must survive that.
 * Re-stating a field with the same type is therefore an idempotent no-op, which is what
 * makes pasting the same answer twice safe.
 */
function mergeField(root: Field[], incoming: DslField): void {
  let level = root
  for (let depth = 0; depth < incoming.path.length; depth++) {
    const segment = incoming.path[depth]
    const isLeaf = depth === incoming.path.length - 1
    const path = incoming.path.slice(0, depth + 1)
    let field = level.find((f) => f.name === segment)

    if (!field) {
      field = {
        id: generateId(),
        name: segment,
        path,
        type: isLeaf ? incoming.type : 'object',
        // '' and not undefined: JsonNode's formatExample renders an undefined example as
        // the literal word "undefined" in the value column (JsonNode.tsx formatExample),
        // which is what a DSL-created node looked like on screen before this line. '' is
        // also what the editor's own "add field" writes, so a node the DSL made and a node
        // the user made are the same shape. The DSL has no way to state an example value —
        // that is a deliberate omission, not a gap to fill with a placeholder.
        example: '',
        ...(isLeaf ? {} : { children: [] }),
      }
      level.push(field)
    } else if (isLeaf) {
      field.type = incoming.type
    }

    if (!isLeaf) {
      // A leaf the model now writes through ("address" was a string, now address.city) is
      // widened to an object. Widening keeps the field; it is not a removal.
      if (!field.children) {
        field.children = []
        field.type = 'object'
      }
      level = field.children
    }
  }
}

function cloneFields(fields: Field[]): Field[] {
  return fields.map((f) => ({ ...f, ...(f.children ? { children: cloneFields(f.children) } : {}) }))
}

// ---------------------------------------------------------------------------
// Viewport placement

/** Gap between tiled nodes; the same one the topological solver uses within a layer. */
const GRID_GAP = 60
/** Window-manager cascade offset, used when the viewport cannot hold a tidy grid. */
const CASCADE_STEP = 30
/**
 * How much of a node must lie inside the viewport. Any positive number satisfies the
 * design criterion (intersection area > 0); 40px is enough to be a thing the eye catches
 * rather than a sliver on the edge.
 */
const MIN_VISIBLE = 40

interface Size { width: number; height: number }
interface Box extends Size { x: number; y: number }

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/**
 * The hard criterion, enforced structurally rather than hoped for: whatever the placement
 * above decided, the node ends up overlapping the viewport.
 *
 * This is the whole point of the DSL channel's placement rule. The JSON delta path puts a
 * new node beside its connected neighbour, which is right for an agent (it cannot see a
 * viewport) and wrong for a person: with the neighbour off-screen the paste looks like
 * nothing happened. That path is deliberately left alone (importFormats
 * placeUnpositionedNodes) — this clamp applies only to nodes a DSL paste created.
 */
function clampIntoViewport(pos: { x: number; y: number }, size: Size, vp: ViewportRect): { x: number; y: number } {
  const clamp1 = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
  const visX = Math.min(MIN_VISIBLE, size.width, vp.width)
  const visY = Math.min(MIN_VISIBLE, size.height, vp.height)
  return {
    x: clamp1(pos.x, vp.x - size.width + visX, vp.x + vp.width - visX),
    y: clamp1(pos.y, vp.y - size.height + visY, vp.y + vp.height - visY),
  }
}

/**
 * Place freshly created nodes so the user SEES them.
 *
 * A compact row-major grid, sized to the largest of the new nodes and centred on the
 * viewport, skipping any cell that would sit on top of something already there. When the
 * viewport has no free cell left the node cascades — 30px stepped, window-manager style,
 * still inside the viewport.
 *
 * The rule behind that choice: a visible overlap beats invisible tidiness. An overlap is
 * obvious at a glance and one drag from fixed; a node placed neatly outside the viewport
 * is indistinguishable from a paste that did nothing.
 */
export function placeNewNodes(
  fresh: { node: Node; size: Size }[],
  occupied: Box[],
  vp: ViewportRect,
): void {
  if (fresh.length === 0) return

  const cellW = Math.max(...fresh.map((f) => f.size.width))
  const cellH = Math.max(...fresh.map((f) => f.size.height))
  const cols = Math.max(1, Math.floor((vp.width + GRID_GAP) / (cellW + GRID_GAP)))
  const rows = Math.max(1, Math.floor((vp.height + GRID_GAP) / (cellH + GRID_GAP)))

  // Centre the block of cells the grid can actually offer on the viewport centre.
  const usedCols = Math.min(cols, fresh.length)
  const usedRows = Math.min(rows, Math.ceil(fresh.length / cols))
  const blockW = usedCols * cellW + (usedCols - 1) * GRID_GAP
  const blockH = usedRows * cellH + (usedRows - 1) * GRID_GAP
  const originX = vp.x + (vp.width - blockW) / 2
  const originY = vp.y + (vp.height - blockH) / 2

  const candidates: { x: number; y: number }[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      candidates.push({ x: originX + c * (cellW + GRID_GAP), y: originY + r * (cellH + GRID_GAP) })
    }
  }

  let nextCandidate = 0
  let cascaded = 0
  for (const { node, size } of fresh) {
    let spot: { x: number; y: number } | null = null
    while (nextCandidate < candidates.length) {
      const cell = candidates[nextCandidate++]
      const box = { ...cell, ...size }
      if (!occupied.some((b) => overlaps(box, b))) {
        spot = cell
        break
      }
    }
    if (!spot) {
      spot = {
        x: vp.x + vp.width * 0.15 + cascaded * CASCADE_STEP,
        y: vp.y + vp.height * 0.15 + cascaded * CASCADE_STEP,
      }
      cascaded++
    }
    const position = clampIntoViewport(spot, size, vp)
    node.position = position
    occupied.push({ ...position, ...size })
  }
}

// ---------------------------------------------------------------------------

export interface EditContext {
  nodes: AnyNode[]
  pipes: Pipe[]
  generatePipeId: () => string
  /** Absent (headless callers, tests of the merge rules) skips viewport placement. */
  viewport?: ViewportRect
}

/** What makes two pipes the same connection — mirrors importFormats' pipeIdentity. */
const pipeIdentity = (p: { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }) =>
  [p.source, p.target, p.sourceHandle ?? '', p.targetHandle ?? ''].join('|')

const fieldExists = (fields: Field[] | undefined, dotted: string): boolean => {
  if (!fields) return false
  return fields.some((f) =>
    f.path.join('.') === dotted || f.name === dotted || fieldExists(f.children, dotted))
}

export function applyEditPlan(plan: EditPlan, ctx: EditContext): EditApplication {
  const byId = new Map(ctx.nodes.map((n) => [n.id, n]))
  /** Nodes replaced in place — keyed by id so two lines touching one node merge once. */
  const updated = new Map<string, AnyNode>()
  const created: { node: Node; size: Size }[] = []
  const newNodeIds: string[] = []

  const resolve = (id: string) => updated.get(id) ?? byId.get(id)

  for (const op of plan.ops) {
    if (op.kind !== 'node') continue
    const existing = resolve(op.id)

    if (existing) {
      // MODIFY. Never moved: the position is the user's, and a rename is not a reason to
      // relocate something they placed.
      const data = existing.data as JsonNodeData
      const fields = cloneFields(data.fields ?? [])
      for (const f of op.fields) mergeField(fields, f)
      updated.set(op.id, {
        ...existing,
        data: { ...data, ...(op.name ? { name: op.name } : {}), fields },
      } as AnyNode)
      continue
    }

    // CREATE. Position is filled in below, once every new node's size is known.
    const fields: Field[] = []
    for (const f of op.fields) mergeField(fields, f)
    const node = {
      id: op.id,
      type: 'json',
      position: { x: 0, y: 0 },
      selected: true,
      data: { name: op.name ?? op.id, fields } as JsonNodeData,
    } as Node
    created.push({ node, size: estimateNodeSize(node) })
    newNodeIds.push(op.id)
    updated.set(op.id, node as AnyNode)
  }

  if (ctx.viewport && created.length > 0) {
    const occupied = ctx.nodes
      .filter((n) => !n.parentId)
      .map((n) => ({ ...n.position, ...estimateNodeSize(n) }))
    placeNewNodes(created, occupied, ctx.viewport)
  }

  // ---- links -------------------------------------------------------------

  const droppedPipes: { source: string; target: string }[] = []
  let degradedLinks = 0
  const fresh: Pipe[] = []

  for (const op of plan.ops) {
    if (op.kind !== 'link') continue
    const source = resolve(op.source)
    const target = resolve(op.target)
    if (!source || !target) {
      droppedPipes.push({ source: op.source, target: op.target })
      continue
    }

    // A field-level anchor only holds if the field is really there. When it is not, the
    // connection is still worth having — it just anchors node-to-node, and the count says
    // so rather than leaving the user with an edge attached to nothing.
    const sourceFields = (source.data as JsonNodeData).fields
    const targetFields = (target.data as JsonNodeData).fields
    const sourceOk = op.sourceField ? fieldExists(sourceFields, op.sourceField) : false
    const targetOk = op.targetField ? fieldExists(targetFields, op.targetField) : false
    if ((op.sourceField && !sourceOk) || (op.targetField && !targetOk)) degradedLinks++

    fresh.push({
      id: ctx.generatePipeId(),
      type: 'dataflow',
      source: source.id,
      target: target.id,
      ...(sourceOk ? { sourceHandle: `output-${op.sourceField}` } : {}),
      ...(targetOk ? { targetHandle: `input-${op.targetField}` } : {}),
    } as Pipe)
  }

  // ---- commit shape ------------------------------------------------------

  const nodes: AnyNode[] = ctx.nodes.map((n) => {
    const replacement = updated.get(n.id)
    return replacement && replacement !== n ? replacement : ({ ...n, selected: false } as AnyNode)
  })
  const createdNodes = created.map((c) => c.node as AnyNode)
  const allNodes = [...nodes, ...createdNodes]

  // Node-level links get their anchors from geometry, exactly as an imported graph does —
  // without this React Flow attaches an undeclared edge to the node's first handle, which
  // is how edges end up leaving the top of a node and wrapping around it.
  fillMissingHandles(allNodes, fresh, [])

  // Dedupe last: an edge is only recognisable as "the one already there" once both ends
  // carry the same computed anchors. Same ordering, same reason, as importFormats.
  const seen = new Set(ctx.pipes.map(pipeIdentity))
  let skippedPipes = 0
  const keptPipes: Pipe[] = []
  for (const pipe of fresh) {
    const identity = pipeIdentity(pipe)
    if (seen.has(identity)) {
      skippedPipes++
      continue
    }
    seen.add(identity)
    keptPipes.push(pipe)
  }

  const updatedCount = [...updated.keys()].filter((id) => byId.has(id)).length

  return {
    nodes: allNodes,
    pipes: [...ctx.pipes, ...keptPipes],
    addedNodes: createdNodes.length,
    updatedNodes: updatedCount,
    addedPipes: keptPipes.length,
    skippedPipes,
    droppedPipes,
    degradedLinks,
    newNodeIds,
    ignoredLines: plan.badLines,
  }
}
