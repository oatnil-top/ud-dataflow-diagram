// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createFlowStore } from '../flowStore'
import { importPastedGraph, clipboardTextIsGraph } from '../pasteImport'

/**
 * The riskiest square on the board — design fb629b6a note 9630c775 §7: format
 * misdispatch. The rule is written down and asserted here, one case per payload kind,
 * plus the one that motivated writing the rule down: text that LOOKS like JSON and is
 * broken must fail in the JSON branch by its own name, never fall through to DSL and be
 * reported as "no commands found".
 */

const target = (store: ReturnType<typeof createFlowStore>) => ({
  importGraph: store.getState().importGraph,
  applyEditPlan: store.getState().applyEditPlan,
  setImportSummary: store.getState().setImportSummary,
})

const seeded = () => {
  const store = createFlowStore()
  store.getState().importGraph(JSON.stringify({
    nodes: [
      { id: 'users', type: 'json', position: { x: 0, y: 0 }, data: { name: 'users', fields: [] } },
      { id: 'orders', type: 'json', position: { x: 400, y: 0 }, data: { name: 'orders', fields: [] } },
    ],
    pipes: [],
  }), undefined, { replace: true })
  return store
}

const FULL_JSON = JSON.stringify({
  nodes: [{ id: 'a', type: 'json', data: { name: 'a', fields: [] } }],
  pipes: [],
})
const PIPE_DELTA = JSON.stringify({ pipes: [{ source: 'users', target: 'orders' }] })
const DSL = 'node payments 支付: amount number\nlink orders -> payments'

describe('§2 — one payload kind, one branch', () => {
  it('a full JSON paste goes to the JSON branch and behaves exactly as before', () => {
    const store = createFlowStore()
    const outcome = importPastedGraph(FULL_JSON, target(store))
    expect(outcome).toMatchObject({ ok: true, result: { addedNodes: 1, format: 'json' } })
  })

  it('a fenced JSON paste is still JSON — the fence does not make it DSL', () => {
    const store = createFlowStore()
    const outcome = importPastedGraph('Here you go:\n```json\n' + FULL_JSON + '\n```', target(store))
    expect(outcome).toMatchObject({ ok: true, result: { addedNodes: 1, format: 'json' } })
  })

  it('a pure pipe JSON delta still goes to the JSON branch (kept, no longer taught)', () => {
    const store = seeded()
    const outcome = importPastedGraph(PIPE_DELTA, target(store))
    expect(outcome).toMatchObject({ ok: true, result: { addedNodes: 0, addedPipes: 1, format: 'json' } })
  })

  it('a DSL paste goes to the DSL branch', () => {
    const store = seeded()
    const outcome = importPastedGraph(DSL, target(store))
    expect(outcome).toMatchObject({ ok: true, result: { addedNodes: 1, addedPipes: 1, format: 'dsl' } })
  })

  it('a fenced DSL paste is unwrapped by the shared layer first', () => {
    const store = seeded()
    const outcome = importPastedGraph('```\n' + DSL + '\n```', target(store))
    expect(outcome).toMatchObject({ ok: true, result: { addedNodes: 1, format: 'dsl' } })
  })
})

describe('§2 — the case the rule exists for', () => {
  it('JSON that got cut off fails as "truncated", NOT as a DSL payload with zero commands', () => {
    const store = createFlowStore()
    const outcome = importPastedGraph('{"nodes": [{"id": "a", "type": "json", "data": {"name": "a"', target(store))
    expect(outcome).toEqual({ ok: false, reason: 'truncated' })
  })

  it('JSON that is complete but unreadable fails as "malformed", not as DSL', () => {
    const store = createFlowStore()
    // Brackets balance, so this is not truncation — it is an unquoted key the repair
    // pass cannot rescue. The point is that the verdict comes from the JSON branch.
    const outcome = importPastedGraph('{nodes: []}', target(store))
    expect(outcome).toEqual({ ok: false, reason: 'malformed' })
  })

  it('a payload opening with [ is JSON too, and is refused as not-a-graph', () => {
    const store = createFlowStore()
    const outcome = importPastedGraph('[{"id":"a"}]', target(store))
    expect(outcome.ok).toBe(false)
    expect(outcome).not.toMatchObject({ reason: 'noJson' })
  })

  it('a retired dialect is still refused by name before anything is applied', () => {
    const store = createFlowStore()
    const outcome = importPastedGraph(JSON.stringify({ nodes: [{ name: 'users', fields: [] }] }), target(store))
    expect(outcome).toEqual({ ok: false, reason: 'legacyDialect' })
  })
})

describe('§2 — the DSL branch names its own failures', () => {
  it('a refusal with no commands at all is noJson', () => {
    const store = createFlowStore()
    expect(importPastedGraph('I cannot help with that.', target(store)))
      .toEqual({ ok: false, reason: 'noJson' })
  })

  it('lines that begin with a verb but cannot be read are named, not silently noJson', () => {
    const store = createFlowStore()
    expect(importPastedGraph('link\nnode', target(store)))
      .toEqual({ ok: false, reason: 'dslUnreadable' })
  })

  it('a DSL payload that parses but changes nothing still reports what it did', () => {
    const store = seeded()
    const outcome = importPastedGraph('link users -> ghosts', target(store))
    expect(outcome).toMatchObject({ ok: true, result: { addedNodes: 0, addedPipes: 0 } })
  })
})

describe('Ctrl+V probe stays narrow — plain text must remain a note', () => {
  it('a sentence that happens to start with the word "node" is NOT a diagram', () => {
    expect(clipboardTextIsGraph('node modules are broken again')).toBe(false)
  })

  it('real DSL output IS a diagram', () => {
    expect(clipboardTextIsGraph(DSL)).toBe(true)
  })

  it('a shopping list is not a diagram', () => {
    expect(clipboardTextIsGraph('milk\neggs\nbread')).toBe(false)
  })

  it('graph JSON is still recognised', () => {
    expect(clipboardTextIsGraph(FULL_JSON)).toBe(true)
  })
})
