// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createFlowStore } from '../flowStore'
import { importPastedGraph } from '../pasteImport'
import { parseDsl } from '../dslParser'
import type { ArrangeOp } from '../../utils/arrangeNodes'

/**
 * Task 5b0bfd1e criterion B, run verbatim at store level, on BOTH paste channels:
 *
 *   import a batch → do NOT click anything → press each of the four arrangement
 *   buttons once → only the newly imported nodes moved, every other node held still.
 *
 * The command (DSL) channel already selects what it creates (editPlan.ts); the JSON
 * channel must behave identically or "paste the AI's answer" arranges or doesn't
 * arrange depending on which format the model happened to answer in.
 */

const EXISTING = {
  nodes: [
    { id: 'old1', type: 'json', position: { x: 1000, y: 1000 }, data: { name: 'old1', fields: [] } },
    { id: 'old2', type: 'json', position: { x: 1300, y: 1100 }, data: { name: 'old2', fields: [] } },
  ],
  pipes: [],
}

const NEW_BATCH = {
  nodes: [
    { id: 'n1', type: 'json', position: { x: 40, y: 30 }, data: { name: 'n1', fields: [] } },
    { id: 'n2', type: 'json', position: { x: 400, y: 90 }, data: { name: 'n2', fields: [] } },
    { id: 'n3', type: 'json', position: { x: 220, y: 200 }, data: { name: 'n3', fields: [] } },
  ],
  pipes: [{ source: 'n1', target: 'n2' }],
}

/** A store holding two saved, UNselected nodes — a document the user opened. */
function storeWithExisting() {
  const store = createFlowStore()
  store.getState().importGraph(JSON.stringify(EXISTING), undefined, { replace: true })
  expect(store.getState().nodes.every((n) => !n.selected)).toBe(true)
  return store
}

const positionsOf = (store: ReturnType<typeof createFlowStore>, ids: readonly string[]) =>
  Object.fromEntries(store.getState().nodes.filter((n) => ids.includes(n.id)).map((n) => [n.id, { ...n.position }]))

function pasteJson(store: ReturnType<typeof createFlowStore>) {
  const s = store.getState()
  const outcome = importPastedGraph(JSON.stringify(NEW_BATCH), {
    importGraph: s.importGraph,
    applyEditPlan: s.applyEditPlan,
    setImportSummary: s.setImportSummary,
  })
  expect(outcome.ok).toBe(true)
}

function pasteDsl(store: ReturnType<typeof createFlowStore>) {
  const s = store.getState()
  const plan = parseDsl(['node d1: D1', 'node d2: D2', 'node d3: D3', 'link d1 -> d2'].join('\n'))
  expect(s.applyEditPlan(plan)).toMatchObject({ addedNodes: 3 })
}

/**
 * Scatter the new batch so every operation has real work to do (without a viewport the
 * DSL channel stacks its creations, and an already-aligned batch would make the
 * assertions below vacuously true). Positions only — the selection state under test is
 * exactly what the paste left behind.
 */
const SCATTER: Record<number, { x: number; y: number }> = {
  0: { x: 40, y: 30 },
  1: { x: 400, y: 90 },
  2: { x: 220, y: 200 },
}
function scatter(store: ReturnType<typeof createFlowStore>, ids: readonly string[]) {
  store.setState({
    nodes: store.getState().nodes.map((n) =>
      ids.includes(n.id) ? { ...n, position: SCATTER[ids.indexOf(n.id)] } : n,
    ),
  })
}

