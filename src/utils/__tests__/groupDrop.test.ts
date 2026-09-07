import { describe, it, expect } from 'vitest'
import type { Node } from '@xyflow/react'
import { computeGroupDropUpdates, applyGroupDropUpdates, findDropRejectingGroup } from '../groupDrop'

const group = (id: string, x: number, y: number, w = 400, h = 300): Node => ({
  id,
  type: 'group',
  position: { x, y },
  data: {},
  style: { width: w, height: h },
})

/**
 * A folded group, as React Flow sees it at drag-stop: `stripSizeWhenCollapsed` has deleted
 * the persisted style at the render boundary, so the only size left is the chip React Flow
 * measured — roughly 150x28, and NOT the 400x300 the data still carries.
 */
const collapsedGroup = (id: string, x: number, y: number, w = 150, h = 28): Node => ({
  id,
  type: 'group',
  position: { x, y },
  data: { collapsed: true },
  measured: { width: w, height: h },
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

/**
 * Card 1cb78460: a node dropped on a folded group's chip.
 *
 * The reported symptom was "nothing happens, and nothing says nothing happened". Only the
 * second half was true by design — the first half was arithmetic. The drop test asks
 * whether the dragged node's TOP-LEFT lands inside the group's frame, and a folded group's
 * frame is its ~150x28 chip; a node big enough to cover that chip has its corner above and
 * left of it, so it missed. Put the corner ON the chip and the node WAS adopted, became a
 * descendant of a collapsed group, was stamped `hidden` by applyCollapsedGroups, and
 * disappeared. `snapToGrid` is 15px, so that landing zone is about 9 columns by 2 rows.
 *
 * The first test below is that hole. It is red without the `isCollapsed` guard.
 */
describe('computeGroupDropUpdates — a folded group takes nothing in (card 1cb78460)', () => {
  it('refuses a node whose corner lands squarely inside the chip', () => {
    const chip = collapsedGroup('gCollapsed', 200, 200)
    // Dead centre of the chip: the corner test PASSES here, so only the guard can refuse.
    const dragged = [{ ...plain('n1', 900, 900), position: { x: 275, y: 214 } }]

    const updates = computeGroupDropUpdates([chip, dragged[0]], dragged)

    expect(updates.has('n1')).toBe(false)
  })

  it('still lets an EXPANDED group at the same spot adopt the same node', () => {
    // The control: same geometry, same node, `collapsed` the only difference. Without it a
    // guard that simply broke all dropping would look identical to the test above.
    const open = { ...collapsedGroup('gOpen', 200, 200), data: {} }
    const dragged = [{ ...plain('n1', 900, 900), position: { x: 275, y: 214 } }]

    const updates = computeGroupDropUpdates([open, dragged[0]], dragged)

    expect(updates.get('n1')).toEqual({ parentId: 'gOpen', position: { x: 75, y: 14 } })
  })

  it('does not let a folded group swallow a dragged group either', () => {
    const chip = collapsedGroup('gCollapsed', 200, 200)
    const dragged = [{ ...group('gB', 900, 900, 300, 220), position: { x: 275, y: 214 } }]

    const updates = computeGroupDropUpdates([chip, dragged[0]], dragged)

    expect(updates.has('gB')).toBe(false)
  })
})

/**
 * What the chip's "nothing goes in here" state is driven by.
 *
 * OVERLAP, not the corner test — see findDropRejectingGroup's own comment. The gesture the
 * card reports (drag a node over the chip so it covers it) has its corner OUTSIDE the chip,
 * so a corner-based visual would stay dark on the one case it exists for.
 */
describe('findDropRejectingGroup (card 1cb78460)', () => {
  const measured = (n: Node, w = 120, h = 60): Node => ({ ...n, measured: { width: w, height: h } })

  it('names the folded group a dragged node is covering, corner outside and all', () => {
    const chip = collapsedGroup('gCollapsed', 200, 200)
    // Covering the chip: the node's corner is above-and-left of it, so the DROP test misses
    // — which is exactly why the visual cannot reuse that predicate.
    const dragged = [measured({ ...plain('n1', 0, 0), position: { x: 180, y: 190 } })]

    expect(findDropRejectingGroup([chip, dragged[0]], dragged)).toBe('gCollapsed')
  })

  it('is null while the drag is clear of the chip', () => {
    const chip = collapsedGroup('gCollapsed', 200, 200)
    const dragged = [measured({ ...plain('n1', 0, 0), position: { x: 600, y: 600 } })]

    expect(findDropRejectingGroup([chip, dragged[0]], dragged)).toBeNull()
  })

  it('is null over an EXPANDED group, which is a real target and must not say otherwise', () => {
    const open = group('gOpen', 200, 200, 400, 300)
    const dragged = [measured({ ...plain('n1', 0, 0), position: { x: 250, y: 250 } })]

    expect(findDropRejectingGroup([open, dragged[0]], dragged)).toBeNull()
  })

  it('a folded group being dragged does not reject itself', () => {
    const chip = measured(collapsedGroup('gCollapsed', 200, 200), 150, 28)
    const dragged = [chip]

    expect(findDropRejectingGroup([chip], dragged)).toBeNull()
  })

  it('returns null immediately when the diagram has no folded group', () => {
    const open = group('gOpen', 200, 200)
    const dragged = [measured({ ...plain('n1', 0, 0), position: { x: 250, y: 250 } })]

    expect(findDropRejectingGroup([open, dragged[0]], dragged)).toBeNull()
  })
})
