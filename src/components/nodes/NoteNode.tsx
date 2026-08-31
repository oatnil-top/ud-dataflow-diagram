import { memo, useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { NodeResizer, useUpdateNodeInternals, type NodeProps, type Node } from '@xyflow/react'
import { Pencil, Check, X, Trash2, StickyNote, Link2, Code2 } from 'lucide-react'
import type { NoteNodeData } from '../../types'
import { useFlowStore } from '../../store/flowStoreContext'
import { sanitizeNodeUrl } from '../../utils/sanitizeUrl'
import FloatingNodePanel from './FloatingNodePanel'
import NodePerimeterHandles, { handleStyle } from './NodePerimeterHandles'
import { isImeComposing } from '../../utils/ime'

type NoteNodeType = Node<NoteNodeData, 'note'>

// Style presets — each defines a coherent color scheme
const NOTE_PRESETS = [
  { name: 'Amber', fill: '#fffbeb', border: '#fef3c7', header: '#fef3c7', text: '#92400e' },
  { name: 'Blue', fill: '#eff6ff', border: '#bfdbfe', header: '#dbeafe', text: '#1e40af' },
  { name: 'Green', fill: '#f0fdf4', border: '#bbf7d0', header: '#dcfce7', text: '#166534' },
  { name: 'Rose', fill: '#fff1f2', border: '#fecdd3', header: '#ffe4e6', text: '#9f1239' },
  { name: 'Violet', fill: '#f5f3ff', border: '#ddd6fe', header: '#ede9fe', text: '#5b21b6' },
  { name: 'Slate', fill: '#f8fafc', border: '#e2e8f0', header: '#f1f5f9', text: '#334155' },
  { name: 'Cyan', fill: '#ecfeff', border: '#a5f3fc', header: '#cffafe', text: '#155e75' },
  { name: 'Orange', fill: '#fff7ed', border: '#fed7aa', header: '#ffedd5', text: '#9a3412' },
]

// Font size options
const FONT_SIZES = [10, 11, 12, 13, 14, 16]

/** Floating style panel rendered via portal */
function NoteStylePanel({
  data, onUpdate, anchorEl,
}: {
  data: NoteNodeData
  onUpdate: (updates: Partial<NoteNodeData>) => void
  anchorEl: HTMLElement
}) {
  const { t } = useTranslation()
  const currentFill = data.fillColor || '#fffbeb'
  const currentFontSize = data.fontSize || 12

  return (
    <FloatingNodePanel
      anchorEl={anchorEl}
      className="flex flex-col gap-1.5 p-2 rounded-lg"
      style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
    >
      {/* Color presets */}
      <div className="flex items-center gap-0.5">
        <span className="text-[9px] w-7 shrink-0" style={{ color: '#94a3b8' }}>{t('resources.dataflow.node.color')}</span>
        {NOTE_PRESETS.map((p) => (
          <button
            key={p.name}
            onClick={() => onUpdate({
              fillColor: p.fill,
              borderColor: p.border,
              headerColor: p.header,
              textColor: p.text,
            })}
            className={`w-4 h-4 rounded-sm border transition-transform hover:scale-125 ${
              currentFill === p.fill ? 'border-slate-600 scale-110' : 'border-slate-300'
            }`}
            style={{ backgroundColor: p.fill, borderBottomColor: p.border, borderBottomWidth: 2 }}
            title={p.name}
          />
        ))}
      </div>
      {/* Font size */}
      <div className="flex items-center gap-0.5">
        <span className="text-[9px] w-7 shrink-0" style={{ color: '#94a3b8' }}>{t('resources.dataflow.node.size')}</span>
        {FONT_SIZES.map((s) => (
          <button
            key={s}
            onClick={() => onUpdate({ fontSize: s })}
            className={`flex items-center justify-center w-5 h-4 rounded text-[8px] font-mono transition-colors ${
              currentFontSize === s ? 'bg-slate-200 text-slate-800' : 'hover:bg-slate-100 text-slate-500'
            }`}
            title={`${s}px`}
          >
            {s}
          </button>
        ))}
      </div>
    </FloatingNodePanel>
  )
}

function NoteNode({ id, data, selected }: NodeProps<NoteNodeType>) {
  const { t } = useTranslation()
  const updateNodeInternals = useUpdateNodeInternals()
  const flowStore = useFlowStore()
  const updateNoteNode = flowStore((state) => state.updateNoteNode)
  const updateNodeUrl = flowStore((state) => state.updateNodeUrl)
  const removeNode = flowStore((state) => state.removeNode)
  const setRawEditNode = flowStore((state) => state.setRawEditNode)
  // Hover lives in the store, not in this component (card a8596103): a collapsed note's
  // peek panel and its EDGES have to appear and disappear together, and the edges are
  // decided one level up (useCollapsedNoteEdges). A local boolean here plus another one
  // there is two clocks. The selector returns a boolean, so zustand re-renders only the
  // two notes whose hover actually changed, not all 31.
  const hovered = flowStore((state) => state.hoveredNodeId === id)
  const setHoveredNode = flowStore((state) => state.setHoveredNode)
  const clearHoveredNode = flowStore((state) => state.clearHoveredNode)

  const containerRef = useRef<HTMLDivElement>(null)
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(data.name)
  const [isEditingContent, setIsEditingContent] = useState(false)
  const [contentValue, setContentValue] = useState(data.content)
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const [urlValue, setUrlValue] = useState(data.url || '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Resolve style values with defaults (amber)
  const fillColor = data.fillColor || '#fffbeb'
  const borderColor = data.borderColor || '#fef3c7'
  const headerColor = data.headerColor || '#fef3c7'
  const textColor = data.textColor || '#92400e'
  const fontSize = data.fontSize || 12
  const selectedBorderColor = data.borderColor
    ? adjustColorBrightness(data.borderColor, -30)
    : '#fbbf24' // amber-400

  // Sync with external data changes
  useEffect(() => { setNameValue(data.name) }, [data.name])
  useEffect(() => { setContentValue(data.content) }, [data.content])
  useEffect(() => { setUrlValue(data.url || '') }, [data.url])

  // Update node internals when collapsed state changes so handles reposition correctly
  useEffect(() => {
    updateNodeInternals(id)
  }, [id, data.collapsed, updateNodeInternals])

  // Auto-resize textarea
  useEffect(() => {
    if (isEditingContent && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
      textareaRef.current.focus()
    }
  }, [isEditingContent, contentValue])

  const toggleCollapsed = useCallback(() => {
    updateNoteNode?.(id, { collapsed: !data.collapsed })
  }, [id, data.collapsed, updateNoteNode])

  const saveName = useCallback(() => {
    const trimmed = nameValue.trim()
    if (trimmed && trimmed !== data.name) {
      updateNoteNode?.(id, { name: trimmed })
    } else {
      setNameValue(data.name)
    }
    setIsEditingName(false)
  }, [id, nameValue, data.name, updateNoteNode])

  const saveContent = useCallback(() => {
    if (contentValue !== data.content) {
      updateNoteNode?.(id, { content: contentValue })
    }
    setIsEditingContent(false)
  }, [id, contentValue, data.content, updateNoteNode])

  const saveUrl = useCallback(() => {
    const trimmed = urlValue.trim()
    updateNodeUrl?.(id, trimmed || undefined)
    setIsEditingUrl(false)
  }, [id, urlValue, updateNodeUrl])

  const handleClass = handleStyle('amber', hovered || selected)

  // Collapsed: small square with icon, click to expand
  if (data.collapsed) {
    return (
      <div
        ref={containerRef}
        className={`rounded-lg border w-8 h-8 flex items-center justify-center cursor-pointer`}
        style={{
          backgroundColor: headerColor,
          borderColor: selected ? selectedBorderColor : borderColor,
        }}
        onMouseEnter={() => setHoveredNode(id)}
        onMouseLeave={() => clearHoveredNode(id)}
        onDoubleClick={toggleCollapsed}
      >
        <NodePerimeterHandles className={handleClass} />
        <StickyNote size={14} style={{ color: textColor }} />
        {/* Peek (card a8596103). Collapsing a note used to hide its content and keep its
            line — the noisiest half of both. Now the line goes too, and hover brings back
            content AND line together, so sweeping a column of collapsed notes answers
            "which node is this one about" without opening any of them.

            Always mounted, opacity-toggled, rather than mounted on hover: an element that
            is unmounted cannot fade OUT, and the card asks for a fade in both directions.
            It costs one hidden subtree per collapsed note and no work per frame — see the
            note above .note-collapsed-peek in index.css.

            pointer-events: none is load-bearing, not tidiness. The peek sits over the
            canvas, and in a column of notes it covers the next note down; if it could take
            the pointer it would eat that note's mouseenter and the reveal would just stop
            working somewhere down the column, with nothing on screen saying why.

            The native `title` tooltip this replaces was removed on purpose: two tooltips
            for one square, one of them a second late, read as a bug. */}
        <div
          className={`note-collapsed-peek${hovered ? ' is-visible' : ''}`}
          style={{ backgroundColor: fillColor, borderColor, color: textColor, fontSize: `${fontSize}px` }}
        >
          <div className="note-collapsed-peek-title">{data.name}</div>
          {data.content && <div className="note-collapsed-peek-body">{data.content}</div>}
        </div>
      </div>
    )
  }

  // Expanded: full note
  return (
    <div
      ref={containerRef}
      className="rounded-lg border w-full h-full"
      style={{
        backgroundColor: fillColor,
        borderColor: selected ? selectedBorderColor : borderColor,
      }}
      onMouseEnter={() => setHoveredNode(id)}
      onMouseLeave={() => clearHoveredNode(id)}
    >
      <NodeResizer
        minWidth={140}
        minHeight={60}
        isVisible={selected}
        lineClassName="!border-amber-400"
        handleClassName="!w-2.5 !h-2.5 !bg-amber-400 !border-2 !border-white !rounded"
      />
      {/* Connection handles — all four directions, visible on hover */}
      <NodePerimeterHandles className={handleClass} />

      {/* Header */}
      <div className="flex items-center gap-1 px-3 py-2 border-b"
        style={{ backgroundColor: headerColor, borderColor }}
      >
        <button
          onClick={toggleCollapsed}
          className="p-0.5 rounded hover:opacity-70 transition-colors"
          style={{ color: textColor }}
          title={t('resources.dataflow.node.collapse')}
        >
          <StickyNote size={14} />
        </button>

        {isEditingName ? (
          <div className="nodrag flex items-center gap-1 flex-1 min-w-0">
            <input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isImeComposing(e)) saveName()
                if (e.key === 'Escape') { setNameValue(data.name); setIsEditingName(false) }
              }}
              className="flex-1 min-w-0 px-1 py-0.5 text-xs font-semibold rounded border bg-white focus:outline-none focus:ring-1"
              style={{ borderColor, color: textColor, '--tw-ring-color': borderColor } as React.CSSProperties}
              autoFocus
            />
            <button onClick={saveName} className="p-0.5 text-emerald-600 hover:bg-emerald-100 rounded">
              <Check size={12} />
            </button>
            <button onClick={() => { setNameValue(data.name); setIsEditingName(false) }} className="p-0.5 text-slate-400 hover:bg-slate-100 rounded">
              <X size={12} />
            </button>
          </div>
        ) : isEditingUrl ? (
          <div className="nodrag flex items-center gap-1 flex-1 min-w-0">
            <input
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isImeComposing(e)) saveUrl()
                if (e.key === 'Escape') { setUrlValue(data.url || ''); setIsEditingUrl(false) }
              }}
              placeholder="https://..."
              className="flex-1 min-w-0 px-1 py-0.5 text-xs rounded border bg-white focus:outline-none focus:ring-1 font-mono"
              style={{ borderColor, color: textColor, '--tw-ring-color': borderColor } as React.CSSProperties}
              autoFocus
            />
            <button onClick={saveUrl} className="p-0.5 text-emerald-600 hover:bg-emerald-100 rounded">
              <Check size={12} />
            </button>
            <button onClick={() => { setUrlValue(data.url || ''); setIsEditingUrl(false) }} className="p-0.5 text-slate-400 hover:bg-slate-100 rounded">
              <X size={12} />
            </button>
          </div>
        ) : (
          <>
            {data.url ? (
              <a
                href={sanitizeNodeUrl(data.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="nodrag flex-1 text-xs font-semibold truncate hover:underline"
                style={{ color: textColor }}
                title={data.url}
              >
                {data.name}
              </a>
            ) : (
              <span
                className="flex-1 text-xs font-semibold truncate cursor-pointer"
                style={{ color: textColor }}
                onDoubleClick={() => setIsEditingName(true)}
              >
                {data.name}
              </span>
            )}
          </>
        )}

        {!isEditingName && !isEditingUrl && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setRawEditNode?.(id)}
              className="p-0.5 rounded hover:opacity-70 transition-colors"
              style={{ color: adjustColorBrightness(textColor, 40) }}
              title={t('resources.dataflow.node.rawEditor')}
            >
              <Code2 size={11} />
            </button>
            <button
              onClick={() => { setUrlValue(data.url || ''); setIsEditingUrl(true) }}
              className="p-0.5 rounded hover:opacity-70 transition-colors"
              style={{ color: data.url ? textColor : adjustColorBrightness(textColor, 60) }}
              title={data.url ? t('resources.dataflow.node.editLink', { url: data.url }) : t('resources.dataflow.node.addLink')}
            >
              <Link2 size={11} />
            </button>
            <button
              onClick={() => setIsEditingName(true)}
              className="p-0.5 rounded hover:opacity-70 transition-colors"
              style={{ color: adjustColorBrightness(textColor, 40) }}
              title={t('resources.dataflow.node.rename')}
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={() => removeNode?.(id)}
              className="p-0.5 rounded hover:bg-red-100 transition-colors hover:text-red-500"
              style={{ color: adjustColorBrightness(textColor, 60) }}
              title={t('common.delete')}
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>

      {/* Content body */}
      <div className="px-3 py-2 overflow-auto" style={{ height: 'calc(100% - 36px)' }}>
        {isEditingContent ? (
          <div className="nodrag flex flex-col gap-1 h-full">
            <textarea
              ref={textareaRef}
              value={contentValue}
              onChange={(e) => setContentValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setContentValue(data.content); setIsEditingContent(false) }
              }}
              className="w-full flex-1 min-h-[60px] px-2 py-1.5 font-mono rounded border bg-white focus:outline-none focus:ring-1 resize-none"
              style={{ fontSize: `${fontSize}px`, borderColor, color: textColor, '--tw-ring-color': borderColor } as React.CSSProperties}
              placeholder={t('resources.dataflow.node.notePlaceholder')}
            />
            <div className="flex justify-end gap-1">
              <button onClick={saveContent} className="px-2 py-0.5 text-xs text-white rounded" style={{ backgroundColor: textColor }}>
                <Check size={12} />
              </button>
              <button onClick={() => { setContentValue(data.content); setIsEditingContent(false) }} className="px-2 py-0.5 text-xs bg-slate-200 text-slate-600 rounded hover:bg-slate-300">
                <X size={12} />
              </button>
            </div>
          </div>
        ) : (
          <div
            className="font-mono whitespace-pre-wrap cursor-pointer min-h-[20px]"
            style={{ fontSize: `${fontSize}px`, color: textColor }}
            onDoubleClick={() => setIsEditingContent(true)}
          >
            {data.content || <span style={{ color: adjustColorBrightness(textColor, 80), fontStyle: 'italic' }}>{t('resources.dataflow.node.doubleClickAddText')}</span>}
          </div>
        )}
      </div>

      {/* Style panel — rendered via portal when selected */}
      {selected && !isEditingContent && !isEditingName && !isEditingUrl && containerRef.current && (
        <NoteStylePanel
          data={data}
          onUpdate={(updates) => updateNoteNode?.(id, updates)}
          anchorEl={containerRef.current}
        />
      )}
    </div>
  )
}

/** Simple hex color brightness adjustment */
function adjustColorBrightness(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.max(0, (num >> 16) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount))
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount))
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`
}

export default memo(NoteNode)
