import type { FlowStore } from '../store/flowStore'

/**
 * Debounced autosave for hosts whose storage is cheap and local (the playground's
 * localStorage) — where an explicit Save button is embed furniture, like Save & Close
 * and the X before it (owner, 2026-09-04). A server-backed host keeps manual save;
 * a write per keystroke against a network is a different decision than against
 * localStorage, so autosave is opt-in (DataflowEditor `autoSave`).
 *
 * Rides the same dirty flag undo rides: every edit takes a snapshot and sets
 * `isDirty` (flowStore takeSnapshot), so "dirty and still being edited" resets the
 * timer, and the save fires once the edits pause. On success the store is marked
 * clean; on failure it stays dirty — the next edit retries, and beforeunload still
 * sees unsaved work.
 *
 * A plain function over the store, not a hook, so it is unit-testable with a real
 * createFlowStore and fake timers (project rule: most logic callable as a plain
 * function).
 */
export function startAutoSave(
  store: FlowStore,
  save: (graphJson: string) => Promise<void>,
  debounceMs = 800,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const flush = async () => {
    const state = store.getState()
    if (!state.isDirty) return
    try {
      await save(state.exportGraph())
      if (!stopped) store.getState().markClean()
    } catch (error) {
      // stay dirty; the next edit re-arms the timer and retries
      console.error('Autosave failed:', error)
    }
  }

  const unsubscribe = store.subscribe((state) => {
    if (!state.isDirty) return
    clearTimeout(timer)
    timer = setTimeout(flush, debounceMs)
  })

  return () => {
    stopped = true
    clearTimeout(timer)
    unsubscribe()
  }
}
