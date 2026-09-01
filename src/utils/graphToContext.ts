import type { AnyNode, Pipe } from '../store/flowStore'

/**
 * The current graph, written for a chat model to read AND write back.
 *
 * Subtraction from exportGraph (flowStore.ts), not a third format: same keys, same
 * meanings, geometry removed. What survives is exactly what a model needs to add to a
 * graph — `id` above all, because "connect this to orders" is unsayable without it.
 *
 * Three neighbours it is deliberately not:
 *  - exportGraph — carries position/style/measured. Roughly double the tokens, and a
 *    model handed coordinates drops them anyway (design fb629b6a §5 out⑥: 3/3 nodes came
 *    back with no position), so they are paid for and thrown away.
 *  - graphToText ("Copy for AI") — renders connections by NAME and writes no ids at all.
 *    That is on purpose and confirmed by master (2026-09-01, note f1b7e5ac): it is a
 *    read-only, token-thrifty view. It is not a round-trip format and must not grow ids
 *    to become one.
 *  - the import format — this IS the import format, minus optional keys. Whatever comes
 *    back parses through importFormats.ts with no translation step.
 */

/** Node keys that describe where something is drawn rather than what it is. */
const GEOMETRY_KEYS = ['position', 'positionAbsolute', 'style', 'measured', 'width', 'height',
  'selected', 'dragging', 'resizing', 'zIndex', 'extent', 'expandParent'] as const

export interface GraphContextOptions {
  /**
   * Byte budget for the serialized context. Free chat inputs have a ceiling nobody
   * publishes, so past this the context degrades (example values first — they teach the
   * model nothing about structure) rather than being silently truncated into a
   * half-object that no longer parses.
   */
  maxBytes?: number
}

export interface GraphContext {
  json: string
  nodeCount: number
  pipeCount: number
  /** True when example values were dropped to fit maxBytes — the caller says so. */
  degraded: boolean
}

const DEFAULT_MAX_BYTES = 30_000

export function graphToContext(
  nodes: AnyNode[],
  pipes: Pipe[],
  options: GraphContextOptions = {},
): GraphContext {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES

  const full = serialize(nodes, pipes, false)
  if (byteLength(full) <= maxBytes) {
    return { json: full, nodeCount: nodes.length, pipeCount: pipes.length, degraded: false }
  }
  return {
    json: serialize(nodes, pipes, true),
    nodeCount: nodes.length,
    pipeCount: pipes.length,
    degraded: true,
  }
}

function serialize(nodes: AnyNode[], pipes: Pipe[], dropExamples: boolean): string {
  const cleanNodes = nodes.map((node) => {
    const rest: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node as unknown as Record<string, unknown>)) {
      if ((GEOMETRY_KEYS as readonly string[]).includes(key)) continue
      if (value === undefined) continue
      rest[key] = key === 'data' ? cleanData(value, dropExamples) : value
    }
    return rest
  })
  const cleanPipes = pipes.map((pipe) => ({
    source: pipe.source,
    target: pipe.target,
    ...(pipe.sourceHandle ? { sourceHandle: pipe.sourceHandle } : {}),
    ...(pipe.targetHandle ? { targetHandle: pipe.targetHandle } : {}),
  }))
  return JSON.stringify({ nodes: cleanNodes, pipes: cleanPipes }, null, 2)
}

/** Walk node data dropping `example` values — the one key that is pure sample payload. */
function cleanData(value: unknown, dropExamples: boolean): unknown {
  if (!dropExamples) return value
  if (Array.isArray(value)) return value.map((v) => cleanData(v, true))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'example') continue
      out[key] = cleanData(v, true)
    }
    return out
  }
  return value
}

function byteLength(text: string): number {
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : text.length
}
