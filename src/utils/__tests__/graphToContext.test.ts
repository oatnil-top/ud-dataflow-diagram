// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { graphToContext } from '../graphToContext'
import { buildCopyPrompt, DATAFLOW_COPY_PROMPT } from '../graphToPrompt'
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

describe('buildCopyPrompt', () => {
  it('an empty canvas gets the prompt alone', () => {
    const prompt = buildCopyPrompt([], [])
    expect(prompt.text).toBe(DATAFLOW_COPY_PROMPT)
    expect(prompt.contextNodes).toBe(0)
  })

  it('a non-empty canvas is appended under the heading the prompt tells the model to read', () => {
    const prompt = buildCopyPrompt(nodes, pipes)
    expect(prompt.text).toContain('## Current graph')
    expect(prompt.text).toContain('"id": "users"')
    expect(prompt.contextNodes).toBe(1)
    // The clause and the section have to agree on the exact heading or the contract is dead.
    expect(DATAFLOW_COPY_PROMPT).toContain('"Current graph" section')
  })

  it('the prompt stays small enough to paste into a free chat box', () => {
    expect(Buffer.byteLength(DATAFLOW_COPY_PROMPT)).toBeLessThan(4500)
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
