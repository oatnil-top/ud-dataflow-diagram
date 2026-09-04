// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createFlowStore } from '../flowStore'
import { parseDsl } from '../dslParser'
import { estimateNodeSize } from '../importFormats'
import type { ViewportRect } from '../editPlan'

/**
 * What an EditPlan does to a canvas — design fb629b6a note 9630c775 §3 (viewport
 * placement) and §4 (the semantic table). Asserted on store data, never on pixels.
 */

const VIEWPORT: ViewportRect = { x: 0, y: 0, width: 1440, height: 900 }

const seeded = () => {
  const store = createFlowStore()
  store.getState().importGraph(JSON.stringify({
    nodes: [
      { id: 'users', type: 'json', position: { x: 0, y: 0 }, data: { name: 'users', fields: [
        { name: 'id', path: ['id'], type: 'uuid', example: 'uuid' },
      ] } },
      { id: 'orders', type: 'json', position: { x: 600, y: 0 }, data: { name: 'orders', fields: [
        { name: 'user_id', path: ['user_id'], type: 'uuid', example: 'uuid' },
      ] } },
    ],
    pipes: [],
  }), undefined, { replace: true })
  return store
}

const apply = (store: ReturnType<typeof createFlowStore>, dsl: string, vp: ViewportRect = VIEWPORT) =>
  store.getState().applyEditPlan(parseDsl(dsl), vp)

describe('node — create', () => {
  it('a new id creates a json node named by the display name', () => {
    const store = createFlowStore()
    const result = apply(store, 'node users 用户: id uuid, email string')

    expect(result).toMatchObject({ addedNodes: 1, updatedNodes: 0 })
    const node = store.getState().nodes[0]
    expect(node.type).toBe('json')
    expect(node.id).toBe('users')
    expect(node.data).toMatchObject({
      name: '用户',
      fields: [{ name: 'id', type: 'uuid' }, { name: 'email', type: 'string' }],
    })
  })

  it('a created field is shaped like one the editor itself would add', () => {
    // Caught in a browser, not here: `example: undefined` renders as the literal string
    // "undefined" in the node's value column (JsonNode formatExample). Asserted against
    // the shape flowStore's own add-field path writes.
    const store = createFlowStore()
    apply(store, 'node t T: a string')
    const field = (store.getState().nodes[0].data as unknown as { fields: Record<string, unknown>[] }).fields[0]
    expect(field.example).toBe('')
    expect(Object.keys(field).sort()).toEqual(['example', 'id', 'name', 'path', 'type'])
  })

  it('a node with no display name is named after its id', () => {
    const store = createFlowStore()
    apply(store, 'node payments: amount number')
    expect((store.getState().nodes[0].data as { name: string }).name).toBe('payments')
  })
})

describe('node — modify (§4: rename + merge by name, NEVER delete)', () => {
  it('design §6 runG4: rename and merge, and the untouched field survives', () => {
    const store = seeded()
    const result = apply(store, 'node users 客户: phone string, address.city string')

    expect(result).toMatchObject({ addedNodes: 0, updatedNodes: 1 })
    const users = store.getState().nodes.find((n) => n.id === 'users')!
    const data = users.data as { name: string; fields: { name: string; path: string[]; type: string; children?: unknown[] }[] }
    expect(data.name).toBe('客户')
    expect(data.fields.map((f) => f.name)).toEqual(['id', 'phone', 'address'])
    // id — the field nobody mentioned — is still there, unchanged.
    expect(data.fields[0]).toMatchObject({ name: 'id', type: 'uuid' })
    expect(data.fields[2].children).toMatchObject([{ name: 'city', path: ['address', 'city'], type: 'string' }])
  })

  it('re-stating a field with the same type is an idempotent no-op', () => {
    const store = seeded()
    apply(store, 'node users: id uuid')
    const first = JSON.stringify(store.getState().nodes)
    apply(store, 'node users: id uuid')
    expect(JSON.stringify(store.getState().nodes)).toBe(first)
  })

  it('an existing field named again with a new type is updated in place, not duplicated', () => {
    const store = seeded()
    apply(store, 'node users: id string')
    const fields = (store.getState().nodes[0].data as { fields: { name: string; type: string }[] }).fields
    expect(fields).toHaveLength(1)
    expect(fields[0]).toMatchObject({ name: 'id', type: 'string' })
  })
})

