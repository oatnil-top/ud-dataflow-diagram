// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createFlowStore } from '../flowStore'
import type { PipeData } from '../../types'

/**
 * Route anchors persist with the document (owner 2026-09-04) — the half of the
 * feature that regresses silently: a line that LOOKS routed while editing but
 * reloads straight. Asserted through the real save/open pair (exportGraph →
 * importGraph replace), plus the one deliberate loss: a SHIFTED merge-paste drops
 * anchors instead of keeping bends that now point at nothing (importFormats.ts).
 */

const GRAPH = {
  nodes: [
    { id: 'a', type: 'json', position: { x: 0, y: 0 }, data: { name: 'a', fields: [] } },
    { id: 'b', type: 'json', position: { x: 600, y: 0 }, data: { name: 'b', fields: [] } },
  ],
  pipes: [{ id: 'p1', source: 'a', target: 'b' }],
}

const waypointsOf = (store: ReturnType<typeof createFlowStore>) =>
  (store.getState().pipes[0]?.data as PipeData | undefined)?.waypoints

describe('pipe route anchors', () => {
  it('survive save → open exactly, and one undo removes the routing', () => {
    const store = createFlowStore()
    store.getState().importGraph(JSON.stringify(GRAPH), undefined, { replace: true })
    const pipeId = store.getState().pipes[0].id
    store.getState().updatePipe(pipeId, { waypoints: [{ x: 300, y: 200 }, { x: 450, y: 200 }] })

    const saved = store.getState().exportGraph()
    expect(saved).toContain('"waypoints"')

    const reopened = createFlowStore()
    reopened.getState().importGraph(saved, undefined, { replace: true })
    expect(waypointsOf(reopened)).toEqual([{ x: 300, y: 200 }, { x: 450, y: 200 }])

    store.getState().undo()
    expect(waypointsOf(store)).toBeUndefined()
  })

  it('removing the last anchor removes the key from the saved document, not an empty []', () => {
    const store = createFlowStore()
    store.getState().importGraph(JSON.stringify(GRAPH), undefined, { replace: true })
    const pipeId = store.getState().pipes[0].id
    store.getState().updatePipe(pipeId, { waypoints: [{ x: 300, y: 200 }] })
    store.getState().updatePipe(pipeId, { waypoints: undefined })
    expect(store.getState().exportGraph()).not.toContain('"waypoints"')
  })

  it('a SHIFTED merge-paste drops anchors — bends must not outlive the geometry they bent around', () => {
    const store = createFlowStore()
    store.getState().importGraph(JSON.stringify(GRAPH), undefined, { replace: true })

    const withAnchors = {
      nodes: [{ id: 'c', type: 'json', position: { x: 0, y: 0 }, data: { name: 'c', fields: [] } }],
      pipes: [{ id: 'p2', source: 'c', target: 'c', data: { waypoints: [{ x: 50, y: 50 }] } }],
    }
    // viewportCenter forces the centering shift — the case the strip exists for
    store.getState().importGraph(JSON.stringify(withAnchors), { x: 2000, y: 2000 })

    const merged = store.getState().pipes.find((p) => p.source !== 'a')
    expect(merged).toBeDefined()
    expect((merged?.data as PipeData | undefined)?.waypoints).toBeUndefined()
  })
})
