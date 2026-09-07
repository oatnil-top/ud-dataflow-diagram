// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { applyCollapsedGroups } from '../collapsedGroups'
import type { AnyNode, Pipe } from '../../store/flowStore'

/**
 * The rule set of a collapsed group, asserted on data only (card 20d64f9b).
 *
 * Geometry here is chosen so the dominant axis is unambiguous: every collapsed group
 * chip sits far to the LEFT of `out`, so a rewritten source is always `node-right` and a
 * rewritten target always `node-left`/`node-right` — never a diagonal coin flip.
 */
const graph = (): { nodes: AnyNode[]; pipes: Pipe[] } => ({
  nodes: [
    // Collapsed group at the origin. Its chip is ~96×28, so its center is ~(48,14).
    { id: 'gA', type: 'group', position: { x: 0, y: 0 }, style: { width: 400, height: 300 }, data: { name: 'A', collapsed: true } },
    { id: 'c1', type: 'icon', position: { x: 50, y: 50 }, parentId: 'gA', data: { name: 'c1', icon: 'lucide:Server' } },
    { id: 'c2', type: 'icon', position: { x: 200, y: 50 }, parentId: 'gA', data: { name: 'c2', icon: 'lucide:Server' } },
    // A collapsed group nested inside a collapsed group, with a child of its own.
    { id: 'gInner', type: 'group', position: { x: 30, y: 150 }, parentId: 'gA', style: { width: 200, height: 120 }, data: { name: 'inner', collapsed: true } },
    { id: 'c3', type: 'icon', position: { x: 10, y: 10 }, parentId: 'gInner', data: { name: 'c3', icon: 'lucide:Server' } },
    // Outside the collapsed world.
    { id: 'out', type: 'icon', position: { x: 900, y: 50 }, data: { name: 'out', icon: 'lucide:Server' } },
    // A second collapsed group, far below-right — chip center ~(948,414).
    { id: 'gB', type: 'group', position: { x: 900, y: 400 }, style: { width: 400, height: 300 }, data: { name: 'B', collapsed: true } },
    { id: 'd1', type: 'icon', position: { x: 40, y: 40 }, parentId: 'gB', data: { name: 'd1', icon: 'lucide:Server' } },
  ] as AnyNode[],
  pipes: [] as Pipe[],
})

const pipe = (p: Partial<Pipe> & { id: string; source: string; target: string }): Pipe =>
  ({ type: 'dataflow', sourceHandle: 'node-right', targetHandle: 'node-left', ...p }) as Pipe

const hiddenIds = (nodes: AnyNode[]) => nodes.filter((n) => n.hidden).map((n) => n.id).sort()
const byId = <T extends { id: string }>(xs: T[]) => Object.fromEntries(xs.map((x) => [x.id, x]))

describe('applyCollapsedGroups — nodes', () => {
  it('hides every descendant of a collapsed group, however deep, and never the group itself', () => {
    const g = graph()
    const { nodes } = applyCollapsedGroups(g.nodes, g.pipes)
    expect(hiddenIds(nodes)).toEqual(['c1', 'c2', 'c3', 'd1', 'gInner'])
    expect(byId(nodes).gA.hidden).toBeFalsy()
    expect(byId(nodes).out.hidden).toBeFalsy()
  })

  it('returns the SAME arrays and node objects when nothing is collapsed', () => {
    const g = graph()
    const expanded = g.nodes.map((n) =>
      n.type === 'group' ? ({ ...n, data: { ...n.data, collapsed: false } } as AnyNode) : n)
    const pipes = [pipe({ id: 'p', source: 'c1', target: 'out' })]
    const out = applyCollapsedGroups(expanded, pipes)
    expect(out.nodes).toBe(expanded)
    expect(out.pipes).toBe(pipes)
  })

  it('does not mutate the store nodes', () => {
    const g = graph()
    applyCollapsedGroups(g.nodes, g.pipes)
    expect(g.nodes.some((n) => n.hidden)).toBe(false)
  })
})

