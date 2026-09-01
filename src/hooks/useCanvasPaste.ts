import { useEffect } from 'react'
import type { Node } from '@xyflow/react'
import type { TFunction } from 'i18next'
import { useDataflowHost, useNotify } from '../host'
import type { ResourceNodeData } from '../types'
import { clipboardTextIsGraph, importPastedGraph, PASTE_FAILURE_KEYS } from '../store/pasteImport'
import type { ImportResult } from '../store/flowStore'
import type { ViewportRect } from '../store/editPlan'
import type { EditPlan } from '../store/dslParser'

interface UseCanvasPasteParams {
  getNodes: () => Node[]
  screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number }
  pasteNode: (position?: { x: number; y: number }) => string | null
  pasteNodesFromClipboard: (json: string, center: { x: number; y: number }) => string[]
  updateResourceNode: (nodeId: string, data: Partial<ResourceNodeData>) => void
  addResourceNode: (name: string, resourceId?: string, position?: { x: number; y: number }) => string
  addNoteNode: (name: string, content?: string, position?: { x: number; y: number }) => string
  /** Merge a pasted graph into the canvas with paste semantics (store.importGraph). */
  importGraph: (
    json: string,
    viewportCenter?: { x: number; y: number },
    opts?: { replace?: boolean; sameIdMeansSameNode?: boolean },
  ) => ImportResult | null
  /** Apply a parsed DSL edit plan (store.applyEditPlan). */
  applyEditPlan: (plan: EditPlan, viewport?: ViewportRect) => ImportResult | null
  setImportSummary: (summary: ImportResult | null) => void
  t: TFunction
}

/**
 * Canvas paste handler — supports pasting images into selected resource nodes
 * (or a fresh one), cross-diagram dataflow JSON, a graph an AI chat wrote,
 * resource:// URIs, and a plain text fallback that becomes a note node.
 *
 * The graph branch matters because Ctrl+V on the canvas is what a user told "paste it
 * back" actually does — and before it existed, that keystroke turned a 4KB answer into a
 * 4KB sticky note, the feature's worst failure shape. It runs AFTER the `_dataflow`
 * branch (that one is our own copy/paste, which re-mints ids on purpose) and BEFORE the
 * note fallback, and only when clipboardTextIsGraph recognises the editor's own node
 * shape. A wrong guess costs one Ctrl+Z; the summary bar puts undo on screen.
 *
 * The image branch needs host.ts `resources.upload`. With no host adapter it is skipped
 * whole — no placeholder node, no upload, no error — and the paste continues into the
 * text / `resource://` branches exactly as a non-image paste already does. Creating the
 * node first and failing after would leave an empty node that can never be filled, which
 * is worse than the paste appearing to do nothing.
 */
export function useCanvasPaste({
  getNodes,
  screenToFlowPosition,
  pasteNode,
  pasteNodesFromClipboard,
  updateResourceNode,
  addResourceNode,
  addNoteNode,
  importGraph,
  applyEditPlan,
  setImportSummary,
  t,
}: UseCanvasPasteParams) {
  const host = useDataflowHost()
  const notify = useNotify()
  const upload = host.resources?.upload
  const describe = host.resources?.describe
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Skip if user is typing in an input or editable surface
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return
      }

      // Check if clipboard has an image file
      // Bound once so the async closure below keeps the narrowing.
      const uploadFile = upload
      const items = uploadFile ? e.clipboardData?.items : undefined
      if (items && uploadFile) {
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (!file) continue

            e.preventDefault()

            // Find a selected resource node to paste into, or create a new one
            const selected = getNodes().filter((n) => n.selected && n.type === 'resource')

            // Create placeholder node immediately so user sees feedback
            let targetNodeId: string
            if (selected.length > 0) {
              targetNodeId = selected[0].id
              updateResourceNode(targetNodeId, { uploading: true })
            } else {
              const position = screenToFlowPosition({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
              })
              targetNodeId = addResourceNode(file.name || 'Resource', undefined, position)
              updateResourceNode(targetNodeId, { uploading: true })
            }

            // Upload in background, then update the node with the resource ID
            const uploadAndApply = async () => {
              try {
                const { resourceId } = await uploadFile(file)
                updateResourceNode(targetNodeId, { resourceId, mimeType: file.type, uploading: false })
              } catch (err) {
                console.error('Failed to upload pasted image as resource:', err)
                updateResourceNode(targetNodeId, { uploading: false })
                notify('error', t('common.status.error'), err)
              }
            }
            uploadAndApply()
            return
          }
        }
      }

      // No image in clipboard — try system clipboard for cross-diagram paste
      e.preventDefault()
      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      })
      // The DSL channel places new nodes against the whole visible rectangle, not a point
      // — see store/editPlan.ts. Derived here the same way DataflowCanvas.getViewportRect
      // derives it, from the two screen corners.
      const topLeft = screenToFlowPosition({ x: 0, y: 0 })
      const bottomRight = screenToFlowPosition({ x: window.innerWidth, y: window.innerHeight })
      const rect = {
        x: topLeft.x,
        y: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y,
      }

      // Read text from system clipboard; if it's dataflow JSON, paste nodes;
      // if it contains resource:// URIs, create resource nodes;
      // if it's plain text, create a note node with that content
      navigator.clipboard.readText().then(async (text) => {
        if (text) {
          const pasted = pasteNodesFromClipboard(text, center)
          if (pasted.length > 0) return

          const trimmed = text.trim()
          if (trimmed) {
            // A graph an outside model wrote — import it instead of noting it down.
            if (clipboardTextIsGraph(trimmed)) {
              const outcome = importPastedGraph(trimmed, { importGraph, applyEditPlan, setImportSummary }, { center, rect })
              if (!outcome.ok) notify('error', t(PASTE_FAILURE_KEYS[outcome.reason]))
              return
            }

            // Check for resource:// URIs — create resource nodes
            // Supports bare resource://uuid and markdown ![name](resource://uuid)
            const resourcePattern = /(?:!\[([^\]]*)\]\()?resource:\/\/([a-f0-9-]{36})\)?/gi
            const resourceMatches = [...trimmed.matchAll(resourcePattern)]
            if (resourceMatches.length > 0) {
              const offsetStep = 40
              for (let i = 0; i < resourceMatches.length; i++) {
                const mdAlt = resourceMatches[i][1] // alt text from ![alt](...)
                const resourceId = resourceMatches[i][2]
                const pos = { x: center.x + i * offsetStep, y: center.y + i * offsetStep }
                // Markdown alt text wins; otherwise ask the host what the file is called.
                // A host without `describe` (or a lookup that fails) leaves the default —
                // the same outcome the direct request already had when it 404'd.
                let name = mdAlt || 'Resource'
                if (!mdAlt && describe) {
                  try {
                    const meta = await describe(resourceId)
                    if (meta?.name) name = meta.name
                  } catch {
                    // Keep the default name.
                  }
                }
                addResourceNode(name, resourceId, pos)
              }
              return
            }

            // Plain text in clipboard — create a note node
            // Use first line (up to 50 chars) as node name
            const firstLine = trimmed.split('\n')[0].slice(0, 50)
            addNoteNode(firstLine, trimmed, center)
            return
          }
        }
        // Fall back to internal clipboard (same-diagram paste)
        pasteNode(center)
      }).catch(() => {
        // Clipboard API denied — fall back to internal clipboard
        pasteNode(center)
      })
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [pasteNode, pasteNodesFromClipboard, screenToFlowPosition, getNodes, updateResourceNode, addResourceNode, addNoteNode, importGraph, applyEditPlan, setImportSummary, upload, describe, notify, t])
}
