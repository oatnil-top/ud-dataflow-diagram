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
import { useTranslation } from 'react-i18next'
import { buildWaypointPath, polylineMidpoint, segmentMidpoints, type Point } from '../utils/edgePath'

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
  const [stepPath, stepLabelX, stepLabelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  })

  // Route anchors (owner, 2026-09-04): with waypoints the route is the USER'S —
  // straight segments through every anchor (utils/edgePath.ts), smoothstep otherwise.
  // liveWaypoints carries an in-flight drag; the committed truth lives on pipe data.
  const [liveWaypoints, setLiveWaypoints] = useState<Point[] | null>(null)
  const waypoints = liveWaypoints ?? data?.waypoints ?? []
  const routed = waypoints.length > 0
  const routePoints: Point[] = routed
    ? [{ x: sourceX, y: sourceY }, ...waypoints, { x: targetX, y: targetY }]
    : []
  const routeMid = routed ? polylineMidpoint(routePoints) : null
  const edgePath = routed ? buildWaypointPath(routePoints) : stepPath
  const labelX = routeMid ? routeMid.x : stepLabelX
  const labelY = routeMid ? routeMid.y : stepLabelY

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

  // ---- route anchors: drag to move, click a segment midpoint to add, ----
  // ---- double-click an anchor to remove. Same commit discipline as the ----
  // ---- label: live state while dragging, ONE updatePipe (one undo step) ----
  // ---- on release, computed from the event's own coordinates. ----
  const { t } = useTranslation()
  const wpDragRef = useRef<{ index: number; startX: number; startY: number; base: Point; fresh: boolean } | null>(null)

  const startWaypointDrag = (e: React.PointerEvent<SVGCircleElement>, index: number, base: Point, fresh: boolean, initial: Point[]) => {
    if (!interactive || e.button !== 0) return
    e.stopPropagation()
    wpDragRef.current = { index, startX: e.clientX, startY: e.clientY, base, fresh }
    setLiveWaypoints(initial)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  }
  const onAnchorPointerDown = (e: React.PointerEvent<SVGCircleElement>, index: number) => {
    const current = data?.waypoints ?? []
    startWaypointDrag(e, index, current[index], false, [...current])
  }
  // Pointer-down on a segment midpoint INSERTS an anchor there and starts dragging
  // it — add and place are one gesture. A plain click (no move) still adds: the
  // midpoint is a sensible place for a bend to start its life.
  const onAddAnchorPointerDown = (e: React.PointerEvent<SVGCircleElement>, segmentIndex: number, at: Point) => {
    const current = data?.waypoints ?? []
    const next = [...current.slice(0, segmentIndex), { ...at }, ...current.slice(segmentIndex)]
    startWaypointDrag(e, segmentIndex, at, true, next)
  }
  const onAnchorPointerMove = (e: React.PointerEvent<SVGCircleElement>) => {
    const drag = wpDragRef.current
    if (!drag || !liveWaypoints) return
    const dx = (e.clientX - drag.startX) / zoom
    const dy = (e.clientY - drag.startY) / zoom
    const moved = liveWaypoints.map((p, i) =>
      i === drag.index ? { x: drag.base.x + dx, y: drag.base.y + dy } : p)
    setLiveWaypoints(moved)
  }
  const onAnchorPointerUp = (e: React.PointerEvent<SVGCircleElement>) => {
    const drag = wpDragRef.current
    wpDragRef.current = null
    if (!drag || !liveWaypoints) return
    const dx = (e.clientX - drag.startX) / zoom
    const dy = (e.clientY - drag.startY) / zoom
    // A fresh anchor commits even unmoved (the click placed it); an existing one
    // only commits when it actually went somewhere — no no-op undo steps.
    if (drag.fresh || Math.abs(dx) >= 2 || Math.abs(dy) >= 2) {
      const committed = liveWaypoints.map((p, i) =>
        i === drag.index
          ? { x: Math.round(drag.base.x + dx), y: Math.round(drag.base.y + dy) }
          : { x: Math.round(p.x), y: Math.round(p.y) })
      updatePipe(id, { waypoints: committed })
    }
    setLiveWaypoints(null)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  }
  const onAnchorPointerCancel = () => {
    wpDragRef.current = null
    setLiveWaypoints(null)
  }
  const removeAnchor = (index: number) => {
    const current = data?.waypoints ?? []
    const next = current.filter((_, i) => i !== index)
    // undefined, not []: the key disappears from the saved document entirely
    updatePipe(id, { waypoints: next.length > 0 ? next : undefined })
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

      {/* Route anchors — shown while the edge is selected. Blue filled dots are the
          anchors themselves (drag to move, double-click to remove); hollow faint dots
          sit on segment midpoints (and, before any anchor exists, on the path's
          midpoint) and grow an anchor when grabbed. */}
      {interactive && selected && (
        <>
          {waypoints.map((p, i) => (
            <circle
              key={`wp-${i}`}
              cx={p.x}
              cy={p.y}
              r={5}
              fill="#3b82f6"
              stroke="#ffffff"
              strokeWidth={1.5}
              style={{ pointerEvents: 'all', cursor: 'grab' }}
              onPointerDown={(e) => onAnchorPointerDown(e, i)}
              onPointerMove={onAnchorPointerMove}
              onPointerUp={onAnchorPointerUp}
              onPointerCancel={onAnchorPointerCancel}
              onDoubleClick={(e) => { e.stopPropagation(); removeAnchor(i) }}
              onClick={(e) => e.stopPropagation()}
            >
              <title>{t('resources.dataflow.pipe.anchorTitle')}</title>
            </circle>
          ))}
          {(routed
            ? segmentMidpoints(routePoints).map((mid, seg) => ({ mid, seg }))
            : [{ mid: { x: stepLabelX, y: stepLabelY }, seg: 0 }]
          ).map(({ mid, seg }) => (
            <circle
              key={`add-${seg}`}
              cx={mid.x}
              cy={mid.y}
              r={4}
              fill="#ffffff"
              stroke="#94a3b8"
              strokeWidth={1.5}
              opacity={0.85}
              style={{ pointerEvents: 'all', cursor: 'copy' }}
              onPointerDown={(e) => onAddAnchorPointerDown(e, seg, mid)}
              onPointerMove={onAnchorPointerMove}
              onPointerUp={onAnchorPointerUp}
              onPointerCancel={onAnchorPointerCancel}
              onClick={(e) => e.stopPropagation()}
            >
              <title>{t('resources.dataflow.pipe.addAnchorTitle')}</title>
            </circle>
          ))}
        </>
      )}

      {/* Description label */}
      {description && (
        <EdgeLabelRenderer>
          <div
            /* The label is portalled out of the edge's <g>, so the mute classes the
               canvas puts on the edge never reach it — see PipeData.noteMuted. Same
               two class names, so one CSS rule pair governs line and label together
               and they can never fade apart. */
            className={`nodrag nopan pointer-events-auto${data?.noteMuted ? ' pipe-note-muted' : ''}${data?.noteRevealed ? ' pipe-note-revealed' : ''}`}
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
