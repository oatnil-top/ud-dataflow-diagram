// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  detectLegacyDialect,
  estimateNodeSize,
  parseImportedGraph,
  type ImportContext,
} from '../importFormats'

const ctx = (): ImportContext => {
  let n = 0
  let p = 0
  return {
    generateNodeId: () => `gen-n${++n}`,
    generatePipeId: () => `gen-p${++p}`,
    existingNodes: [],
    existingPipes: [],
  }
}

/**
 * The two retired dialects, as their retired prompts actually produced them.
 * They must be NAMED (so the entry points can explain the rejection) and
 * REFUSED by the parser (so no path quietly builds nodes from them).
 */
const SIMPLIFIED = {
  nodes: [{ name: 'users', fields: { id: 'uuid', email: 'a@b.c' } }],
  pipes: [{ from_node: 'users', from_field: 'id', to_node: 'users', to_field: 'id' }],
}
const ARCHITECTURE = {
  groups: [{ name: 'VNet', children: [{ type: 'icon', name: 'AKS', icon: 'lucide:Container' }] }],
  pipes: [],
}

/** A graph in the only accepted format, with no geometry — what the flipped prompts teach */
const FULL_NO_POSITIONS = {
  nodes: [
    { id: 'users', type: 'json', data: { name: 'users', fields: [{ name: 'id', path: ['id'], type: 'uuid', example: 'uuid' }] } },
    { id: 'orders', type: 'json', data: { name: 'orders', fields: [{ name: 'user_id', path: ['user_id'], type: 'uuid', example: 'uuid' }] } },
  ],
  pipes: [
    { source: 'users', target: 'orders', sourceHandle: 'output-id', targetHandle: 'input-user_id' },
  ],
}

describe('detectLegacyDialect', () => {
  it('names the simplified dialect', () => {
    expect(detectLegacyDialect(SIMPLIFIED)).toBe('simplified')
  })

  it('names the architecture dialect', () => {
    expect(detectLegacyDialect(ARCHITECTURE)).toBe('architecture')
  })

  it('does not flag the full format, with or without positions', () => {
    expect(detectLegacyDialect(FULL_NO_POSITIONS)).toBeNull()
    expect(detectLegacyDialect({
      nodes: [{ id: 'n1', type: 'json', position: { x: 1, y: 2 }, data: { name: 'users', fields: [] } }],
    })).toBeNull()
  })
})

describe('parseImportedGraph — dialects are refused, not parsed', () => {
  it('returns null for the simplified dialect', () => {
    expect(parseImportedGraph(SIMPLIFIED, ctx())).toBeNull()
  })

  it('returns null for the architecture dialect', () => {
    expect(parseImportedGraph(ARCHITECTURE, ctx())).toBeNull()
  })
})

describe('parseImportedGraph — geometry is optional', () => {
  it('lays out a graph that carries no positions at all — LR by default', () => {
    const parsed = parseImportedGraph(FULL_NO_POSITIONS, ctx())
    expect(parsed).not.toBeNull()
    const [users, orders] = parsed!.nodes
    expect(users.id).toBe('users')
    expect(orders.id).toBe('orders')
    // Solver output, not a shared default: the dependent sits one layer to
    // the RIGHT of the root — the root's estimated width plus the flow gap.
    // (Golden updated for the LR default (owner, 2026-08-26: 横着从左往右阅读
    // 比较好): json node width 320 + FLOW_GAP 100.)
    expect(users.position).toBeDefined()
    expect(orders.position).toBeDefined()
    expect(orders.position.x - users.position.x).toBe(420)
    expect(orders.position.y).toBe(users.position.y)
    // Pipes survive with their id minted and type defaulted
    expect(parsed!.pipes).toHaveLength(1)
    expect(parsed!.pipes[0].source).toBe('users')
    expect(parsed!.pipes[0].target).toBe('orders')
  })

  it('direction: TB opts a document back into top-down layers', () => {
    const parsed = parseImportedGraph({ ...FULL_NO_POSITIONS, direction: 'TB' }, ctx())!
    const [users, orders] = parsed.nodes
    // The pre-LR golden: one layer down = root's height (1-field json,
    // 45+55+32=132) + FLOW_GAP 100
    expect(orders.position.y - users.position.y).toBe(232)
    expect(orders.position.x).toBe(users.position.x)
  })

  it('keeps written positions byte-for-byte when every node has one', () => {
    const parsed = parseImportedGraph({
      nodes: [
        { id: 'a', type: 'json', position: { x: 123, y: 456 }, data: { name: 'a', fields: [] } },
        { id: 'b', type: 'json', position: { x: 789, y: 12 }, data: { name: 'b', fields: [] } },
      ],
      pipes: [],
    }, ctx())
    expect(parsed!.nodes[0].position).toEqual({ x: 123, y: 456 })
    expect(parsed!.nodes[1].position).toEqual({ x: 789, y: 12 })
  })

  it('partially missing positions: positioned nodes do not move, an unconnected one stacks below', () => {
    // (Golden updated for the second cut: the origin fallback is gone. With
    // no connected neighbor the node stacks below the placed content —
    // a is a 0-field json node, 45+55=100px tall, so b lands at
    // y = 200 + 100 + V_GAP(100) = 400, aligned to a's x.)
    const parsed = parseImportedGraph({
      nodes: [
        { id: 'a', type: 'json', position: { x: 100, y: 200 }, data: { name: 'a', fields: [] } },
        { id: 'b', type: 'json', data: { name: 'b', fields: [] } },
      ],
      pipes: [],
    }, ctx())
    expect(parsed!.nodes[0].position).toEqual({ x: 100, y: 200 })
    expect(parsed!.nodes[1].position).toEqual({ x: 100, y: 400 })
  })
})

