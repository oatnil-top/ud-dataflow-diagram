import { createContext, useContext, type ReactNode } from 'react'
import type { DiagramContextValue } from './diagramContext'

/**
 * Everything the diagram needs from the application it is mounted in.
 *
 * Every member is optional: the diagram must render and edit with none of them — that is
 * the standalone playground — and each absent member has a defined fallback, spelled out
 * on the member itself. Nothing under components/dataflow/ may import from the host app
 * directly; this file is the whole surface, so the list of things the diagram cannot do
 * on its own is exactly the list of members below.
 *
 * The ud app fills all of them in lib/dataflow-host.tsx, and mounts a provider at each of
 * the three places a canvas appears: resource-editor-page (editor), dataflow-detail-page
 * and components/resource/ResourcePreviewContent (read-only previews).
 */

/**
 * What resolving a resource reference produced.
 *
 * Deliberately the same shape as lib/resource-url-cache.ts `ResourceUrlResult`, so the ud
 * adapter passes it straight through. It is declared here rather than imported because the
 * package cannot depend on the app: the three failures are separate because a node has to
 * say something different for each, and `null` for all of them is how a missing image
 * became an empty box with no explanation.
 */
export type ResourceResolution =
  /** A usable URL. `url` is never empty. */
  | { status: 'ok'; url: string }
  /** The resource exists as far as we know but has no servable content. */
  | { status: 'no-content' }
  /** Gone: deleted, or not resolvable in the context it was asked for. */
  | { status: 'unavailable' }
  /** Refused: this context does not grant access to this resource. */
  | { status: 'forbidden' }
  /** The request itself failed — offline, timeout, 5xx. Worth retrying. */
  | { status: 'error' }

export interface DataflowHost {
  /** Absent ⇒ every resource node renders `unavailable`, and no upload affordance exists. */
  resources?: {
    /**
     * Resolve an image reference to a URL.
     *
     * `scope` is the diagram being looked at, passed through untouched — the host decides
     * what it means. In ud it selects the diagram-scoped endpoint, which authorizes the
     * caller against the DIAGRAM rather than the image, and that is what lets a shared
     * diagram show pictures that were never shared themselves. ⛔ Dropping `scope` compiles,
     * and is invisible to the diagram's owner: it only breaks for everyone else.
     */
    resolve(resourceId: string, scope: DiagramContextValue): Promise<ResourceResolution>
    /**
     * Store a file and return the id a node should reference.
     *
     * Absent ⇒ no upload affordance is rendered anywhere: no drop zone, no replace button,
     * and pasting an image falls through to the text paths instead of creating a node that
     * could never be filled.
     */
    upload?(file: File): Promise<{ resourceId: string }>
    /**
     * The display name for a resource id that arrived as text rather than from a picker —
     * pasting a bare `resource://<uuid>` names the node after the real file.
     *
     * Absent, or answering null, ⇒ the node keeps the name the paste supplied (markdown alt
     * text, else "Resource"), which is already what happens when the lookup fails.
     */
    describe?(resourceId: string): Promise<{ name?: string } | null>
  }
  ai?: {
    /**
     * Raw model text; the diagram extracts the JSON itself (utils/extractJson.ts).
     *
     * Absent while `ai` itself is present ⇒ the AI button and panel still appear but only
     * `settings` renders inside — the host is saying "nothing is configured yet" and wants
     * to show its own way to fix that. ud relies on this: an account with no provider keeps
     * the panel that tells it how to add one.
     */
    generate?(system: string, input: string, signal?: AbortSignal): Promise<string>
    /**
     * A slot, not a flag: ud puts its provider selector (or its "configure a provider"
     * empty state) here, a playground would put a BYOK form. The diagram renders whatever
     * it is given and knows nothing about what configuring a model means.
     */
    settings?: ReactNode
  }
  /** Absent ⇒ console.info / console.error. */
  notify?(kind: 'info' | 'error', message: string, detail?: unknown): void
}

export const DataflowHostContext = createContext<DataflowHost>({})

export function useDataflowHost(): DataflowHost {
  return useContext(DataflowHostContext)
}

/**
 * The diagram's only way to say something to the user.
 *
 * Falls back to the console rather than doing nothing: a save that failed silently is the
 * failure mode this replaces, and a standalone playground still deserves the message.
 */
export function useNotify(): NonNullable<DataflowHost['notify']> {
  const host = useDataflowHost()
  return (
    host.notify ??
    ((kind, message, detail) =>
      (kind === 'error' ? console.error : console.info)(message, detail ?? ''))
  )
}
