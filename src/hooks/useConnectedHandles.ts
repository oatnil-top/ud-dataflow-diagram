import { useStore } from '@xyflow/react'

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a === b) return true
  if (a.size !== b.size) return false
  for (const v of a) {
    if (!b.has(v)) return false
  }
  return true
}

/**
 * Handle IDs on this node that have at least one connected edge.
 *
 * The selector builds a fresh Set each run, so it MUST be paired with a
 * value equality function — with React Flow's default reference equality
 * every store update (including each drag frame of any node) would count as
 * a change and re-render every subscribed node, defeating their memo().
 */
export function useConnectedHandles(nodeId: string): Set<string> {
  return useStore(
    (state) => {
      const connected = new Set<string>()
      for (const edge of state.edges) {
        if (edge.source === nodeId && edge.sourceHandle) connected.add(edge.sourceHandle)
        if (edge.target === nodeId && edge.targetHandle) connected.add(edge.targetHandle)
      }
      return connected
    },
    setsEqual,
  )
}