describe('applyCollapsedGroups — pipes', () => {
  it('rewrites a child→outside edge to the group and recomputes only the rewritten end', () => {
    const g = graph()
    const p = pipe({ id: 'p', source: 'c1', target: 'out', sourceHandle: 'node-bottom', targetHandle: 'node-top' })
    const { pipes } = applyCollapsedGroups(g.nodes, [p])
    expect(pipes[0]).toMatchObject({
      id: 'p',
      source: 'gA',
      target: 'out',
      sourceHandle: 'node-right', // recomputed: the chip is far left of `out`
      targetHandle: 'node-top',   // untouched end keeps what the document declared
    })
    expect(pipes[0].hidden).toBeFalsy()
    expect((pipes[0].data as { groupMerged?: boolean } | undefined)?.groupMerged).toBe(true)
  })

  it('rewrites the target end of an outside→child edge', () => {
    const g = graph()
    const p = pipe({ id: 'p', source: 'out', target: 'c1', sourceHandle: 'node-bottom', targetHandle: 'node-top' })
    const { pipes } = applyCollapsedGroups(g.nodes, [p])
    expect(pipes[0]).toMatchObject({
      source: 'out',
      target: 'gA',
      sourceHandle: 'node-bottom',
      targetHandle: 'node-right',
    })
  })

  it('maps a doubly-nested child to the OUTERMOST collapsed group', () => {
    const g = graph()
    const { pipes } = applyCollapsedGroups(g.nodes, [pipe({ id: 'p', source: 'c3', target: 'out' })])
    expect(pipes[0].source).toBe('gA')
  })

  it('hides an edge whose two ends land in the same collapsed group', () => {
    const g = graph()
    const { pipes } = applyCollapsedGroups(g.nodes, [
      pipe({ id: 'inside', source: 'c1', target: 'c2' }),
      pipe({ id: 'nested', source: 'c1', target: 'c3' }),
    ])
    expect(pipes.every((p) => p.hidden)).toBe(true)
  })

  it('hides an edge from a child to its own collapsed ancestor', () => {
    const g = graph()
    const { pipes } = applyCollapsedGroups(g.nodes, [pipe({ id: 'self', source: 'c1', target: 'gA' })])
    expect(pipes[0].hidden).toBe(true)
  })

  it('rewrites BOTH ends when each is inside a different collapsed group', () => {
    const g = graph()
    const { pipes } = applyCollapsedGroups(g.nodes, [pipe({ id: 'p', source: 'c1', target: 'd1' })])
    expect(pipes[0]).toMatchObject({
      source: 'gA',
      target: 'gB',
      sourceHandle: 'node-right',
      targetHandle: 'node-left',
    })
  })

  it('leaves an edge already drawn to the collapsed group exactly as it was', () => {
    const g = graph()
    const p = pipe({ id: 'p', source: 'gA', target: 'out', data: { name: '', description: 'kept', waypoints: [{ x: 1, y: 2 }] } as never })
    const { pipes } = applyCollapsedGroups(g.nodes, [p])
    expect(pipes[0]).toBe(p)
  })

  it('drops waypoints on a rewritten edge — the route was drawn for the old endpoints', () => {
    const g = graph()
    const p = pipe({ id: 'p', source: 'c1', target: 'out', data: { name: '', waypoints: [{ x: 1, y: 2 }] } as never })
    const { pipes } = applyCollapsedGroups(g.nodes, [p])
    expect((pipes[0].data as { waypoints?: unknown }).waypoints).toBeUndefined()
  })

  it('dedupes edges that merge onto the same pair of handles, and drops the stacked label', () => {
    const g = graph()
    const { pipes } = applyCollapsedGroups(g.nodes, [
      pipe({ id: 'p1', source: 'c1', target: 'out', targetHandle: 'node-left', data: { name: '', description: 'reads' } as never }),
      pipe({ id: 'p2', source: 'c2', target: 'out', targetHandle: 'node-left', data: { name: '', description: 'writes' } as never }),
    ])
    const map = byId(pipes)
    expect(map.p1.hidden).toBeFalsy()
    expect(map.p2.hidden).toBe(true)
    // Two different labels stacked on one line read as one false sentence.
    expect((map.p1.data as { description?: string }).description).toBeUndefined()
  })

  it('keeps the label of a rewritten edge that merged with nothing', () => {
    const g = graph()
    const { pipes } = applyCollapsedGroups(g.nodes, [
      pipe({ id: 'p1', source: 'c1', target: 'out', data: { name: '', description: 'reads' } as never }),
    ])
    expect((pipes[0].data as { description?: string }).description).toBe('reads')
  })
})