describe('JSON paste marks the new batch selected, exactly as the command channel does', () => {
  it('new nodes arrive selected, previously saved nodes are deselected', () => {
    const store = storeWithExisting()
    pasteJson(store)

    const byId = new Map(store.getState().nodes.map((n) => [n.id, n]))
    expect(byId.get('n1')?.selected).toBe(true)
    expect(byId.get('n2')?.selected).toBe(true)
    expect(byId.get('n3')?.selected).toBe(true)
    expect(byId.get('old1')?.selected ?? false).toBe(false)
    expect(byId.get('old2')?.selected ?? false).toBe(false)
  })

  it('opening a document (replace mode) still selects nothing — paste semantics must not leak into open', () => {
    const store = createFlowStore()
    store.getState().importGraph(JSON.stringify(NEW_BATCH), undefined, { replace: true })
    expect(store.getState().nodes.every((n) => !n.selected)).toBe(true)
  })
})

const OPS: ArrangeOp[] = ['align-left', 'align-right', 'row', 'column']

describe.each([
  ['JSON channel', pasteJson, ['n1', 'n2', 'n3']],
  ['command (DSL) channel', pasteDsl, ['d1', 'd2', 'd3']],
] as const)('%s: import a batch, press each button once, nothing else moves', (_name, paste, newIds) => {
  it.each(OPS)('%s moves only the imported batch', (op) => {
    const store = storeWithExisting()
    paste(store)
    scatter(store, newIds)
    // control: scattering touched positions only — the imported batch is still selected
    expect(store.getState().nodes.filter((n) => n.selected).map((n) => n.id).sort()).toEqual([...newIds].sort())
    const oldBefore = positionsOf(store, ['old1', 'old2'])
    const newBefore = positionsOf(store, newIds)

    const summary = store.getState().arrangeSelection(op)

    // A node already sitting on the target coordinate does not count as moved,
    // so the exact count is 2 of 3 for this scatter — never fewer, never a skip.
    expect(summary.skipped).toBe(0)
    expect(summary.moved).toBeGreaterThanOrEqual(2)
    expect(positionsOf(store, ['old1', 'old2'])).toEqual(oldBefore)
    expect(positionsOf(store, newIds)).not.toEqual(newBefore)
    // and the arrangement really happened: one shared coordinate on the arranged axis
    const arranged = store.getState().nodes.filter((n) => (newIds as readonly string[]).includes(n.id))
    if (op === 'align-left') expect(new Set(arranged.map((n) => n.position.x)).size).toBe(1)
    if (op === 'column') expect(new Set(arranged.map((n) => n.position.x)).size).toBe(1)
    if (op === 'row') expect(new Set(arranged.map((n) => n.position.y)).size).toBe(1)
  })

  it('one press is one undo entry — undo restores the pre-arrangement scatter', () => {
    const store = storeWithExisting()
    paste(store)
    scatter(store, newIds)
    const before = positionsOf(store, newIds)

    store.getState().arrangeSelection('row')
    expect(positionsOf(store, newIds)).not.toEqual(before)
    store.getState().undo()
    expect(positionsOf(store, newIds)).toEqual(before)
  })
})

describe('manual selection works the same — the buttons are not an import-only feature', () => {
  it('selecting two saved nodes by hand and pressing align-left moves exactly those two', () => {
    const store = storeWithExisting()
    store.setState({
      nodes: store.getState().nodes.map((n) => (n.id === 'old1' || n.id === 'old2' ? { ...n, selected: true } : n)),
    })

    const summary = store.getState().arrangeSelection('align-left')

    // old1 already sits on the target x, so exactly one node moves
    expect(summary).toMatchObject({ moved: 1, skipped: 0 })
    const byId = new Map(store.getState().nodes.map((n) => [n.id, n]))
    expect(byId.get('old1')?.position.x).toBe(1000)
    expect(byId.get('old2')?.position.x).toBe(1000)
  })

  it('a selection too small to arrange changes nothing and pushes no undo entry', () => {
    const store = storeWithExisting()
    store.setState({
      nodes: store.getState().nodes.map((n) => (n.id === 'old1' ? { ...n, selected: true } : n)),
    })
    const undoBefore = store.getState().canUndo

    const summary = store.getState().arrangeSelection('row')

    expect(summary).toMatchObject({ moved: 0 })
    expect(store.getState().canUndo).toBe(undoBefore)
  })
})
