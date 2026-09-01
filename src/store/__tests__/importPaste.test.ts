// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createFlowStore } from '../flowStore'

/**
 * The paste channel's two load-bearing promises, and the one regression it could cause.
 *
 * 1. Idempotence — master, 2026-09-01: "json 是可读可写,可复现幂等". Importing one
 *    payload twice must leave the graph importing it once left. Asserted on the DATA,
 *    never on a screenshot.
 * 2. Skipping by id must NOT leak into replace-mode (opening a document) or into any
 *    caller that did not ask for it. The symptom of a leak is "opening an old file
 *    behaves differently", which nobody goes looking for — so f5063687's criterion 4 is
 *    re-run here verbatim, on both paths.
 */

/** Two tables and the foreign key between them, with no geometry — what a model writes. */
const USERS_ORDERS = {
  nodes: [
    { id: 'users', type: 'json', data: { name: 'users', fields: [{ name: 'id', path: ['id'], type: 'uuid', example: 'uuid' }] } },
    { id: 'orders', type: 'json', data: { name: 'orders', fields: [{ name: 'user_id', path: ['user_id'], type: 'uuid', example: 'uuid' }] } },
  ],
  pipes: [{ source: 'users', target: 'orders' }],
}

/** design fb629b6a §5 out⑥: asked for "the updated graph", the model echoed what it was shown. */
const ECHO_PLUS_PAYMENTS = {
  nodes: [
    ...USERS_ORDERS.nodes,
    { id: 'payments', type: 'json', data: { name: 'payments', fields: [{ name: 'order_id', path: ['order_id'], type: 'uuid', example: 'uuid' }] } },
  ],
  pipes: [
    { source: 'users', target: 'orders' },
    { source: 'orders', target: 'payments' },
  ],
}

/** f5063687 criterion 4: a hand-written document that repeats an id inside itself. */
const SELF_DUPLICATED = {
  nodes: [
    { id: 'dup', type: 'json', position: { x: 0, y: 0 }, data: { name: 'first', fields: [] } },
    { id: 'dup', type: 'json', position: { x: 400, y: 0 }, data: { name: 'second', fields: [] } },
    { id: 'other', type: 'json', position: { x: 800, y: 0 }, data: { name: 'other', fields: [] } },
  ],
  pipes: [{ id: 'e1', source: 'dup', target: 'other', sourceHandle: 'node-right', targetHandle: 'node-left' }],
}

const paste = { sameIdMeansSameNode: true }
const shape = (store: ReturnType<typeof createFlowStore>) => {
  const { nodes, pipes } = store.getState()
  return {
    nodes: nodes.map((n) => ({ id: n.id, name: (n.data as { name?: string }).name, position: n.position })),
    pipes: pipes.map((p) => ({ source: p.source, target: p.target, sourceHandle: p.sourceHandle, targetHandle: p.targetHandle })),
  }
}

describe('idempotence — the reason same-id skipping exists', () => {
  it('importing one payload twice leaves what importing it once left', () => {
    const store = createFlowStore()
    store.getState().importGraph(JSON.stringify(USERS_ORDERS), undefined, paste)
    const afterFirst = shape(store)

    const second = store.getState().importGraph(JSON.stringify(USERS_ORDERS), undefined, paste)

    expect(shape(store)).toEqual(afterFirst)
    expect(second).toMatchObject({ addedNodes: 0, addedPipes: 0, skippedNodes: 2, skippedPipes: 1 })
  })

  it('a no-op import does not touch history either — nothing to undo, nothing dirtied', () => {
    const store = createFlowStore()
    store.getState().importGraph(JSON.stringify(USERS_ORDERS), undefined, paste)
    const undoDepthAfterFirst = store.getState().canUndo

    store.getState().importGraph(JSON.stringify(USERS_ORDERS), undefined, paste)
    store.getState().undo()

    // One undo returns to the empty canvas: the second import left no snapshot behind.
    expect(store.getState().nodes).toHaveLength(0)
    expect(undoDepthAfterFirst).toBe(true)
  })

  it('a third import is still a no-op — the property holds, it is not a one-off', () => {
    const store = createFlowStore()
    store.getState().importGraph(JSON.stringify(USERS_ORDERS), undefined, paste)
    const afterFirst = shape(store)
    store.getState().importGraph(JSON.stringify(USERS_ORDERS), undefined, paste)
    store.getState().importGraph(JSON.stringify(USERS_ORDERS), undefined, paste)
    expect(shape(store)).toEqual(afterFirst)
  })
})

