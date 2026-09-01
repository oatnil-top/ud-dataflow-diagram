// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { graphToContext } from '../graphToContext'
import { buildGraphForEditing, DATAFLOW_COPY_PROMPT } from '../graphToPrompt'
import type { AnyNode, Pipe } from '../../store/flowStore'
import { createFlowStore } from '../../store/flowStore'

const nodes = [
  {
    id: 'users', type: 'json', position: { x: 12, y: 34 },
    style: { width: 300 }, measured: { width: 300, height: 90 }, selected: true, dragging: false,
    data: { name: 'users', fields: [{ id: 'f1', name: 'id', path: ['id'], type: 'uuid', example: 'uuid' }] },
  },
] as unknown as AnyNode[]
const pipes = [
  { id: 'p1', type: 'dataflow', source: 'users', target: 'orders', sourceHandle: 'output-id', targetHandle: 'input-user_id', selected: true },
] as unknown as Pipe[]

describe('graphToContext — exportGraph minus geometry', () => {
  it('keeps id, type, data; drops every coordinate and render artefact', () => {
    const parsed = JSON.parse(graphToContext(nodes, pipes).json)
    expect(parsed.nodes[0]).toEqual({
      id: 'users',
      type: 'json',
      data: { name: 'users', fields: [{ id: 'f1', name: 'id', path: ['id'], type: 'uuid', example: 'uuid' }] },
    })
    expect(parsed.pipes[0]).toEqual({
      source: 'users', target: 'orders', sourceHandle: 'output-id', targetHandle: 'input-user_id',
    })
  })

  it('🔴 keeps ids — without them a model cannot say "connect this to orders"', () => {
    expect(graphToContext(nodes, pipes).json).toContain('"id": "users"')
  })

  it('what it produces imports back cleanly — it IS the import format', () => {
    const store = createFlowStore()
    const result = store.getState().importGraph(graphToContext(nodes, []).json, undefined, { replace: true })
    expect(result).toMatchObject({ addedNodes: 1 })
    expect(store.getState().nodes[0].id).toBe('users')
  })

  it('drops example values rather than being truncated when it exceeds the budget', () => {
    const big = Array.from({ length: 40 }, (_, i) => ({
      id: `n${i}`, type: 'json', position: { x: 0, y: 0 },
      data: { name: `table_${i}`, fields: Array.from({ length: 12 }, (_, f) => ({
        name: `field_${f}`, path: [`field_${f}`], type: 'string', example: 'x'.repeat(80),
      })) },
    })) as unknown as AnyNode[]

    const ctx = graphToContext(big, [], { maxBytes: 4000 })
    expect(ctx.degraded).toBe(true)
    expect(ctx.json).not.toContain('"example"')
    // Still a complete, parseable object — degrading must never mean cutting it short.
    expect(() => JSON.parse(ctx.json)).not.toThrow()
    expect(JSON.parse(ctx.json).nodes).toHaveLength(40)
  })
})

describe('the copy prompt and the graph are two separate clipboards now', () => {
  it('the prompt NEVER carries the diagram — that is the whole reason they were split', () => {
    expect(DATAFLOW_COPY_PROMPT).not.toContain('Current graph')
    expect(DATAFLOW_COPY_PROMPT).not.toContain('"id"')
  })

  it('the prompt teaches the two verbs and nothing that could describe a document', () => {
    expect(DATAFLOW_COPY_PROMPT).toContain('node <id> <display name>')
    expect(DATAFLOW_COPY_PROMPT).toContain('link <sourceId> -> <targetId>')
    // Geometry, grouping and handles are unsayable in the grammar; the material must not
    // hint otherwise, or a model will invent syntax the parser cannot read.
    expect(DATAFLOW_COPY_PROMPT).not.toMatch(/position|parentId|sourceHandle|"nodes"/)
  })

  it('it is the delivered 1296-byte artifact, not a draft — free chat boxes have a ceiling', () => {
    const bytes = Buffer.byteLength(DATAFLOW_COPY_PROMPT)
    expect(bytes).toBeGreaterThan(1000)
    expect(bytes).toBeLessThan(1600)
  })

  it('buildGraphForEditing hands over the ids a link command has to name', () => {
    const graph = buildGraphForEditing(nodes, pipes)
    expect(graph.text).toContain('"id": "users"')
    expect(graph.nodeCount).toBe(1)
  })

  it('an empty canvas has no graph to hand over', () => {
    expect(buildGraphForEditing([], [])).toMatchObject({ text: '', nodeCount: 0 })
  })

  it('⛔ graphToText stays id-free — this channel must not turn "Copy for AI" writable', async () => {
    // Its id and its name are deliberately different, so "the id is absent" is a claim
    // the assertion can actually make. master confirmed (2026-09-01, note f1b7e5ac) that
    // Copy for AI is a read-only, token-thrifty view; the round trip is graphToContext's
    // job, and giving graphToText ids to serve this feature would cost it both of its own.
    const { graphToText } = await import('../graphToText')
    const withDistinctId = [{
      id: 'n_7fk2p', type: 'json', position: { x: 0, y: 0 },
      data: { name: 'users', fields: [{ id: 'f1', name: 'id', path: ['id'], type: 'uuid', example: 'uuid' }] },
    }] as unknown as AnyNode[]

    const text = graphToText(withDistinctId as never, [] as never)
    expect(text).toContain('users')
    expect(text).not.toContain('n_7fk2p')
  })
})
