import { describe, it, expect } from 'vitest'
import type { Node } from '@xyflow/react'
import { computeGroupDropUpdates, applyGroupDropUpdates } from '../groupDrop'

const group = (id: string, x: number, y: number, w = 400, h = 300): Node => ({
  id,
  type: 'group',
  position: { x, y },
  data: {},
  style: { width: w, height: h },
})

const plain = (id: string, x: number, y: number, parentId?: string): Node => ({
  id,
  type: 'icon',
  position: { x, y },
  data: {},
  ...(parentId ? { parentId } : {}),
})

/** The order React Flow reads: a parent must never appear after its child. */
const parentsComeFirst = (nodes: Node[]): boolean => {
  const seen = new Set<string>()
  for (const n of nodes) {
    if (n.parentId && !seen.has(n.parentId)) return false
    seen.add(n.id)
  }
  return true
}

describe('computeGroupDropUpdates', () => {
  it('drops a plain node into the group it was released over', () => {
    const nodes = [group('gA', 100, 100, 500, 400), plain('n1', 800, 100)]
    const dragged = [{ ...nodes[1], position: { x: 200, y: 200 } }]

    const updates = computeGroupDropUpdates([nodes[0], dragged[0]], dragged)

    expect(updates.get('n1')).toEqual({ parentId: 'gA', position: { x: 100, y: 100 } })
  })

  it('drops a group into another group', () => {
    const nodes = [group('gB', 700, 100, 300, 220), group('gA', 100, 100, 500, 400)]
    const dragged = [{ ...nodes[0], position: { x: 270, y: 210 } }]

    const updates = computeGroupDropUpdates([dragged[0], nodes[1]], dragged)

    expect(updates.get('gB')).toEqual({ parentId: 'gA', position: { x: 170, y: 110 } })
  })

  it('refuses to nest a group inside its own descendant', () => {
    const outer = group('gA', 100, 100, 800, 600)
    const inner = { ...group('gB', 50, 50, 600, 400), parentId: 'gA' }
    const dragged = [{ ...outer, position: { x: 200, y: 200 } }]

    const updates = computeGroupDropUpdates([dragged[0], inner], dragged)

    expect(updates.has('gA')).toBe(false)
  })
})

describe('applyGroupDropUpdates', () => {
  it('keeps the dragged group behind its new parent in the array', () => {
    // addGroupNode prepends, so the newer group gB sits at index 0 and the
    // older gA — the one it is being dropped into — at index 1. Writing
    // parentId alone leaves the child in front of its parent, which is the
    // order React Flow cannot resolve.
    const nodes = [group('gB', 700, 100, 300, 220), group('gA', 100, 100, 500, 400)]
    const dragged = [{ ...nodes[0], position: { x: 270, y: 210 } }]
    const updates = computeGroupDropUpdates([dragged[0], nodes[1]], dragged)

    const next = applyGroupDropUpdates([dragged[0], nodes[1]], updates)

    expect(next.map((n) => n.id)).toEqual(['gA', 'gB'])
    expect(next.find((n) => n.id === 'gB')).toMatchObject({
      parentId: 'gA',
      position: { x: 170, y: 110 },
    })
    expect(parentsComeFirst(next)).toBe(true)
  })

  it('keeps parents first through a three-level nest', () => {
    // gC (newest) is dropped into gB, which already sits inside gA. The prepend
    // order [gC, gB, gA] is the exact reverse of what React Flow needs.
    const nodes = [
      group('gC', 250, 200, 200, 150),
      { ...group('gB', 100, 100, 400, 350), parentId: 'gA' },
      group('gA', 100, 100, 900, 700),
    ]
    const updates = computeGroupDropUpdates(nodes, [nodes[0]])

    const next = applyGroupDropUpdates(nodes, updates)

    expect(next.map((n) => n.id)).toEqual(['gA', 'gB', 'gC'])
    expect(next.find((n) => n.id === 'gC')).toMatchObject({ parentId: 'gB' })
    expect(parentsComeFirst(next)).toBe(true)
  })

  it('clears extent and restores the absolute position when dragged out', () => {
    const nodes = [
      group('gA', 100, 100, 500, 400),
      { ...plain('n1', 50, 50, 'gA'), extent: 'parent' as const },
    ]
    const updates = computeGroupDropUpdates(nodes, [
      { ...nodes[1], position: { x: 900, y: 900 } },
    ])

    const next = applyGroupDropUpdates(nodes, updates)

    expect(next.find((n) => n.id === 'n1')).toMatchObject({
      parentId: undefined,
      position: { x: 1000, y: 1000 },
      extent: undefined,
    })
  })

  it('returns the array untouched when nothing was reparented', () => {
    const nodes = [group('gA', 100, 100), plain('n1', 800, 800)]

    expect(applyGroupDropUpdates(nodes, new Map())).toEqual(nodes)
  })
})
