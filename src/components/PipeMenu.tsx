import type { ReactNode } from 'react'
import { useCallback, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { useStore, useStoreApi, useViewport, useReactFlow, getSmoothStepPath, type Edge, type ReactFlowState, type InternalNode } from '@xyflow/react'
import { Trash2, Route } from 'lucide-react'
import { useFlowStore } from '../store/flowStoreContext'
import type { PipeData, PipeMarker, PipeLineStyle } from '../types'
import { isImeComposing } from '../utils/ime'
import { routeOrthogonal, type RouteBox } from '../utils/edgeRouter'

interface PipeWithSelection extends Edge<PipeData> {
  selected?: boolean
}

// Get the selected edge/pipe
const selectedPipeSelector = (state: ReactFlowState) =>
  (state.edges as PipeWithSelection[]).find((e) => e.selected)

// Absolute flow position of a handle's center. With ConnectionMode.Loose the
// perimeter handles are all type=source, so a pipe's targetHandle may only be
// found in the source list — search both.
function handleCenter(node: InternalNode, handleId: string | null | undefined) {
  const all = [
    ...(node.internals.handleBounds?.source ?? []),
    ...(node.internals.handleBounds?.target ?? []),
  ]
  if (all.length === 0) return null
  const h = (handleId ? all.find((hb) => hb.id === handleId) : undefined) ?? all[0]
  return {
    x: node.internals.positionAbsolute.x + h.x + h.width / 2,
    y: node.internals.positionAbsolute.y + h.y + h.height / 2,
    position: h.position,
  }
}

// Fallback anchor when we have no click point for the selected pipe (marquee or
// programmatic selection, or right after a reconnect): the midpoint of the
// edge's REAL path — same getSmoothStepPath the edge renders with — not the
// midpoint between the two node boxes, which sat hundreds of px off a long edge
const useFallbackAnchor = (pipe: PipeWithSelection | undefined) => {
  const sourceId = pipe?.source
  const targetId = pipe?.target
  const sourceHandle = pipe?.sourceHandle
  const targetHandle = pipe?.targetHandle
  return useStore(
    useCallback(
      (state: ReactFlowState) => {
        if (!sourceId || !targetId) return null
        const src = state.nodeLookup.get(sourceId)
        const tgt = state.nodeLookup.get(targetId)
        if (!src || !tgt) return null
        const s = handleCenter(src, sourceHandle)
        const t = handleCenter(tgt, targetHandle)
        if (s && t) {
          const [, labelX, labelY] = getSmoothStepPath({
            sourceX: s.x, sourceY: s.y, sourcePosition: s.position,
            targetX: t.x, targetY: t.y, targetPosition: t.position,
            borderRadius: 8,
          })
          return { x: labelX, y: labelY }
        }
        // Handle bounds not measured yet — midpoint of the node centers
        return {
          x: (src.internals.positionAbsolute.x + (src.measured?.width || 200) / 2 +
              tgt.internals.positionAbsolute.x + (tgt.measured?.width || 200) / 2) / 2,
          y: (src.internals.positionAbsolute.y + (src.measured?.height || 100) / 2 +
              tgt.internals.positionAbsolute.y + (tgt.measured?.height || 100) / 2) / 2,
        }
      },
      [sourceId, targetId, sourceHandle, targetHandle],
    ),
    (a, b) => a === b || (a != null && b != null && a.x === b.x && a.y === b.y),
  )
}

const MARKER_LABEL_KEYS: Record<PipeMarker, string> = {
  none: 'resources.dataflow.pipe.markerNone',
  arrow: 'resources.dataflow.pipe.markerArrow',
  one: 'resources.dataflow.pipe.markerOne',
  many: 'resources.dataflow.pipe.markerMany',
}

const MARKER_OPTIONS: { value: PipeMarker; label: string; icon: ReactNode }[] = [
  {
    value: 'none',
    label: 'None',
    icon: (
      <svg width="20" height="14" viewBox="0 0 20 14">
        <line x1="2" y1="7" x2="18" y2="7" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
  {
    value: 'arrow',
    label: 'Arrow',
    icon: (
      <svg width="20" height="14" viewBox="0 0 20 14">
        <line x1="2" y1="7" x2="14" y2="7" stroke="currentColor" strokeWidth="2" />
        <polyline points="10,3 16,7 10,11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: 'one',
    label: 'One',
    icon: (
      <svg width="20" height="14" viewBox="0 0 20 14">
        <line x1="2" y1="7" x2="18" y2="7" stroke="currentColor" strokeWidth="2" />
        <line x1="14" y1="2" x2="14" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: 'many',
    label: 'Many',
    icon: (
      <svg width="20" height="14" viewBox="0 0 20 14">
        <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="2" />
        <polyline points="12,7 18,2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <polyline points="12,7 18,7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <polyline points="12,7 18,12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
]

function MarkerSelector({
  label,
  value,
  onChange,
}: {
  label: string
  value: PipeMarker
  onChange: (v: PipeMarker) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-slate-400 w-10 shrink-0">{label}</span>
      <div className="flex gap-0.5">
        {MARKER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`p-1 rounded transition-colors ${
              value === opt.value
                ? 'bg-slate-200 text-slate-700'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
            }`}
            title={t(MARKER_LABEL_KEYS[opt.value])}
          >
            {opt.icon}
          </button>
        ))}
      </div>
    </div>
  )
}

const PIPE_COLORS = ['#94a3b8', '#475569', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#1e1e1e']

const LINE_STYLE_LABEL_KEYS: Record<PipeLineStyle, string> = {
  solid: 'resources.dataflow.pipe.styleSolid',
  dashed: 'resources.dataflow.pipe.styleDashed',
  dotted: 'resources.dataflow.pipe.styleDotted',
}

const LINE_STYLE_OPTIONS: { value: PipeLineStyle; label: string; dash?: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed', dash: '6 3' },
  { value: 'dotted', label: 'Dotted', dash: '2 3' },
]

const LINE_WIDTH_OPTIONS = [1, 2, 3, 4]

export interface PipeMenuClickAnchor {
  pipeId: string
  x: number
  y: number
}

export default function PipeMenu({ clickAnchor }: { clickAnchor?: PipeMenuClickAnchor | null }) {
  const { t } = useTranslation()
  const selectedPipe = useStore(selectedPipeSelector)
  const fallbackAnchor = useFallbackAnchor(selectedPipe)
  const flowStore = useFlowStore()
  const onPipesChange = flowStore((s) => s.onPipesChange)
  const updatePipe = flowStore((s) => s.updatePipe)
  const storeApi = useStoreApi()
  // useViewport keeps this component re-rendering on pan/zoom; the actual
  // flow→screen math is flowToScreenPosition, which also accounts for the
  // canvas pane's own offset in the window (a bare `flow*zoom+view` misses
  // the editor header above the pane and lands the menu ~50px high)
  useViewport()
  const { flowToScreenPosition } = useReactFlow()

  const [descValue, setDescValue] = useState('')

  // Sync description input with selected pipe
  useEffect(() => {
    setDescValue(selectedPipe?.data?.description || '')
  }, [selectedPipe?.id, selectedPipe?.data?.description])

  const handleDelete = useCallback(() => {
    if (selectedPipe && onPipesChange) {
      onPipesChange([{ id: selectedPipe.id, type: 'remove' }])
    }
  }, [selectedPipe, onPipesChange])

  const handleDescBlur = useCallback(() => {
    if (!selectedPipe || !updatePipe) return
    const trimmed = descValue.trim()
    if (trimmed !== (selectedPipe.data?.description || '')) {
      updatePipe(selectedPipe.id, { description: trimmed || undefined })
    }
  }, [selectedPipe, updatePipe, descValue])

  const handleMarkerChange = useCallback((end: 'sourceMarker' | 'targetMarker', value: PipeMarker) => {
    if (!selectedPipe || !updatePipe) return
    updatePipe(selectedPipe.id, { [end]: value })
  }, [selectedPipe, updatePipe])

  const handleStyleUpdate = useCallback((updates: Partial<PipeData>) => {
    if (!selectedPipe || !updatePipe) return
    updatePipe(selectedPipe.id, updates)
  }, [selectedPipe, updatePipe])

  // Auto-route (utils/edgeRouter.ts): an EXPLICIT act that writes waypoints — the
  // same anchors the user drags — never a background recompute, so a hand-tuned
  // route is only ever replaced by pressing this again. Endpoints come from the
  // real handle centers; obstacles are every node except the two terminals and
  // their ancestor groups (a route out of a group must not treat its own group
  // as a wall). One updatePipe = one undo step, like every other pipe edit.
  const handleAutoRoute = useCallback(() => {
    if (!selectedPipe || !updatePipe) return
    const state = storeApi.getState()
    const src = state.nodeLookup.get(selectedPipe.source)
    const tgt = state.nodeLookup.get(selectedPipe.target)
    if (!src || !tgt) return
    const s = handleCenter(src, selectedPipe.sourceHandle)
    const g = handleCenter(tgt, selectedPipe.targetHandle)
    if (!s || !g) return
    const skip = new Set<string>()
    for (const terminal of [src, tgt]) {
      let cur: InternalNode | undefined = terminal
      while (cur) {
        skip.add(cur.id)
        cur = cur.parentId ? state.nodeLookup.get(cur.parentId) : undefined
      }
    }
    const obstacles: RouteBox[] = []
    for (const [nid, n] of state.nodeLookup) {
      if (skip.has(nid)) continue
      const w = n.measured?.width
      const h = n.measured?.height
      if (typeof w !== 'number' || typeof h !== 'number') continue
      obstacles.push({ x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y, width: w, height: h })
    }
    const waypoints = routeOrthogonal({ x: s.x, y: s.y }, { x: g.x, y: g.y }, obstacles)
    updatePipe(selectedPipe.id, { waypoints: waypoints.length > 0 ? waypoints : undefined })
  }, [selectedPipe, updatePipe, storeApi])

  if (!selectedPipe || !fallbackAnchor) return null

  // Anchor: the click point when we have one for THIS pipe, otherwise the real
  // path midpoint. Stored in flow coordinates, so the menu follows pan/zoom
  // (that follow was regressed once and fixed in 3554a2101 — keep it).
  const anchor =
    clickAnchor && clickAnchor.pipeId === selectedPipe.id ? clickAnchor : fallbackAnchor
  const { x: screenX, y: screenY } = flowToScreenPosition({ x: anchor.x, y: anchor.y })

  // Keep the menu on screen: clamp horizontally, and flip below the anchor
  // when there is no room above it (menu height estimated — an error of a few
  // px only shifts WHEN it flips, never pushes it off screen)
  const MENU_WIDTH = 236
  const MENU_HEIGHT = 250
  const EDGE_MARGIN = 8
  const GAP_ABOVE = 40
  const GAP_BELOW = 16
  const halfW = MENU_WIDTH / 2
  const menuLeft = Math.min(
    Math.max(screenX, halfW + EDGE_MARGIN),
    window.innerWidth - halfW - EDGE_MARGIN,
  )
  const flipBelow = screenY - GAP_ABOVE - MENU_HEIGHT < EDGE_MARGIN
  const menuTop = flipBelow ? screenY + GAP_BELOW : screenY - GAP_ABOVE

  const sourceMarker: PipeMarker = selectedPipe.data?.sourceMarker || 'none'
  const targetMarker: PipeMarker = selectedPipe.data?.targetMarker || 'none'
  const pipeColor = selectedPipe.data?.color || '#94a3b8'
  const lineWidth = selectedPipe.data?.lineWidth || 2
  const lineStyle: PipeLineStyle = selectedPipe.data?.lineStyle || 'solid'
  const isAnimated = selectedPipe.data?.animated || false

  return createPortal(
    <div
      className="fixed z-[9999] pointer-events-auto"
      style={{
        left: menuLeft,
        top: menuTop,
        transform: flipBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-lg shadow-lg border border-slate-200 p-2 flex flex-col gap-2 min-w-[220px]">
        {/* Description input */}
        <input
          value={descValue}
          onChange={(e) => setDescValue(e.target.value)}
          onBlur={handleDescBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isImeComposing(e)) (e.target as HTMLInputElement).blur()
            e.stopPropagation()
          }}
          placeholder={t('resources.dataflow.pipe.descriptionPlaceholder')}
          className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300 placeholder:text-slate-300"
        />

        {/* Line color */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-400 w-10 shrink-0">{t('resources.dataflow.pipe.color')}</span>
          <div className="flex gap-0.5">
            {PIPE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => handleStyleUpdate({ color: c })}
                className={`w-4 h-4 rounded-sm border ${
                  pipeColor === c ? 'border-slate-600 ring-1 ring-slate-300' : 'border-slate-300'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Line style */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-400 w-10 shrink-0">{t('resources.dataflow.pipe.style')}</span>
          <div className="flex gap-0.5">
            {LINE_STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleStyleUpdate({ lineStyle: opt.value })}
                className={`p-1 rounded transition-colors ${
                  lineStyle === opt.value ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:bg-slate-100'
                }`}
                title={t(LINE_STYLE_LABEL_KEYS[opt.value])}
              >
                <svg width="24" height="10" viewBox="0 0 24 10">
                  <line x1="1" y1="5" x2="23" y2="5" stroke="currentColor" strokeWidth="2"
                    strokeDasharray={opt.dash} strokeLinecap="round" />
                </svg>
              </button>
            ))}
            <button
              onClick={() => handleStyleUpdate({ animated: !isAnimated })}
              className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                isAnimated ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:bg-slate-100'
              }`}
              title={t('resources.dataflow.pipe.animatedFlow')}
            >
              {t('resources.dataflow.pipe.flow')}
            </button>
          </div>
        </div>

        {/* Line width */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-400 w-10 shrink-0">{t('resources.dataflow.pipe.width')}</span>
          <div className="flex gap-0.5">
            {LINE_WIDTH_OPTIONS.map((w) => (
              <button
                key={w}
                onClick={() => handleStyleUpdate({ lineWidth: w })}
                className={`p-1 rounded transition-colors ${
                  lineWidth === w ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:bg-slate-100'
                }`}
                title={`${w}px`}
              >
                <svg width="24" height="10" viewBox="0 0 24 10">
                  <line x1="1" y1="5" x2="23" y2="5" stroke="currentColor" strokeWidth={w} strokeLinecap="round" />
                </svg>
              </button>
            ))}
          </div>
        </div>

        {/* Marker selectors */}
        <MarkerSelector
          label={t('resources.dataflow.pipe.source')}
          value={sourceMarker}
          onChange={(v) => handleMarkerChange('sourceMarker', v)}
        />
        <MarkerSelector
          label={t('resources.dataflow.pipe.target')}
          value={targetMarker}
          onChange={(v) => handleMarkerChange('targetMarker', v)}
        />

        {/* Auto-route + Delete */}
        <div className="flex justify-between border-t border-slate-100 pt-1">
          <button
            onClick={handleAutoRoute}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
            title={t('resources.dataflow.pipe.autoRoute')}
          >
            <Route size={14} />
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
            title={t('resources.dataflow.pipe.delete')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
