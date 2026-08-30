import { nodeTypes, edgeTypes } from '../../src/registry'
import { SAMPLE_JSON } from '../sample'

const g = JSON.parse(SAMPLE_JSON) as {
  nodes: { id: string; type: string }[]
  pipes: { type: string; source: string; target: string }[]
}

test('every sample node type is registered — an unknown type renders as a blank box with no error (registry.ts:13-17)', () => {
  expect(g.nodes.length).toBeGreaterThan(0)
  for (const n of g.nodes) expect(Object.keys(nodeTypes)).toContain(n.type)
})

test('every sample pipe is typed dataflow and joins two existing nodes', () => {
  expect(g.pipes.length).toBeGreaterThan(0)
  const ids = new Set(g.nodes.map((n) => n.id))
  for (const e of g.pipes) {
    expect(Object.keys(edgeTypes)).toContain(e.type)
    expect(ids.has(e.source) && ids.has(e.target)).toBe(true)
  }
})
