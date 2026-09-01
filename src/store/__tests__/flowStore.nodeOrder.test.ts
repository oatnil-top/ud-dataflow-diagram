import { describe, it, expect } from 'vitest'
import { createFlowStore } from '../flowStore'

/** The order React Flow reads: a parent must never appear after its child. */
const parentsComeFirst = (nodes: { id: string; parentId?: string }[]): boolean => {
  const seen = new Set<string>()
  for (const n of nodes) {
    if (n.parentId && !seen.has(n.parentId)) return false
    seen.add(n.id)
  }
  return true
}

describe('addGroupNode keeps the array in parent-first order', () => {
  it('puts a plain node behind the group created after it', () => {
    // The reason addGroupNode prepends: the group has to overtake the nodes
    // that will end up inside it.
    const store = createFlowStore()
    store.getState().addJsonNode('n1', [], { x: 200, y: 200 })
    const gid = store.getState().addGroupNode('G', { x: 100, y: 100 })

    const nodes = store.getState().nodes
    expect(nodes[0].id).toBe(gid)
    expect(parentsComeFirst(nodes)).toBe(true)
  })

  it('puts a group created inside another group behind its parent', () => {
    // Prepending alone gets this one backwards — the new group is the CHILD
    // here, so being first is exactly wrong. No caller passes parentId today,
    // which is the only reason this never shipped as a visible bug; when one
    // does, the symptom is the intermittent mispaint from task 68392c68.
    const store = createFlowStore()
    const outer = store.getState().addGroupNode('outer', { x: 100, y: 100 })
    const inner = store.getState().addGroupNode('inner', { x: 50, y: 50 }, undefined, { parentId: outer })

    const nodes = store.getState().nodes
    expect(nodes.map((n) => n.id)).toEqual([outer, inner])
    expect(nodes.find((n) => n.id === inner)?.parentId).toBe(outer)
    expect(parentsComeFirst(nodes)).toBe(true)
  })

  it('holds through three levels', () => {
    const store = createFlowStore()
    const a = store.getState().addGroupNode('a', { x: 0, y: 0 })
    const b = store.getState().addGroupNode('b', { x: 10, y: 10 }, undefined, { parentId: a })
    const c = store.getState().addGroupNode('c', { x: 20, y: 20 }, undefined, { parentId: b })

    expect(store.getState().nodes.map((n) => n.id)).toEqual([a, b, c])
    expect(parentsComeFirst(store.getState().nodes)).toBe(true)
  })
})
