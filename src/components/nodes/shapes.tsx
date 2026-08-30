import type { ShapeVariant } from '../../types'

interface ShapeSvgProps {
  width: number
  height: number
  fill: string
  stroke: string
  strokeWidth: number
}

export function renderShape({ width, height, fill, stroke, strokeWidth }: ShapeSvgProps, shape: ShapeVariant) {
  const sw = strokeWidth
  const half = sw / 2

  switch (shape) {
    case 'rectangle':
      return (
        <rect
          x={half} y={half}
          width={width - sw} height={height - sw}
          fill={fill} stroke={stroke} strokeWidth={sw}
        />
      )

    case 'rounded-rectangle':
      return (
        <rect
          x={half} y={half}
          width={width - sw} height={height - sw}
          rx={12} ry={12}
          fill={fill} stroke={stroke} strokeWidth={sw}
        />
      )

    case 'circle': {
      const cx = width / 2
      const cy = height / 2
      const rx = (width - sw) / 2
      const ry = (height - sw) / 2
      return (
        <ellipse
          cx={cx} cy={cy} rx={rx} ry={ry}
          fill={fill} stroke={stroke} strokeWidth={sw}
        />
      )
    }

    case 'diamond': {
      const cx = width / 2
      const cy = height / 2
      const points = `${cx},${half} ${width - half},${cy} ${cx},${height - half} ${half},${cy}`
      return (
        <polygon
          points={points}
          fill={fill} stroke={stroke} strokeWidth={sw}
        />
      )
    }

    case 'parallelogram': {
      const skew = Math.min(width * 0.2, 30)
      const points = `${skew + half},${half} ${width - half},${half} ${width - skew - half},${height - half} ${half},${height - half}`
      return (
        <polygon
          points={points}
          fill={fill} stroke={stroke} strokeWidth={sw}
        />
      )
    }

    case 'hexagon': {
      const inset = Math.min(width * 0.25, 40)
      const points = `${inset},${half} ${width - inset},${half} ${width - half},${height / 2} ${width - inset},${height - half} ${inset},${height - half} ${half},${height / 2}`
      return (
        <polygon
          points={points}
          fill={fill} stroke={stroke} strokeWidth={sw}
        />
      )
    }

    case 'triangle': {
      const cx = width / 2
      const points = `${cx},${half} ${width - half},${height - half} ${half},${height - half}`
      return (
        <polygon
          points={points}
          fill={fill} stroke={stroke} strokeWidth={sw}
        />
      )
    }

    case 'cylinder': {
      const ry = Math.min(height * 0.12, 20)
      const bodyTop = ry + half
      const bodyBottom = height - ry - half
      const cx = width / 2
      const rx = (width - sw) / 2
      // Top ellipse + body rect + bottom arc
      const d = [
        // top-left arc
        `M ${half},${bodyTop}`,
        `A ${rx},${ry} 0 0,1 ${width - half},${bodyTop}`,
        // right side
        `L ${width - half},${bodyBottom}`,
        // bottom arc
        `A ${rx},${ry} 0 0,1 ${half},${bodyBottom}`,
        // left side back to top
        `Z`,
      ].join(' ')
      // Top ellipse (full)
      return (
        <g>
          <path d={d} fill={fill} stroke={stroke} strokeWidth={sw} />
          <ellipse
            cx={cx} cy={bodyTop} rx={rx} ry={ry}
            fill={fill} stroke={stroke} strokeWidth={sw}
          />
        </g>
      )
    }

    default:
      return (
        <rect
          x={half} y={half}
          width={width - sw} height={height - sw}
          fill={fill} stroke={stroke} strokeWidth={sw}
        />
      )
  }
}

// Mini icon for toolbar/sidebar (16x16 viewBox)
export function shapeIcon(shape: ShapeVariant) {
  const props = { width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }

  return (
    <svg viewBox="0 0 16 16" width={16} height={16} className="shrink-0">
      {renderShape(props, shape)}
    </svg>
  )
}

export const SHAPE_VARIANTS: ShapeVariant[] = [
  'rectangle',
  'rounded-rectangle',
  'circle',
  'diamond',
  'parallelogram',
  'hexagon',
  'triangle',
  'cylinder',
]

export const SHAPE_LABELS: Record<ShapeVariant, string> = {
  'rectangle': 'Rectangle',
  'rounded-rectangle': 'Rounded',
  'circle': 'Circle',
  'diamond': 'Diamond',
  'parallelogram': 'Parallel',
  'hexagon': 'Hexagon',
  'triangle': 'Triangle',
  'cylinder': 'Cylinder',
}
