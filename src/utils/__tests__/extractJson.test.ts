// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { extractGraphJson, extractJson, looksLikeGraphPayload } from '../extractJson'

/**
 * The wrapper layer, which is where every real failure was (design fb629b6a §5: six runs,
 * zero structural errors, five fences). Shapes here mirror those runs — a fenced object, a
 * fence followed by Chinese prose, and a copy that stops mid-field.
 */

const GRAPH = { nodes: [{ id: 'users', type: 'json', data: { name: 'users', fields: [] } }], pipes: [] }
const body = JSON.stringify(GRAPH, null, 2)

describe('the shapes real chat output arrives in', () => {
  it('bare JSON', () => {
    expect(extractGraphJson(body)).toEqual({ ok: true, value: GRAPH })
  })

  it('wrapped in a ```json fence — 5 of 5 real runs, including the ones told not to', () => {
    expect(extractGraphJson('```json\n' + body + '\n```')).toEqual({ ok: true, value: GRAPH })
  })

  it('fence followed by explanatory prose (out②)', () => {
    const raw = '```json\n' + body + '\n```\n\n## 表结构说明\n\n- **用户**:存储用户信息。\n'
    expect(extractGraphJson(raw)).toEqual({ ok: true, value: GRAPH })
  })

  it('prose on both sides, no fence at all', () => {
    expect(extractGraphJson('Sure! Here you go:\n' + body + '\nLet me know if you want more.'))
      .toEqual({ ok: true, value: GRAPH })
  })
})

describe('failures are told apart, because they send the user to different places', () => {
  it('a copy that stops mid-object is truncated, not malformed', () => {
    const half = '```json\n' + body.slice(0, 60)
    expect(extractGraphJson(half)).toEqual({ ok: false, reason: 'truncated' })
  })

  it('unbalanced braces without any fence are truncated too', () => {
    expect(extractGraphJson('{"nodes": [{"id": "a"}')).toEqual({ ok: false, reason: 'truncated' })
  })

  it('a refusal with no object anywhere is noJson', () => {
    expect(extractGraphJson("I'm sorry, I can't help with that."))
      .toEqual({ ok: false, reason: 'noJson' })
  })

  it('empty input is noJson, not a crash', () => {
    expect(extractGraphJson('')).toEqual({ ok: false, reason: 'noJson' })
    expect(extractGraphJson('   \n ')).toEqual({ ok: false, reason: 'noJson' })
  })

  it('a complete but unreadable object is malformed', () => {
    expect(extractGraphJson('{"nodes": [oops]}')).toEqual({ ok: false, reason: 'malformed' })
  })
})

describe('the repair pass', () => {
  it('fixes a trailing comma', () => {
    expect(extractGraphJson('{"a": [1, 2,], "b": 3,}')).toEqual({ ok: true, value: { a: [1, 2], b: 3 } })
  })

  it('fixes full-width punctuation between tokens', () => {
    expect(extractGraphJson('{"a"：1，"b"：2}')).toEqual({ ok: true, value: { a: 1, b: 2 } })
  })

  it('fixes curly quotes as delimiters', () => {
    expect(extractGraphJson('{“a”: 1}')).toEqual({ ok: true, value: { a: 1 } })
  })

  it('⛔ never rewrites punctuation INSIDE a string — a Chinese label is data, not syntax', () => {
    const withCjkComma = '{"name": "用户,订单:总表"}'
    expect(extractGraphJson(withCjkComma)).toEqual({ ok: true, value: { name: '用户,订单:总表' } })
  })

  it('⛔ never eats a comma inside a string that happens to precede a brace', () => {
    // The regex version of the trailing-comma fix corrupts exactly this input.
    const raw = '{"note": "a, }", "b": 1,}'
    expect(extractGraphJson(raw)).toEqual({ ok: true, value: { note: 'a, }', b: 1 } })
  })

  it('an escaped quote does not end the string early', () => {
    expect(extractGraphJson('{"q": "he said \\", then left", "b": 2,}'))
      .toEqual({ ok: true, value: { q: 'he said ", then left', b: 2 } })
  })
})

describe('extractJson keeps its old contract for the in-app AI panel', () => {
  it('returns the value or null, never throws', () => {
    expect(extractJson('```json\n' + body + '\n```')).toEqual(GRAPH)
    expect(extractJson('nope')).toBeNull()
    expect(extractJson('')).toBeNull()
  })
})

describe('looksLikeGraphPayload — the canvas Ctrl+V probe', () => {
  it('accepts the editor format', () => {
    expect(looksLikeGraphPayload(GRAPH)).toBe(true)
  })

  it('rejects ten JSON files a user might want kept as a note', () => {
    const notes: unknown[] = [
      { name: 'my-app', version: '1.0.0', dependencies: { react: '^18' } },
      { nodes: ['a', 'b'] },
      { nodes: [{ id: 'a' }] },
      { nodes: [{ type: 'json' }] },
      { nodes: [{ data: { name: 'x' } }] },
      { data: { nodes: [] } },
      [{ type: 'json', data: {} }],
      { nodes: [] },
      { results: [{ type: 'row', data: { id: 1 } }] },
      'just a string',
    ]
    const eaten = notes.filter(looksLikeGraphPayload)
    expect(eaten).toEqual([])
  })

  it('accepts a pure pipe delta — a payload whose only new thing is a connection', () => {
    expect(looksLikeGraphPayload({ nodes: [], pipes: [{ source: 'users', target: 'orders' }] })).toBe(true)
    expect(looksLikeGraphPayload({ pipes: [{ source: 'users', target: 'orders' }] })).toBe(true)
    expect(looksLikeGraphPayload({ edges: [{ source: 'users', target: 'orders' }] })).toBe(true)
  })

  it('rejects the connection-ish shapes other tools write', () => {
    const notMine: unknown[] = [
      // GraphQL connection — `edges` of {node, cursor}, no endpoints
      { edges: [{ node: { id: 1 }, cursor: 'abc' }] },
      // ELK / dagre layout input — plural keys, arrays not strings
      { edges: [{ id: 'e1', sources: ['a'], targets: ['b'] }] },
      // Cytoscape — endpoints nested under `data`
      { edges: [{ data: { source: 'a', target: 'b' } }] },
      // A route table: the words are there, the shape is not
      { pipes: ['a', 'b'] },
      { edges: [] },
      { pipes: [{ source: 'a' }] },
      { pipes: [{ source: 1, target: 2 }] },
    ]
    expect(notMine.filter(looksLikeGraphPayload)).toEqual([])
  })

  it('rejects null and primitives without throwing', () => {
    expect(looksLikeGraphPayload(null)).toBe(false)
    expect(looksLikeGraphPayload(42)).toBe(false)
    expect(looksLikeGraphPayload(undefined)).toBe(false)
  })
})
