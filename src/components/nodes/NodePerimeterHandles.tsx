import { Handle, Position, useStore } from '@xyflow/react'

type PerimeterPosition = 'top' | 'right' | 'bottom' | 'left'

const PERIMETER_HANDLES: { pos: PerimeterPosition; position: Position; id: string }[] = [
  { pos: 'top', position: Position.Top, id: 'node-top' },
  { pos: 'right', position: Position.Right, id: 'node-right' },
  { pos: 'bottom', position: Position.Bottom, id: 'node-bottom' },
  { pos: 'left', position: Position.Left, id: 'node-left' },
]

/**
 * The four universal perimeter handles every node exposes (all type=source — connectionMode
 * is Loose, so they accept incoming connections too).
 *
 * The ids `node-top/right/bottom/left` and their Position are the wire format: stored
 * diagrams name them in `sourceHandle`/`targetHandle`, so neither the names nor which
 * side each one means may change.
 *
 * Where they land is a different question, and it is the caller's: React Flow positions
 * handles with `position: absolute`, so they anchor to the nearest POSITIONED ancestor and
 * React Flow then reads their real bounds back out of the DOM. Render this inside whichever
 * element is the node's visible body — for IconNode that is the icon square, not the outer
 * container, which also holds the caption and the action row.
 */
export default function NodePerimeterHandles({ className, classNameByPosition }: {
  className?: string
  /** Per-position class override, keyed top/right/bottom/left — used by JsonNode/ProcessNode which style header handles differently */
  classNameByPosition?: Partial<Record<PerimeterPosition, string>>
}) {
  // A read-only surface never paints these, whatever the node thinks (card a8596103).
  //
  // Nodes fade their dots in on hover, and that used to be unreachable in the viewer
  // because nothing inside a node could be hovered. A collapsed note now takes its hover
  // from the shared store, filled from the node WRAPPER, so hovering a note in a viewer
  // started painting four "drag me to connect" dots on a surface where connecting is
  // impossible. Measured, not inferred: the class read back as `!opacity-100`, computed
  // opacity 1.
  //
  // ⛔ Why this is not a rule in index.css next to the other read-only ones. The visible
  // class is Tailwind's `!opacity-100` — an IMPORTANT declaration inside `@layer
  // utilities`. For important declarations the cascade REVERSES layer order, so a layered
  // !important beats an unlayered one no matter how specific: a
  // `.dataflow-readonly .react-flow__handle { opacity: 0 !important }` was written, looked
  // right, and measured as opacity 1. The package ships unlayered CSS and does not own the
  // host's layer order, so the only durable fix is to never emit the visible class here.
  //
  // ⛔ And not `display: none` / unmounting either: React Flow measures handle bounds out
  // of the DOM and refuses to path an edge whose handle has none, so removing them from
  // layout would silently empty the viewer of every edge.
  const interactive = useStore((s) => s.elementsSelectable)
  const hide = (cls?: string) => (interactive ? cls : cls?.replace('!opacity-100', '!opacity-0'))

  return (
    <>
      {PERIMETER_HANDLES.map(({ pos, position, id }) => (
        <Handle
          key={id}
          type="source"
          position={position}
          id={id}
          className={hide(classNameByPosition?.[pos] ?? className)}
        />
      ))}
    </>
  )
}

// Literal per-color class strings — kept whole so Tailwind's source scanner
// keeps them in the bundle (constructing `!bg-${color}-400` would get purged).
const HANDLE_COLOR_CLASSES: Record<'slate' | 'sky' | 'indigo' | 'amber', string> = {
  slate: '!bg-slate-400 !border-slate-600',
  sky: '!bg-sky-400 !border-sky-600',
  indigo: '!bg-indigo-400 !border-indigo-600',
  amber: '!bg-amber-400 !border-amber-600',
}

/** Shared perimeter-handle style — a 10px dot in the node's accent color that fades in on hover/select. */
export function handleStyle(color: 'slate' | 'sky' | 'indigo' | 'amber', visible: boolean): string {
  return `!w-2.5 !h-2.5 ${HANDLE_COLOR_CLASSES[color]} !border-2 ${visible ? '!opacity-100' : '!opacity-0'} transition-opacity`
}
