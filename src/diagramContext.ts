import { createContext, useContext } from 'react'

/**
 * Which stored diagram this canvas is showing, if any.
 *
 * A node needs this to resolve its image. Images in a diagram are `resources`
 * rows that were never shared themselves, so they are read THROUGH the diagram:
 * whoever can see the diagram can see the pictures in it, and only there. The
 * request therefore has to say which diagram is asking — see
 * lib/resource-url-cache.ts `ResourceUrlContext`.
 *
 * `dataflowId` is absent while a diagram has not been saved yet. That is not a
 * gap: an unsaved diagram belongs to the person drawing it, who can read their
 * own uploads through the ordinary endpoint. It becomes present on the first
 * save, and from then on the diagram is the thing that grants access.
 */
export interface DiagramContextValue {
  dataflowId?: string
  /** Set when viewing a stored version rather than the current content. */
  historyId?: string
}

export const DiagramContext = createContext<DiagramContextValue>({})

export function useDiagramContext(): DiagramContextValue {
  return useContext(DiagramContext)
}
