import { memo, useRef, useState } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useStore,
  type EdgeProps,
  type Edge,
} from '@xyflow/react'
import type { PipeData, PipeMarker, PipeLineStyle } from '../types'
import { useFlowStore } from '../store/flowStoreContext'

type DataflowEdgeProps = EdgeProps<Edge<PipeData>>

/** Map a PipeMarker to an SVG marker URL reference */
function markerUrl(marker: PipeMarker, color: string): string | undefined {
  if (marker === 'none') return undefined
  // Encode color for use in marker ID (strip #)
  const colorKey = color.replace('#', '')
  return `url(#dataflow-marker-${marker}-${colorKey})`
}

function DataflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  data,
  selected,
}: DataflowEdgeProps) {
  // Orthogonal routing with rounded corners — right-angle connectors keep
  // dense architecture diagrams readable where bezier curves turn to spaghetti
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  })

  const description = data?.description

  // Label dragging (card 249e596f). getSmoothStepPath pins the label to the
  // path midpoint, so two edges with coincident midpoints stack their labels
  // and nothing in the editor could separate them. Dragging writes a
  // labelOffset onto the pipe's data — one undo step, committed on release.
  // Gated on elementsSelectable so the read-only preview stays inert.
  // The store MUST come from context: every canvas creates its own store
  // instance (DataflowCanvas keeps one per mount), so the module-level
  // singleton in flowStore.ts is a store nobody renders — writing there
  // makes the label snap back on release while looking perfectly draggable.
  const flowStore = useFlowStore()
  const updatePipe = flowStore((s) => s.updatePipe)
  const zoom = useStore((s) => s.transform[2])
  const interactive = useStore((s) => s.elementsSelectable)
  const [liveOffset, setLiveOffset] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null)

  const onLabelPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || e.button !== 0) return
    e.stopPropagation()
    const base = data?.labelOffset ?? { x: 0, y: 0 }
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: base.x, baseY: base.y, moved: false }
    // Capture can throw on an already-inactive pointer; the drag still works
    // without it (we track state in dragRef), so never let it kill the handler
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  }
  const onLabelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = (e.clientX - drag.startX) / zoom
    const dy = (e.clientY - drag.startY) / zoom
    if (!drag.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return
    drag.moved = true
    setLiveOffset({ x: drag.baseX + dx, y: drag.baseY + dy })
  }
  const onLabelPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    // Commit FIRST, from the event's own coordinates — not from liveOffset
    // state (stale when the last move and the up land in one render batch),
    // and not after releasePointerCapture (which throws on an inactive
    // pointer and would silently skip the commit, leaving a label that looks
    // moved but snaps back on reload).
    if (drag.moved) {
      updatePipe(id, {
        labelOffset: {
          x: Math.round(drag.baseX + (e.clientX - drag.startX) / zoom),
          y: Math.round(drag.baseY + (e.clientY - drag.startY) / zoom),
        },
      })
    }
    setLiveOffset(null)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  }
  const onLabelPointerCancel = () => {
    // Abandoned drag (touch cancel, window blur): discard, don't commit
    dragRef.current = null
    setLiveOffset(null)
  }

  const labelOffset = liveOffset ?? data?.labelOffset ?? { x: 0, y: 0 }
  const sourceMarker: PipeMarker = data?.sourceMarker || 'none'
  const targetMarker: PipeMarker = data?.targetMarker || 'none'
  const pipeColor = data?.color || (style?.stroke as string) || '#94a3b8'
  const lineWidth = data?.lineWidth || (style?.strokeWidth as number) || 1.5
  const lineStyle: PipeLineStyle = data?.lineStyle || 'solid'
  const isAnimated = data?.animated || false

  const dashMap: Record<PipeLineStyle, string | undefined> = {
    solid: undefined,
    dashed: '8 4',
    dotted: '2 4',
  }

  const edgeStyle = {
    ...style,
    stroke: pipeColor,
    strokeWidth: lineWidth,
    strokeDasharray: isAnimated ? '8 4' : dashMap[lineStyle],
    animation: isAnimated ? 'flowAnimation 0.5s linear infinite' : undefined,
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={edgeStyle}
        markerStart={markerUrl(sourceMarker, pipeColor)}
        markerEnd={markerUrl(targetMarker, pipeColor)}
      />

      {/* Reconnect affordance (card 04692d7c): React Flow's grab zones at both
          ends are INVISIBLE r=10 circles, so without these dots nothing tells
          the user the endpoints are draggable. Shown on hover/selected via CSS
          (index.css, .pipe-endpoint-affordance). pointer-events: none — the
          library's own circles above must keep receiving the drag. Gated on
          elementsSelectable so the read-only preview stays clean. */}
      {/* Solid, larger, dedicated green (card 5ec0d836 round 12 — draw.io's
          differentiation): an endpoint must read differently from the 8px
          blue node connection handles it sits beside — bigger (13px vs 8px),
          filled not hollow, green not blue/pipe-color. */}
      {interactive && (
        <>
          <circle className="pipe-endpoint-affordance" cx={sourceX} cy={sourceY} r={6.5}
            fill="#22c55e" stroke="#ffffff" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
          <circle className="pipe-endpoint-affordance" cx={targetX} cy={targetY} r={6.5}
            fill="#22c55e" stroke="#ffffff" strokeWidth={1.5} style={{ pointerEvents: 'none' }} />
        </>
      )}

      {/* Description label */}
      {description && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto"
            onPointerDown={onLabelPointerDown}
            onPointerMove={onLabelPointerMove}
            onPointerUp={onLabelPointerUp}
            onPointerCancel={onLabelPointerCancel}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX + labelOffset.x}px, ${labelY + labelOffset.y}px)`,
              fontSize: 11,
              color: '#475569',
              backgroundColor: selected ? '#f1f5f9' : 'rgba(255,255,255,0.9)',
              padding: '1px 6px',
              borderRadius: 4,
              border: selected ? '1px solid #94a3b8' : '1px solid transparent',
              // Wrap to two lines instead of one-line ellipsis (card 249e596f):
              // a 160px single line ate the tail of most Chinese phrases and
              // every KQL fragment, leaving labels that stated half a reason.
              // Height grows symmetrically around the anchor, so nothing else moves.
              maxWidth: 160,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
              wordBreak: 'break-word',
              lineHeight: '18px',
              cursor: interactive ? (dragRef.current ? 'grabbing' : 'grab') : undefined,
            }}
            title={description}
          >
            {description}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export default memo(DataflowEdge)
