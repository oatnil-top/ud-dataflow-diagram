import { createContext, useContext } from 'react'
import type { FlowStore } from './flowStore'

export const FlowStoreContext = createContext<FlowStore | null>(null)

/** Typed accessor — the canvas always provides the store, so a missing provider is a programming error. */
export function useFlowStore(): FlowStore {
  const store = useContext(FlowStoreContext)
  if (!store) throw new Error('useFlowStore must be used within a FlowStoreContext.Provider')
  return store
}