describe('link', () => {
  it('a field-level link becomes output-/input- handles', () => {
    const store = seeded()
    const result = apply(store, 'link users.id -> orders.user_id')

    expect(result).toMatchObject({ addedPipes: 1 })
    expect(store.getState().pipes[0]).toMatchObject({
      source: 'users', target: 'orders', sourceHandle: 'output-id', targetHandle: 'input-user_id',
    })
  })

  it('a field that does not exist degrades to a node-level link and is counted', () => {
    const store = seeded()
    const result = apply(store, 'link users.nope -> orders.user_id')

    expect(result).toMatchObject({ addedPipes: 1, degradedLinks: 1 })
    expect(store.getState().pipes[0].sourceHandle).not.toBe('output-nope')
  })

  it('a link to an id nobody has is dropped by name, not stored unseen', () => {
    const store = seeded()
    const result = apply(store, 'link users -> ghosts')

    expect(result).toMatchObject({ addedPipes: 0, droppedPipes: [{ source: 'users', target: 'ghosts' }] })
    expect(store.getState().pipes).toHaveLength(0)
  })

  it('a link repeated against one already on the canvas is skipped, not doubled', () => {
    const store = seeded()
    apply(store, 'link users -> orders')
    const result = apply(store, 'link users -> orders')

    expect(result).toMatchObject({ addedPipes: 0, skippedPipes: 1 })
    expect(store.getState().pipes).toHaveLength(1)
  })

  it('a later line may link to an id an earlier line created', () => {
    const store = seeded()
    apply(store, 'node payments 支付: order_id uuid\nlink orders -> payments')
    expect(store.getState().pipes).toMatchObject([{ source: 'orders', target: 'payments' }])
  })
})

describe('§3 hard criterion — every new node intersects the viewport', () => {
  const boxes = (store: ReturnType<typeof createFlowStore>, ids: string[]) =>
    store.getState().nodes.filter((n) => ids.includes(n.id))

  const intersects = (n: { position: { x: number; y: number } }, size: { width: number; height: number }, vp: ViewportRect) =>
    n.position.x < vp.x + vp.width && n.position.x + size.width > vp.x &&
    n.position.y < vp.y + vp.height && n.position.y + size.height > vp.y

  const assertAllVisible = (store: ReturnType<typeof createFlowStore>, ids: string[], vp: ViewportRect) => {
    // Estimated box, the same one the placement used (importFormats.estimateNodeSize).
    for (const node of boxes(store, ids)) {
      expect({ id: node.id, visible: intersects(node, estimateNodeSize(node), vp) })
        .toEqual({ id: node.id, visible: true })
    }
  }

  const twelve = Array.from({ length: 12 }, (_, i) => `node n${i} Node ${i}: a string, b string, c string`).join('\n')

  it('twelve new nodes on an empty canvas all land inside the viewport', () => {
    const store = createFlowStore()
    apply(store, twelve)
    assertAllVisible(store, store.getState().nodes.map((n) => n.id), VIEWPORT)
  })

  it('a viewport panned far from the graph still gets the new nodes (the "nothing happened" case)', () => {
    const store = seeded()
    const far: ViewportRect = { x: 90000, y: -40000, width: 1440, height: 900 }
    apply(store, twelve, far)
    assertAllVisible(store, Array.from({ length: 12 }, (_, i) => `n${i}`), far)
  })

  it('a viewport too small to tile them (400% zoom) cascades instead of leaving the screen', () => {
    const store = createFlowStore()
    const tiny: ViewportRect = { x: 0, y: 0, width: 360, height: 225 }
    apply(store, twelve, tiny)
    assertAllVisible(store, store.getState().nodes.map((n) => n.id), tiny)
  })

  it('a 10% zoom viewport (huge in flow coords) still starts them near the middle', () => {
    const store = createFlowStore()
    const wide: ViewportRect = { x: -7000, y: -4500, width: 14400, height: 9000 }
    apply(store, twelve, wide)
    assertAllVisible(store, store.getState().nodes.map((n) => n.id), wide)
  })

  it('modifying a node NEVER moves it — the user placed it', () => {
    const store = seeded()
    apply(store, 'node orders 订单: total number', { x: -50000, y: -50000, width: 800, height: 600 })
    expect(store.getState().nodes.find((n) => n.id === 'orders')!.position).toEqual({ x: 600, y: 0 })
  })

  it('new nodes come back selected so the eye finds them', () => {
    const store = seeded()
    apply(store, 'node payments 支付: amount number')
    const byId = Object.fromEntries(store.getState().nodes.map((n) => [n.id, !!n.selected]))
    expect(byId).toEqual({ users: false, orders: false, payments: true })
  })
})

describe('failure isolation — §1.4', () => {
  it('a plan with nothing applicable touches neither the graph nor the history', () => {
    const store = seeded()
    const before = JSON.stringify(store.getState().nodes)
    const canUndoBefore = store.getState().canUndo

    const result = apply(store, 'link ghost_a -> ghost_b')

    expect(JSON.stringify(store.getState().nodes)).toBe(before)
    expect(store.getState().canUndo).toBe(canUndoBefore)
    expect(result).toMatchObject({ addedNodes: 0, addedPipes: 0, updatedNodes: 0 })
  })

  it('one apply is one undo entry', () => {
    const store = seeded()
    apply(store, 'node payments 支付: amount number\nlink orders -> payments')
    expect(store.getState().nodes).toHaveLength(3)
    store.getState().undo()
    expect(store.getState().nodes).toHaveLength(2)
    expect(store.getState().pipes).toHaveLength(0)
  })
})