// ---------------------------------------------------------------------------
// Second cut: content-aware solver + neighbor placement

const jsonNode = (id: string, fieldCount: number, extra: object = {}) => ({
  id,
  type: 'json',
  data: {
    name: id,
    fields: Array.from({ length: fieldCount }, (_, i) => ({
      name: `f${i}`, path: [`f${i}`], type: 'string', example: 'x',
    })),
  },
  ...extra,
})

const boxOf = (n: { position: { x: number; y: number } }) =>
  ({ ...n.position, ...estimateNodeSize(n as Parameters<typeof estimateNodeSize>[0]) })
const boxesOverlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe('estimateNodeSize', () => {
  it('grows a json node with its field count, nested children and descs included', () => {
    const flat2 = estimateNodeSize(jsonNode('a', 2))
    const flat12 = estimateNodeSize(jsonNode('b', 12))
    expect(flat12.height - flat2.height).toBe(10 * 32) // 32px per row (JsonNode py-1.5 + 13px mono line)
    const nested = estimateNodeSize({
      type: 'json',
      data: { name: 'n', fields: [{ name: 'p', path: ['p'], type: 'object', desc: 'why', children: [{ name: 'c', path: ['p', 'c'], type: 'string', example: 'x' }] }] },
    })
    expect(nested.height).toBe(45 + 55 + 2 * 32 + 15) // header + chrome + 2 rows + 1 desc line
  })

  it('lets an explicit style.width/height override the estimate', () => {
    expect(estimateNodeSize({ type: 'group', style: { width: 800, height: 90 } }))
      .toEqual({ width: 800, height: 90 })
  })

  it('a long process expression widens the node — nowrap truncate grows a shrink-wrapped box', () => {
    const expr = 'sum(amount) - sum(fee) group by merchant_id, day' // 48 latin chars
    const wide = estimateNodeSize({ type: 'process', data: { name: 'p', inputFields: ['a'], outputFields: [{ name: 'o', expression: expr }] } })
    // 48 × 0.6em × 12px + 44 chrome ≈ 390 — the 220 min-width is not the width
    expect(wide.width).toBe(390)
    const narrow = estimateNodeSize({ type: 'process', data: { name: 'p', inputFields: ['a'], outputFields: [{ name: 'o', expression: 'x' }] } })
    expect(narrow.width).toBe(260)
  })

  it('a long json example value widens the node up to the 240px value cap', () => {
    const wide = estimateNodeSize({
      type: 'json',
      data: { name: 'j', fields: [{ name: 'TimeGenerated', path: ['TimeGenerated'], type: 'string', example: '2026-08-26T14:00:00.0000000Z' }] },
    })
    // name 13ch×0.6em×13 + example capped contribution + 80 chrome
    expect(wide.width).toBeGreaterThan(320)
    expect(wide.width).toBeLessThan(520)
  })

  it('a note grows with its longest content line — the renderer does not wrap', () => {
    const wide = estimateNodeSize({ type: 'note', data: { name: 'n', collapsed: false, content: 'x'.repeat(120) + '\nshort' } })
    // 120 latin chars × 0.55em × 12px + padding ≈ 818
    expect(wide.width).toBe(818)
    expect(wide.height).toBe(36 + 16 + 2 * 18)
    // Collapsed renders a 32×32 square regardless of content or style
    expect(estimateNodeSize({ type: 'note', style: { width: 600, height: 400 }, data: { name: 'n', collapsed: true, content: 'x'.repeat(120) } }))
      .toEqual({ width: 32, height: 32 })
  })
})

