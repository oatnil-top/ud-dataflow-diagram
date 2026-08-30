import { memo, useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { NodeResizer, type NodeProps, type Node } from '@xyflow/react'
import { Pencil, Check, X, Trash2, Code2 } from 'lucide-react'
import type { ShapeNodeData } from '../../types'
import { useFlowStore } from '../../store/flowStoreContext'
import { renderShape, SHAPE_VARIANTS, SHAPE_LABELS, shapeIcon } from './shapes'
import FloatingNodePanel from './FloatingNodePanel'
import NodePerimeterHandles, { handleStyle } from './NodePerimeterHandles'
import { isImeComposing } from '../../utils/ime'

type ShapeNodeType = Node<ShapeNodeData, 'shape'>

const FILL_COLORS = ['#eef2ff', '#f0fdf4', '#fef3c7', '#ffe4e6', '#e0f2fe', '#f3e8ff', '#ffffff', '#f1f5f9']
const STROKE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#64748b', '#1e1e1e']

/** Floating style panel rendered via portal — immune to React Flow pane deselection */
function StylePanel({
  data, fillColor, strokeColor, onUpdateShape, anchorEl,
}: {
  data: ShapeNodeData
  fillColor: string
  strokeColor: string
  onUpdateShape: (updates: Partial<ShapeNodeData>) => void
  anchorEl: HTMLElement
}) {
  const { t } = useTranslation()
  return (
    <FloatingNodePanel
      anchorEl={anchorEl}
      className="bg-white/95 rounded-lg shadow-md border border-gray-200 p-2 flex flex-col gap-1.5"
    >
      {/* Shape switcher */}
      <div className="flex items-center gap-0.5">
        {SHAPE_VARIANTS.map((s) => (
          <button
            key={s}
            onClick={() => onUpdateShape({ shape: s })}
            className={`p-1 rounded transition-colors ${
              data.shape === s ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'
            }`}
            title={SHAPE_LABELS[s]}
          >
            {shapeIcon(s)}
          </button>
        ))}
      </div>
      {/* Fill colors */}
      <div className="flex items-center gap-0.5">
        <span className="text-[9px] text-gray-400 w-6">{t('resources.dataflow.node.fill')}</span>
        {FILL_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onUpdateShape({ fillColor: c })}
            className={`w-4 h-4 rounded-sm border ${
              fillColor === c ? 'border-indigo-500 ring-1 ring-indigo-300' : 'border-gray-300'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      {/* Stroke colors */}
      <div className="flex items-center gap-0.5">
        <span className="text-[9px] text-gray-400 w-6">{t('resources.dataflow.node.line')}</span>
        {STROKE_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onUpdateShape({ strokeColor: c })}
            className={`w-4 h-4 rounded-sm border ${
              strokeColor === c ? 'border-indigo-500 ring-1 ring-indigo-300' : 'border-gray-300'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </FloatingNodePanel>
  )
}

function ShapeNode({ id, data, selected }: NodeProps<ShapeNodeType>) {
  const { t } = useTranslation()
  const flowStore = useFlowStore()
  const updateShapeNode = flowStore((state) => state.updateShapeNode)

  const removeNode = flowStore((state) => state.removeNode)
  const setRawEditNode = flowStore((state) => state.setRawEditNode)

  const [isEditingName, setIsEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(data.name)
  const [isEditingText, setIsEditingText] = useState(false)
  const [textValue, setTextValue] = useState(data.text)
  const [hovered, setHovered] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 160, height: 80 })

  const fillColor = data.fillColor || '#eef2ff'
  const strokeColor = data.strokeColor || '#6366f1'
  const strokeWidth = data.strokeWidth || 2
  const textColor = data.textColor || '#1e1e1e'
  const fontSize = data.fontSize || 13
  const textAlign = data.textAlign || 'center'

  useEffect(() => { setNameValue(data.name) }, [data.name])
  useEffect(() => { setTextValue(data.text) }, [data.text])

  // Track container size for SVG rendering
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Auto-resize textarea
  useEffect(() => {
    if (isEditingText && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [isEditingText, textValue])

  const saveName = useCallback(() => {
    const trimmed = nameValue.trim()
    if (trimmed && trimmed !== data.name) {
      updateShapeNode?.(id, { name: trimmed })
    } else {
      setNameValue(data.name)
    }
    setIsEditingName(false)
  }, [id, nameValue, data.name, updateShapeNode])

  const saveText = useCallback(() => {
    if (textValue !== data.text) {
      updateShapeNode?.(id, { text: textValue })
    }
    setIsEditingText(false)
  }, [id, textValue, data.text, updateShapeNode])

  const handleClass = handleStyle('indigo', hovered || selected)

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <NodeResizer
        minWidth={60}
        minHeight={40}
        isVisible={selected}
        lineClassName="!border-indigo-400"
        handleClassName="!w-2.5 !h-2.5 !bg-indigo-400 !border-2 !border-white !rounded"
      />
      <NodePerimeterHandles className={handleClass} />

      {/* SVG shape background */}
      <svg
        width={size.width}
        height={size.height}
        className="absolute inset-0 pointer-events-none"
        style={{ overflow: 'visible' }}
      >
        {renderShape({
          width: size.width,
          height: size.height,
          fill: fillColor,
          stroke: selected ? '#818cf8' : strokeColor,
          strokeWidth: selected ? strokeWidth + 1 : strokeWidth,
        }, data.shape)}
      </svg>

      {/* Text content overlay — centered inside the shape */}
      <div
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        style={{ padding: data.shape === 'diamond' ? '20%' : data.shape === 'triangle' ? '15% 10% 5%' : '8px 12px' }}
      >
        {isEditingText ? (
          <textarea
            ref={textareaRef}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setTextValue(data.text); setIsEditingText(false) }
              // Shift+Enter for newline, Enter alone to save
              if (e.key === 'Enter' && !e.shiftKey && !isImeComposing(e)) { e.preventDefault(); saveText() }
            }}
            onBlur={saveText}
            className="nodrag nowheel w-full bg-transparent border-none outline-none resize-none text-center"
            style={{ color: textColor, fontSize: `${fontSize}px`, textAlign }}
            autoFocus
          />
        ) : (
          <div
            className="nodrag w-full cursor-text whitespace-pre-wrap break-words"
            style={{ color: textColor, fontSize: `${fontSize}px`, textAlign }}
            onDoubleClick={() => setIsEditingText(true)}
          >
            {data.text || (
              <span className="text-gray-400 italic text-xs">{t('resources.dataflow.node.doubleClickEdit')}</span>
            )}
          </div>
        )}
      </div>

      {/* Hover toolbar — top-right, appears on hover. Must stay mounted while
          renaming: the rename input lives inside it, so gating on
          !isEditingName would unmount the input the moment the pencil is
          clicked, making rename unreachable. */}
      {(hovered || selected || isEditingName) && !isEditingText && (
        <div className="absolute -top-7 right-0 flex items-center gap-0.5 bg-white/90 rounded shadow-sm border border-gray-200 px-1 py-0.5">
          {isEditingName ? (
            <div className="flex items-center gap-1">
              <input
                value={nameValue}
                size={Math.max(nameValue.length, 8)}
                onChange={(e) => setNameValue(e.target.value)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isImeComposing(e)) saveName()
                  if (e.key === 'Escape') { setNameValue(data.name); setIsEditingName(false) }
                }}
                className="px-1 py-0.5 text-[10px] rounded border border-indigo-300 bg-white text-gray-800 focus:outline-none min-w-[72px] max-w-[200px]"
                autoFocus
              />
              <button onClick={saveName} className="p-0.5 text-emerald-600 hover:bg-emerald-100 rounded">
                <Check size={10} />
              </button>
              <button onClick={() => { setNameValue(data.name); setIsEditingName(false) }} className="p-0.5 text-gray-400 hover:bg-gray-100 rounded">
                <X size={10} />
              </button>
            </div>
          ) : (
            <>
              <span className="text-[10px] text-gray-500 px-1 truncate max-w-[80px]" title={data.name}>
                {data.name}
              </span>
              <button
                onClick={() => setRawEditNode?.(id)}
                className="p-0.5 rounded hover:bg-gray-100 text-gray-500"
                title={t('resources.dataflow.node.rawEditor')}
              >
                <Code2 size={10} />
              </button>
              <button
                onClick={() => setIsEditingName(true)}
                className="p-0.5 rounded hover:bg-gray-100 text-gray-500"
                title={t('resources.dataflow.node.rename')}
              >
                <Pencil size={10} />
              </button>
              <button
                onClick={() => removeNode?.(id)}
                className="p-0.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-500"
                title={t('common.delete')}
              >
                <Trash2 size={10} />
              </button>
            </>
          )}
        </div>
      )}

      {/* Style panel — rendered via portal to avoid React Flow pane deselection */}
      {selected && !isEditingText && !isEditingName && containerRef.current && (
        <StylePanel
          data={data}
          fillColor={fillColor}
          strokeColor={strokeColor}
          onUpdateShape={(updates) => updateShapeNode?.(id, updates)}
          anchorEl={containerRef.current}
        />
      )}
    </div>
  )
}

export default memo(ShapeNode)