describe('the ignored-lines report reaches the summary', () => {
  it('bad lines ride along on the ImportResult', () => {
    const store = seeded()
    const result = apply(store, 'node payments 支付: amount number\nI hope this helps!\nlink orde')
    expect(result).toMatchObject({
      addedNodes: 1,
      ignoredLines: [
        { line: 2, reason: 'unrecognized' },
        { line: 3, reason: 'maybeTruncated' },
      ],
    })
  })
})

describe('icon and group (master 2026-09-04: the agent writes structure, the person drags positions)', () => {
  it('icon creates an icon node, defaulting the glyph when the model named none', () => {
    const store = createFlowStore()
    apply(store, 'icon gw API Gateway: lucide:Globe\nicon q Queue')
    const [gw, q] = store.getState().nodes
    expect(gw).toMatchObject({ type: 'icon', data: { name: 'API Gateway', icon: 'lucide:Globe' } })
    expect(q).toMatchObject({ type: 'icon', data: { name: 'Queue', icon: 'lucide:Boxes' } })
  })

  it('group wraps members created in the same paste: parentId set, absolute spots unchanged', () => {
    const store = createFlowStore()
    apply(store, `node users 用户: id uuid
node orders 订单: id uuid
group vpc 生产 VPC @network: users, orders`)

    const nodes = store.getState().nodes
    const group = nodes.find((n) => n.id === 'vpc')!
    const users = nodes.find((n) => n.id === 'users')!
    expect(group).toMatchObject({ type: 'group', data: { name: '生产 VPC', stylePreset: 'network' } })
    expect(users.parentId).toBe('vpc')
    // Child coordinates are relative to the group and inside its box
    expect(users.position.x).toBeGreaterThan(0)
    expect(users.position.y).toBeGreaterThan(0)
    const style = group.style as { width: number; height: number }
    expect(users.position.x).toBeLessThan(style.width)
    expect(users.position.y).toBeLessThan(style.height)
    // Parents come before children in the array (React Flow requirement)
    expect(nodes.indexOf(group)).toBeLessThan(nodes.indexOf(users))
  })

  it('an EXISTING canvas node joins the group where it stands — absolute position unchanged', () => {
    const store = seeded() // users at (0,0), orders at (600,0)
    apply(store, 'group g 数据层: users, orders')

    const nodes = store.getState().nodes
    const group = nodes.find((n) => n.id === 'g')!
    const users = nodes.find((n) => n.id === 'users')!
    expect(users.parentId).toBe('g')
    // relative + group = the (0,0) the user placed it at
    expect(users.position.x + group.position.x).toBe(0)
    expect(users.position.y + group.position.y).toBe(0)
  })

  it('a member that does not exist is dropped BY NAME, not guessed into being', () => {
    const store = createFlowStore()
    const result = apply(store, 'node a A: x string\ngroup g G: a, ghost')
    expect(result?.droppedMembers).toEqual([{ group: 'g', member: 'ghost' }])
    expect(store.getState().nodes.find((n) => n.id === 'ghost')).toBeUndefined()
  })

  it('naming an EXISTING group renames it but never restacks its membership', () => {
    const store = createFlowStore()
    apply(store, 'node a A: x string\ngroup g G: a')
    const result = apply(store, 'node b B: y string\ngroup g 改名 @cluster: b')

    const nodes = store.getState().nodes
    const group = nodes.find((n) => n.id === 'g')!
    expect(group.data).toMatchObject({ name: '改名', stylePreset: 'cluster' })
    expect(nodes.find((n) => n.id === 'b')!.parentId).toBeUndefined()
    expect(result?.droppedMembers).toEqual([{ group: 'g', member: 'b' }])
  })

  it('nested groups work when the inner group is defined first', () => {
    const store = createFlowStore()
    apply(store, `icon db 主库: lucide:Database
group inner 数据: db
group outer 平台: inner`)

    const nodes = store.getState().nodes
    const inner = nodes.find((n) => n.id === 'inner')!
    const outer = nodes.find((n) => n.id === 'outer')!
    expect(inner.parentId).toBe('outer')
    expect(nodes.indexOf(outer)).toBeLessThan(nodes.indexOf(inner))
    expect(nodes.find((n) => n.id === 'db')!.parentId).toBe('inner')
  })

  it('a node verb aimed at an icon renames it and NEVER merges fields into it', () => {
    const store = createFlowStore()
    apply(store, 'icon gw 网关: lucide:Globe')
    apply(store, 'node gw 新网关: id uuid')
    const gw = store.getState().nodes[0]
    expect(gw.type).toBe('icon')
    expect(gw.data).toMatchObject({ name: '新网关', icon: 'lucide:Globe' })
    expect((gw.data as { fields?: unknown }).fields).toBeUndefined()
  })

  it('link connects icons and groups like any other id', () => {
    const store = createFlowStore()
    const result = apply(store, `icon gw 网关: lucide:Globe
node users 用户: id uuid
group g G: users
link gw -> g`)
    expect(result?.addedPipes).toBe(1)
    const pipe = store.getState().pipes[0]
    expect(pipe).toMatchObject({ source: 'gw', target: 'g' })
  })
})
