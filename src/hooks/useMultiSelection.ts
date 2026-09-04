import { useStore } from '@xyflow/react'

/**
 * True when MORE than one element (node or edge) is selected — the signal that
 * per-node style panels must stay closed (owner, 2026-09-04: a rubber-band over
 * five icons popped five floating panels; with a multi-selection the batch bar at
 * the bottom is the one control that shows). Early-exits at the second hit, so
 * the selector stays O(selection) per store change.
 */
export function useMultiSelection(): boolean {
  return useStore((s) => {
    let count = 0
    for (const n of s.nodes) {
      if (n.selected && ++count > 1) return true
    }
    for (const e of s.edges) {
      if (e.selected && ++count > 1) return true
    }
    return false
  })
}