describe('an echoed graph adds only what is new (design §5 out⑥)', () => {
  it('re-sent nodes are recognised, and the new node connects to the one on the canvas', () => {
    const store = createFlowStore()
    store.getState().importGraph(JSON.stringify(USERS_ORDERS), undefined, paste)
    const ordersId = store.getState().nodes.find((n) => (n.data as { name: string }).name === 'orders')!.id

    const result = store.getState().importGraph(JSON.stringify(ECHO_PLUS_PAYMENTS), undefined, paste)

    const names = store.getState().nodes.map((n) => (n.data as { name: string }).name)
    expect(names).toEqual(['users', 'orders', 'payments'])
    expect(result).toMatchObject({ addedNodes: 1, addedPipes: 1, skippedNodes: 2, skippedPipes: 1 })

    const newPipe = store.getState().pipes.find((p) => p.target !== ordersId && p.source === ordersId)
    expect(newPipe).toBeDefined()
    expect(newPipe!.source).toBe(ordersId)
  })

  it('without the flag the same echo duplicates the graph — this is what it is for', () => {
    const store = createFlowStore()
    store.getState().importGraph(JSON.stringify(USERS_ORDERS), undefined, paste)
    store.getState().importGraph(JSON.stringify(ECHO_PLUS_PAYMENTS))

    const names = store.getState().nodes.map((n) => (n.data as { name: string }).name)
    expect(names).toEqual(['users', 'orders', 'users', 'orders', 'payments'])
  })

  it('nodes already on the canvas do not move by one pixel', () => {
    const store = createFlowStore()
    store.getState().importGraph(JSON.stringify(USERS_ORDERS), undefined, paste)
    const before = store.getState().nodes.map((n) => ({ id: n.id, ...n.position }))

    store.getState().importGraph(JSON.stringify(ECHO_PLUS_PAYMENTS), { x: 9999, y: 9999 }, paste)

    const after = store.getState().nodes.filter((n) => before.some((b) => b.id === n.id))
    expect(after.map((n) => ({ id: n.id, ...n.position }))).toEqual(before)
  })
})

describe('f5063687 criterion 4 — a document that repeats an id inside itself', () => {
  const assertCriterion4 = (store: ReturnType<typeof createFlowStore>) => {
    const nodes = store.getState().nodes
    expect(nodes).toHaveLength(3)
    expect(new Set(nodes.map((n) => n.id)).size).toBe(3)
    // First occupant keeps the id; the later twin is re-minted.
    expect(nodes[0].id).toBe('dup')
    expect((nodes[0].data as { name: string }).name).toBe('first')
    expect(nodes[1].id).not.toBe('dup')
    expect((nodes[1].data as { name: string }).name).toBe('second')
    // The edge resolves to the FIRST occurrence.
    expect(store.getState().pipes[0].source).toBe('dup')
  }

  it('holds on the replace path (opening a document)', () => {
    const store = createFlowStore()
    store.getState().importGraph(JSON.stringify(SELF_DUPLICATED), undefined, { replace: true })
    assertCriterion4(store)
  })

  it('holds on the plain merge path', () => {
    const store = createFlowStore()
    store.getState().importGraph(JSON.stringify(SELF_DUPLICATED))
    assertCriterion4(store)
  })

  it('holds on the paste path too — the flag governs canvas collisions, not self-duplication', () => {
    const store = createFlowStore()
    store.getState().importGraph(JSON.stringify(SELF_DUPLICATED), undefined, paste)
    assertCriterion4(store)
  })
})

describe('paste semantics cannot reach the replace path', () => {
  it('replace wins even when a caller passes both flags', () => {
    const store = createFlowStore()
    store.getState().importGraph(JSON.stringify(USERS_ORDERS), undefined, { replace: true })
    const opened = shape(store)

    // Re-opening the same document with the paste flag wrongly set must still replace
    // wholesale and keep every id — not skip every node and leave an empty canvas.
    store.getState().importGraph(JSON.stringify(USERS_ORDERS), undefined, { replace: true, sameIdMeansSameNode: true })

    expect(shape(store)).toEqual(opened)
    expect(store.getState().nodes.map((n) => n.id)).toEqual(['users', 'orders'])
  })

  it('a stored document round-trips its ids on open, as before', () => {
    const store = createFlowStore()
    store.getState().importGraph(JSON.stringify(SELF_DUPLICATED), undefined, { replace: true })
    const exported = store.getState().exportGraph()

    const reopened = createFlowStore()
    reopened.getState().importGraph(exported, undefined, { replace: true })

    expect(reopened.getState().nodes.map((n) => n.id)).toEqual(store.getState().nodes.map((n) => n.id))
  })
})

describe('pipes whose endpoints do not exist', () => {
  const DANGLING = {
    nodes: [{ id: 'a', type: 'json', data: { name: 'a', fields: [] } }],
    pipes: [{ source: 'a', target: 'ghost' }],
  }

  it('are dropped and named on the paste path — "the edges vanished" becomes a sentence', () => {
    const store = createFlowStore()
    const result = store.getState().importGraph(JSON.stringify(DANGLING), undefined, paste)

    expect(store.getState().pipes).toHaveLength(0)
    expect(result!.droppedPipes).toEqual([{ source: 'a', target: 'ghost' }])
  })

  it('are still kept on the replace path — an open must not delete edges out of a file', () => {
    const store = createFlowStore()
    store.getState().importGraph(JSON.stringify(DANGLING), undefined, { replace: true })
    expect(store.getState().pipes).toHaveLength(1)
  })
})

describe('importGraph return value', () => {
  it('is null when there is nothing importable, so `if (importGraph(...))` still reads right', () => {
    const store = createFlowStore()
    expect(store.getState().importGraph('not json')).toBeNull()
    expect(store.getState().importGraph(JSON.stringify({ nodes: [] }))).toBeNull()
    expect(store.getState().importGraph(JSON.stringify({ groups: [{ name: 'g' }] }))).toBeNull()
  })
})