describe('content-aware solver', () => {
  it('nodes with very different field counts never overlap, and in-column stacking uses real heights', () => {
    // 12 fields ≈ 484px tall: under the retired fixed 320px slot grid the
    // next layer started inside this node. Now no estimated boxes intersect.
    const parsed = parseImportedGraph({
      nodes: [jsonNode('big', 12), jsonNode('top', 2), jsonNode('bottom', 3)],
      pipes: [
        { source: 'big', target: 'top' },
        { source: 'big', target: 'bottom' },
      ],
    }, ctx())!
    const boxes = parsed.nodes.map(boxOf)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(boxesOverlap(boxes[i], boxes[j]), `${parsed.nodes[i].id} vs ${parsed.nodes[j].id}`).toBe(false)
      }
    }
    // LR: the next column starts after the widest node of this one + gap,
    // and within a column each node advances by ITS OWN height + sibling gap
    const big = parsed.nodes.find((n) => n.id === 'big')!
    const top = parsed.nodes.find((n) => n.id === 'top')!
    const bottom = parsed.nodes.find((n) => n.id === 'bottom')!
    expect(top.position.x - big.position.x).toBe(estimateNodeSize(jsonNode('big', 12)).width + 100)
    expect(bottom.position.y - top.position.y).toBe(estimateNodeSize(jsonNode('top', 2)).height + 60)
  })
})

describe('neighbor placement (partially positioned graph)', () => {
  const positioned = [
    jsonNode('a', 3, { position: { x: 100, y: 100 } }),
    jsonNode('b', 3, { position: { x: 520, y: 100 } }),
  ]

  it('a new node lands beside its upstream neighbor (LR), and positioned nodes keep their exact coordinates', () => {
    const parsed = parseImportedGraph({
      nodes: [...positioned, jsonNode('new', 2)],
      pipes: [{ source: 'a', target: 'new' }],
    }, ctx())!
    expect(parsed.nodes.find((n) => n.id === 'a')!.position).toEqual({ x: 100, y: 100 })
    expect(parsed.nodes.find((n) => n.id === 'b')!.position).toEqual({ x: 520, y: 100 })
    // Right of a: x = 100 + width 320 + FLOW_GAP 100 = 520 — but b sits
    // there, so the collision slide steps down by new's height 164 + 60
    expect(parsed.nodes.find((n) => n.id === 'new')!.position).toEqual({ x: 520, y: 324 })
  })

  it('two new nodes anchored to the same neighbor do not collide — the second slides right', () => {
    const parsed = parseImportedGraph({
      nodes: [...positioned, jsonNode('n1', 2), jsonNode('n2', 2)],
      pipes: [
        { source: 'a', target: 'n1' },
        { source: 'a', target: 'n2' },
      ],
    }, ctx())!
    const boxes = parsed.nodes.map(boxOf)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(boxesOverlap(boxes[i], boxes[j]), `${parsed.nodes[i].id} vs ${parsed.nodes[j].id}`).toBe(false)
      }
    }
  })

  it('missing handles are filled from geometry; declared handles are never rewritten', () => {
    const parsed = parseImportedGraph({
      nodes: [...positioned, jsonNode('new', 2)],
      pipes: [
        // no handles: new lands below a → facing sides are bottom→top
        { source: 'a', target: 'new' },
        // declared on both ends (a field-level pair): untouched
        { source: 'a', target: 'b', sourceHandle: 'output-id', targetHandle: 'input-user_id' },
        // declared source only: source kept, target filled (b is right of a → node-left)
        { source: 'a', target: 'b', sourceHandle: 'node-bottom' },
      ],
    }, ctx())!
    const [filled, declared, half] = parsed.pipes
    // new slides to (520,324): dx=420 dominates dy=224 → facing sides are
    // right→left (LR golden; was bottom→top under the TB default)
    expect(filled.sourceHandle).toBe('node-right')
    expect(filled.targetHandle).toBe('node-left')
    expect(declared.sourceHandle).toBe('output-id')
    expect(declared.targetHandle).toBe('input-user_id')
    expect(half.sourceHandle).toBe('node-bottom')
    expect(half.targetHandle).toBe('node-left')
  })

  it('solver-laid graphs get horizontal handles between layers', () => {
    const parsed = parseImportedGraph({
      nodes: [jsonNode('first', 2), jsonNode('second', 2)],
      pipes: [{ source: 'first', target: 'second' }],
    }, ctx())!
    expect(parsed.pipes[0].sourceHandle).toBe('node-right')
    expect(parsed.pipes[0].targetHandle).toBe('node-left')
  })

  it('a chain of new nodes unrolls: the second anchors to the freshly placed first', () => {
    const parsed = parseImportedGraph({
      nodes: [...positioned, jsonNode('n1', 2), jsonNode('n2', 2)],
      pipes: [
        { source: 'a', target: 'n1' },
        { source: 'n1', target: 'n2' },
      ],
    }, ctx())!
    const n1 = parsed.nodes.find((n) => n.id === 'n1')!
    const n2 = parsed.nodes.find((n) => n.id === 'n2')!
    // n2 sits right of n1 (its upstream, LR), not at a global fallback
    expect(n2.position.y).toBe(n1.position.y)
    expect(n2.position.x).toBeGreaterThan(n1.position.x)
  })
})
