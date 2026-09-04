// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { arrangeNodes, ARRANGE_GAP } from '../arrangeNodes'

/**
 * The four selection-arrangement operations (task 5b0bfd1e, design note 9c3dd6fd).
 *
 * Everything here is a pure function of the selected nodes — no store, no React Flow.
 * The store test (importSelection.arrange.test.ts) covers the other half of the card's
 * criterion: that pressing a button moves ONLY the selection.
 */

type N = {
  id: string
  parentId?: string
  position: { x: number; y: number }
  measured?: { width: number; height: number }
  type?: string
  data?: unknown
}

const node = (id: string, x: number, y: number, w = 100, h = 50, parentId?: string): N => ({
  id,
  ...(parentId ? { parentId } : {}),
  position: { x, y },
  measured: { width: w, height: h },
  type: 'json',
  data: { name: id, fields: [] },
})

const posOf = (r: NonNullable<ReturnType<typeof arrangeNodes>>, id: string) => r.positions.get(id)

describe('align-left / align-right', () => {
  it('align-left moves every node to the smallest x, y untouched', () => {
    const r = arrangeNodes('align-left', [node('a', 30, 10), node('b', 200, 90), node('c', 120, 40)])!
    expect(posOf(r, 'a')).toEqual({ x: 30, y: 10 })
    expect(posOf(r, 'b')).toEqual({ x: 30, y: 90 })
    expect(posOf(r, 'c')).toEqual({ x: 30, y: 40 })
  })

  it('align-right lines up the RIGHT edges (x + width), not the x origins', () => {
    // a: right edge 30+100=130, b: 200+40=240, c: 120+100=220 → target right edge 240
    const r = arrangeNodes('align-right', [node('a', 30, 10), node('b', 200, 90, 40), node('c', 120, 40)])!
    expect(posOf(r, 'a')).toEqual({ x: 140, y: 10 })
    expect(posOf(r, 'b')).toEqual({ x: 200, y: 90 })
    expect(posOf(r, 'c')).toEqual({ x: 140, y: 40 })
  })
})

describe('row / column', () => {
  it('row lays nodes in one line at the selection top-left, ordered by current x, spaced by real width + gap', () => {
    const r = arrangeNodes('row', [node('right', 500, 80, 120), node('left', 40, 200, 100), node('mid', 250, 20, 80)])!
    // Anchor = bounding top-left of the selection: x=40, y=20. Order by current x: left, mid, right.
    expect(posOf(r, 'left')).toEqual({ x: 40, y: 20 })
    expect(posOf(r, 'mid')).toEqual({ x: 40 + 100 + ARRANGE_GAP, y: 20 })
    expect(posOf(r, 'right')).toEqual({ x: 40 + 100 + ARRANGE_GAP + 80 + ARRANGE_GAP, y: 20 })
  })

  it('column stacks nodes at the selection top-left, ordered by current y, spaced by real height + gap', () => {
    const r = arrangeNodes('column', [node('low', 500, 300, 100, 60), node('high', 40, 20, 100, 40), node('mid', 250, 150, 100, 90)])!
    expect(posOf(r, 'high')).toEqual({ x: 40, y: 20 })
    expect(posOf(r, 'mid')).toEqual({ x: 40, y: 20 + 40 + ARRANGE_GAP })
    expect(posOf(r, 'low')).toEqual({ x: 40, y: 20 + 40 + ARRANGE_GAP + 90 + ARRANGE_GAP })
  })

  it('falls back to the size estimator when React Flow has not measured the node yet', () => {
    // No `measured` on either node — the first frame after an import. The estimator
    // gives a json node a real width, so the second node must land strictly to the
    // right of the first, not on top of it at x+0.
    const bare = (id: string, x: number): N => ({ id, position: { x, y: 0 }, type: 'json', data: { name: id, fields: [] } })
    const r = arrangeNodes('row', [bare('a', 0), bare('b', 10)])!
    expect(posOf(r, 'b')!.x).toBeGreaterThan(ARRANGE_GAP)
  })
})

describe('what a selection can carry without breaking the arrangement', () => {
  it('fewer than 2 arrangeable nodes → nothing moves', () => {
    expect(arrangeNodes('row', [node('a', 0, 0)])!.movedIds).toEqual([])
    expect(arrangeNodes('row', [])!.movedIds).toEqual([])
  })

  it('a child whose selected parent group is also selected rides with the parent — neither arranged nor reported skipped', () => {
    const group = node('g', 100, 100, 300, 200)
    const child = node('c', 10, 10, 80, 40, 'g') // relative coords, parent selected
    const other = node('o', 600, 100)
    const r = arrangeNodes('align-left', [group, child, other])!
    expect(r.positions.has('c')).toBe(false)
    expect(r.skippedIds).toEqual([])
    expect(posOf(r, 'g')).toEqual({ x: 100, y: 100 })
    expect(posOf(r, 'o')).toEqual({ x: 100, y: 100 })
  })

  it('mixed coordinate spaces: the majority side is arranged, the minority is skipped and named', () => {
    // Two top-level nodes vs one child of an UNSELECTED group: top-level majority wins.
    const r = arrangeNodes('align-left', [node('a', 50, 0), node('b', 300, 80), node('c', 10, 10, 80, 40, 'g')])!
    expect(r.skippedIds).toEqual(['c'])
    expect(posOf(r, 'a')).toEqual({ x: 50, y: 0 })
    expect(posOf(r, 'b')).toEqual({ x: 50, y: 80 })
    expect(r.positions.has('c')).toBe(false)
  })

  it('children of one unselected group CAN be arranged among themselves — one shared space is fine', () => {
    const r = arrangeNodes('align-left', [node('a', 50, 0, 80, 40, 'g'), node('b', 120, 60, 80, 40, 'g')])!
    expect(r.skippedIds).toEqual([])
    expect(posOf(r, 'a')).toEqual({ x: 50, y: 0 })
    expect(posOf(r, 'b')).toEqual({ x: 50, y: 60 })
  })
})
