import { describe, it, expect } from 'vitest'
import { computeNodeAdjacentPipes } from '../useHighlight'

/**
 * The seed a node click produces (card efd95471).
 *
 * This is the half of the feature that can fail silently: when the seed comes out empty,
 * the canvas looks exactly like the un-implemented state — no error, no console line, the
 * same picture. So the seed is a plain function with no store and no canvas behind it, and
 * these assert the two failure shapes that picture cannot tell apart: reaching nothing, and
 * reaching too much.
 */
const pipes = [
  { id: 'p1', source: 'srcA', sourceHandle: 'node-right', target: 'hub', targetHandle: 'node-left' },
  { id: 'p2', source: 'srcB', sourceHandle: 'node-right', target: 'hub', targetHandle: 'node-left' },
  { id: 'p3', source: 'hub', sourceHandle: 'node-right', target: 'sinkC', targetHandle: 'node-left' },
  { id: 'p4', source: 'hub', sourceHandle: 'node-right', target: 'sinkD', targetHandle: 'node-left' },
  { id: 'p5', source: 'farE', sourceHandle: 'node-right', target: 'farF', targetHandle: 'node-left' },
  { id: 'p6', source: 'srcJ', sourceHandle: 'output-orderId', target: 'sinkD', targetHandle: 'input-userId' },
]

describe('computeNodeAdjacentPipes', () => {
  it('takes both incoming and outgoing pipes', () => {
    expect([...computeNodeAdjacentPipes('hub', pipes)].sort()).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('does NOT propagate past the first ring', () => {
    // sinkC is one hop beyond hub. If the seed ever grows into a traversal, p3's sibling
    // edges around hub would appear here — that is the "顺手改成传递" this asserts against.
    expect([...computeNodeAdjacentPipes('sinkC', pipes)]).toEqual(['p3'])
  })

  it('takes a pipe whose far end is a field handle, same as any other', () => {
    // The node kind knows nothing about handles, which is exactly why a node click cannot
    // tint a field row on the node at the other end.
    expect([...computeNodeAdjacentPipes('sinkD', pipes).values()].sort()).toEqual(['p4', 'p6'])
  })

  it('gives an isolated node an empty set, not an error', () => {
    expect(computeNodeAdjacentPipes('iso', pipes).size).toBe(0)
  })

  it('gives an unknown node id an empty set', () => {
    expect(computeNodeAdjacentPipes('nope', pipes).size).toBe(0)
  })

  it('counts a self-loop once', () => {
    const loop = [{ id: 'L', source: 'a', sourceHandle: 'node-right', target: 'a', targetHandle: 'node-left' }]
    expect([...computeNodeAdjacentPipes('a', loop)]).toEqual(['L'])
  })
})
