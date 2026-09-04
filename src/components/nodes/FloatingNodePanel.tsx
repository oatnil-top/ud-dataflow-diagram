import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useMultiSelection } from '../../hooks/useMultiSelection'

/**
 * Floating panel anchored below a node element, rendered via portal so clicks
 * inside it don't reach the React Flow pane (which would deselect the node).
 *
 * The anchor moves on node drag and viewport pan/zoom, so the position is
 * tracked per animation frame while mounted; setState is skipped when the
 * position is unchanged, so idle frames cause no re-render.
 *
 * With a MULTI-selection the panel does not render at all (owner, 2026-09-04):
 * every selected icon/shape/note otherwise pops its own panel, and a rubber-band
 * over five elements buried the canvas under five of them. Gated here — the one
 * choke point every per-node style panel already goes through — so no node
 * component needs to know about selection counts.
 */
export default function FloatingNodePanel({
  anchorEl,
  className,
  style,
  children,
}: {
  anchorEl: HTMLElement
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const multiSelection = useMultiSelection()
  const [pos, setPos] = useState({ left: 0, top: 0 })

  useEffect(() => {
    let rafId: number
    const update = () => {
      const rect = anchorEl.getBoundingClientRect()
      const newLeft = rect.left + rect.width / 2
      const newTop = rect.bottom + 6
      setPos((prev) =>
        prev.left === newLeft && prev.top === newTop ? prev : { left: newLeft, top: newTop },
      )
      rafId = requestAnimationFrame(update)
    }
    rafId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(rafId)
  }, [anchorEl])

  if (multiSelection) return null

  return createPortal(
    <div
      className={`fixed z-[9999] -translate-x-1/2 ${className ?? ''}`}
      style={{ left: pos.left, top: pos.top, ...style }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  )
}
