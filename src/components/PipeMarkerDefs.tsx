import { memo, useMemo } from 'react'
import { useFlowStore } from '../store/flowStoreContext'
import type { PipeData, PipeMarker } from '../types'

/**
 * SVG marker definitions for pipe endpoints.
 * Rendered inside ReactFlow's SVG layer so edges can reference them via url(#id).
 * The browser automatically rotates markers to follow the path tangent.
 */

const MARKER_TYPES: PipeMarker[] = ['arrow', 'one', 'many']

function PipeMarkerDefs() {
  const flowStore = useFlowStore()
  const pipes = flowStore((s) => s.pipes)

  // Collect all unique colors used by pipes
  const colors = useMemo(() => {
    const colorSet = new Set<string>()
    colorSet.add('94a3b8') // default edge color
    colorSet.add('3b82f6') // selected/hover color
    colorSet.add('60a5fa') // hover color
    colorSet.add('d97706') // note pipe color
    for (const pipe of pipes) {
      const stroke = pipe.style?.stroke
      if (stroke) colorSet.add(stroke.replace('#', ''))
      const dataColor = (pipe.data as PipeData | undefined)?.color
      if (dataColor) colorSet.add(dataColor.replace('#', ''))
    }
    return Array.from(colorSet)
  }, [pipes])

  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        {colors.flatMap((colorKey) =>
          MARKER_TYPES.map((type) => (
            <MarkerDef key={`${type}-${colorKey}`} type={type} colorKey={colorKey} />
          ))
        )}
      </defs>
    </svg>
  )
}

function MarkerDef({ type, colorKey }: { type: PipeMarker; colorKey: string }) {
  const color = `#${colorKey}`
  const id = `dataflow-marker-${type}-${colorKey}`

  if (type === 'arrow') {
    return (
      <marker
        id={id}
        viewBox="0 0 12 12"
        refX={10}
        refY={6}
        markerWidth={7}
        markerHeight={7}
        orient="auto-start-reverse"
      >
        <polyline
          points="2,2 10,6 2,10"
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </marker>
    )
  }

  if (type === 'one') {
    return (
      <marker
        id={id}
        viewBox="0 0 12 12"
        refX={6}
        refY={6}
        markerWidth={7}
        markerHeight={7}
        orient="auto-start-reverse"
      >
        <line x1={6} y1={1} x2={6} y2={11} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      </marker>
    )
  }

  if (type === 'many') {
    // Crow's foot: tips at refX (path endpoint), vertex behind along the path.
    // Fork fans out toward the target node — standard ER "many" notation.
    return (
      <marker
        id={id}
        viewBox="0 0 14 12"
        refX={12}
        refY={6}
        markerWidth={8}
        markerHeight={8}
        orient="auto-start-reverse"
      >
        <line x1={2} y1={6} x2={12} y2={1} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
        <line x1={2} y1={6} x2={12} y2={6} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
        <line x1={2} y1={6} x2={12} y2={11} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      </marker>
    )
  }

  return null
}

export default memo(PipeMarkerDefs)
