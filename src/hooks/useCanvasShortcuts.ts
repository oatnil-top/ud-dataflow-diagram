import { useEffect } from 'react'
import type { Node } from '@xyflow/react'

interface UseCanvasShortcutsParams {
  getNodes: () => Node[]
  copyNodesToClipboard: (ids: string[]) => void
  duplicateNodes: (ids: string[]) => void
  undo: () => void
  redo: () => void
}

/** Canvas keyboard shortcuts: Ctrl/Cmd + C (copy), D (duplicate), Z (undo / shift = redo), Y (redo). */
export function useCanvasShortcuts({
  getNodes,
  copyNodesToClipboard,
  duplicateNodes,
  undo,
  redo,
}: UseCanvasShortcutsParams) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input or editable surface
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return
      }

      // Ctrl+C or Cmd+C - Copy selected nodes to system clipboard
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const selected = getNodes().filter((n) => n.selected)
        if (selected.length > 0) {
          e.preventDefault()
          copyNodesToClipboard(selected.map((n) => n.id))
        }
      }

      // Ctrl+D or Cmd+D - Duplicate selected nodes
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        const selected = getNodes().filter((n) => n.selected)
        if (selected.length > 0) {
          e.preventDefault()
          duplicateNodes(selected.map((n) => n.id))
        }
      }

      // Ctrl+Z or Cmd+Z - Undo (Shift+Z = Redo)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          redo()
        } else {
          undo()
        }
      }

      // Ctrl+Y or Cmd+Y - Redo (alternative)
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [copyNodesToClipboard, duplicateNodes, getNodes, undo, redo])
}
