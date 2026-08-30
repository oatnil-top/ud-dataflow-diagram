import { memo, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { type NodeProps, type Node } from '@xyflow/react'
import { Pencil, Check, X, Trash2, Link2 } from 'lucide-react'
import type { IconNodeData } from '../../types'
import { useFlowStore } from '../../store/flowStoreContext'
import { sanitizeNodeUrl } from '../../utils/sanitizeUrl'
import NodeIcon from '../icons/NodeIcon'
import FloatingNodePanel from './FloatingNodePanel'
import NodePerimeterHandles, { handleStyle } from './NodePerimeterHandles'
import { isImeComposing } from '../../utils/ime'

type IconNodeType = Node<IconNodeData, 'icon'>

// Stroke (line) color presets
const STROKE_COLORS = [
  { value: '#475569', label: 'Slate' },
  { value: '#1e293b', label: 'Dark' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#10b981', label: 'Green' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Red' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#FF9900', label: 'AWS' },
  { value: '#0078D4', label: 'Azure' },
]

// Fill color presets
const FILL_COLORS = [
  { value: 'none', label: 'None' },
  { value: '#dbeafe', label: 'Blue' },
  { value: '#dcfce7', label: 'Green' },
  { value: '#fef9c3', label: 'Yellow' },
  { value: '#fee2e2', label: 'Red' },
  { value: '#ede9fe', label: 'Violet' },
  { value: '#ffedd5', label: 'Orange' },
  { value: '#f1f5f9', label: 'Slate' },
  { value: '#ffffff', label: 'White' },
]

/** Floating style panel rendered via portal — immune to React Flow pane deselection */
function IconStylePanel({
  iconColor, iconFill, iconStrokeWidth, onUpdate, anchorEl,
}: {
  iconColor: string
  iconFill: string
  iconStrokeWidth: number
  onUpdate: (data: Partial<IconNodeData>) => void
  anchorEl: HTMLElement
}) {
  const { t } = useTranslation()
  return (
    <FloatingNodePanel
      anchorEl={anchorEl}
      className="flex flex-col gap-1 p-1.5 rounded-lg"
      style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
    >
      {/* Stroke color row */}
      <div className="flex items-center gap-0.5">
        <span className="text-[9px] w-6 shrink-0" style={{ color: '#94a3b8' }}>{t('resources.dataflow.node.line')}</span>
        {STROKE_COLORS.map((c) => (
          <button
            key={`s-${c.value}`}
            onClick={() => onUpdate({ color: c.value })}
            className={`w-3.5 h-3.5 rounded-full border transition-transform hover:scale-125 ${
              iconColor === c.value ? 'border-slate-600 scale-110' : 'border-white'
            }`}
            style={{ backgroundColor: c.value }}
            title={c.label}
          />
        ))}
      </div>
      {/* Fill color row */}
      <div className="flex items-center gap-0.5">
        <span className="text-[9px] w-6 shrink-0" style={{ color: '#94a3b8' }}>{t('resources.dataflow.node.fill')}</span>
        {FILL_COLORS.map((c) => (
          <button
            key={`f-${c.value}`}
            onClick={() => onUpdate({ fill: c.value === 'none' ? undefined : c.value })}
            className={`w-3.5 h-3.5 rounded-full border transition-transform hover:scale-125 ${
              iconFill === c.value ? 'border-slate-600 scale-110' : 'border-slate-300'
            }`}
            style={{
              backgroundColor: c.value === 'none' ? '#ffffff' : c.value,
              ...(c.value === 'none' ? { backgroundImage: 'linear-gradient(135deg, #fff 45%, #ef4444 45%, #ef4444 55%, #fff 55%)' } : {}),
            }}
            title={c.label}
          />
        ))}
      </div>
      {/* Stroke width row */}
      <div className="flex items-center gap-0.5">
        <span className="text-[9px] w-6 shrink-0" style={{ color: '#94a3b8' }}>{t('resources.dataflow.node.strokeWeight')}</span>
        {[1, 1.5, 2, 2.5, 3].map((w) => (
          <button
            key={`w-${w}`}
            onClick={() => onUpdate({ strokeWidth: w })}
            className={`flex items-center justify-center w-6 h-3.5 rounded text-[8px] font-mono transition-colors ${
              iconStrokeWidth === w ? 'bg-slate-200 text-slate-800' : 'hover:bg-slate-100 text-slate-500'
            }`}
            title={t('resources.dataflow.node.strokeWidth', { w })}
          >
            {w}
          </button>
        ))}
      </div>
    </FloatingNodePanel>
  )
}

function IconNode({ id, data, selected }: NodeProps<IconNodeType>) {
  const { t } = useTranslation()
  const flowStore = useFlowStore()
  const updateIconNode = flowStore((state) => state.updateIconNode)
  const updateNodeUrl = flowStore((state) => state.updateNodeUrl)
  const removeNode = flowStore((state) => state.removeNode)

  const containerRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [nameValue, setNameValue] = useState(data.name)
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const [urlValue, setUrlValue] = useState(data.url || '')

  const iconColor = data.color || '#475569'
  const iconFill = data.fill || 'none'
  const iconStrokeWidth = data.strokeWidth ?? 1
  const handleClass = handleStyle('slate', hovered || selected)

  const saveName = useCallback(() => {
    const trimmed = nameValue.trim()
    if (trimmed && trimmed !== data.name) {
      updateIconNode?.(id, { name: trimmed })
    } else {
      setNameValue(data.name)
    }
    setIsEditing(false)
  }, [id, nameValue, data.name, updateIconNode])

  const saveUrl = useCallback(() => {
    const trimmed = urlValue.trim()
    updateNodeUrl?.(id, trimmed || undefined)
    setIsEditingUrl(false)
  }, [id, urlValue, updateNodeUrl])

  return (
    <div
      ref={containerRef}
      className={`flex flex-col items-center gap-1 relative`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ minWidth: 80 }}
    >
      {/* Icon — an icon node is "graphic on top, caption underneath", and the
          four perimeter handles belong to the GRAPHIC, not to the node box.
          They live inside this `relative` square so React Flow's own
          `.react-flow__handle-{top,right,bottom,left}` offsets resolve against
          the graphic: React Flow reads each handle's position back out of the
          DOM (getHandleBounds → getBoundingClientRect), so moving the elements
          moves the edge endpoints with them. Anchored to the outer container
          instead, `bottom` landed under the caption and the action row (36px
          low) and `left`/`right` were pulled 18px below the graphic's mid-line
          — connections looked hung off the title rather than joined to the icon.
          Handle IDs and their Position stay exactly as they were: `node-top`
          is still Top, etc., so stored manifests keep meaning what they say.
          Card 7527b8c3. */}
      <div
        className={`relative p-3 rounded-lg border transition-colors ${
          selected
            ? 'bg-white border-blue-500 ring-1 ring-blue-500'
            : 'bg-white border-[#e5e5e5] hover:border-slate-400'
        }`}
      >
        <NodeIcon iconId={data.icon} size={32} style={{ color: iconColor }} fill={iconFill} strokeWidth={iconStrokeWidth} />
        <NodePerimeterHandles className={handleClass} />
      </div>

      {/* Label — clamped to 3 wrapped lines at 100px, not a 1-line truncate
          (card 249e596f). One line showed ~7 chars regardless of zoom, which
          made same-prefix names ("ConfigMap con…" / "ConfigMap am…")
          indistinguishable without hovering. Width stays 100px so columns
          keep their rhythm; only the caption's height can grow (by up to
          two extra lines over the old single line),
          and the perimeter handles live on the graphic above, so edge
          anchors do not move. Full name remains on the title tooltip. */}
      {isEditing ? (
        <>
          {/* Static label + an invisible action-row placeholder stay in the
              layout so the node's measured bounds — and with them the anchor
              points and connected edges — don't shift while the floating
              editor is open */}
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs font-medium text-center max-w-[100px] line-clamp-3 break-words opacity-30" style={{ color: '#111111' }}>
              {data.name}
            </span>
            <div className="invisible flex items-center gap-0.5" aria-hidden>
              <span className="p-0.5"><Pencil size={10} /></span>
            </div>
          </div>
          {containerRef.current && (
            <FloatingNodePanel
              anchorEl={containerRef.current}
              className="flex items-center bg-white border border-blue-400 rounded-md pl-1 pr-0.5 py-0.5"
            >
              <input
                value={nameValue}
                // Grow with the content so long names never clip mid-edit
                size={Math.max(nameValue.length, 8)}
                onChange={(e) => setNameValue(e.target.value)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isImeComposing(e)) saveName()
                  if (e.key === 'Escape') { setNameValue(data.name); setIsEditing(false) }
                }}
                className="px-0.5 text-xs font-medium text-center bg-transparent outline-none min-w-[72px] max-w-[200px] text-slate-800"
                autoFocus
              />
              <button onClick={saveName} className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded" title="⏎">
                <Check size={11} />
              </button>
              <button onClick={() => { setNameValue(data.name); setIsEditing(false) }} className="p-0.5 text-slate-400 hover:bg-slate-50 rounded" title="Esc">
                <X size={11} />
              </button>
            </FloatingNodePanel>
          )}
        </>
      ) : isEditingUrl ? (
        <>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs font-medium text-center max-w-[100px] line-clamp-3 break-words opacity-30" style={{ color: '#111111' }}>
              {data.name}
            </span>
            <div className="invisible flex items-center gap-0.5" aria-hidden>
              <span className="p-0.5"><Pencil size={10} /></span>
            </div>
          </div>
          {containerRef.current && (
            <FloatingNodePanel
              anchorEl={containerRef.current}
              className="flex items-center bg-white border border-blue-400 rounded-md pl-1 pr-0.5 py-0.5"
            >
              <input
                value={urlValue}
                size={Math.max(urlValue.length, 12)}
                onChange={(e) => setUrlValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isImeComposing(e)) saveUrl()
                  if (e.key === 'Escape') { setUrlValue(data.url || ''); setIsEditingUrl(false) }
                }}
                placeholder="https://..."
                className="px-0.5 text-[10px] font-mono bg-transparent outline-none min-w-[100px] max-w-[220px] text-slate-800"
                autoFocus
              />
              <button onClick={saveUrl} className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded" title="⏎">
                <Check size={11} />
              </button>
              <button onClick={() => { setUrlValue(data.url || ''); setIsEditingUrl(false) }} className="p-0.5 text-slate-400 hover:bg-slate-50 rounded" title="Esc">
                <X size={11} />
              </button>
            </FloatingNodePanel>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-0.5">
          {data.url ? (
            <a
              href={sanitizeNodeUrl(data.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="nodrag text-xs font-medium hover:underline text-center max-w-[100px] line-clamp-3 break-words"
              style={{ color: '#3b82f6' }}
              title={data.url}
            >
              {data.name}
            </a>
          ) : (
            <span
              className="text-xs font-medium text-center max-w-[100px] line-clamp-3 break-words cursor-pointer"
              style={{ color: '#111111' }}
              onDoubleClick={() => setIsEditing(true)}
              title={data.name}
            >
              {data.name}
            </span>
          )}

          {/* Action buttons — always occupy their row (contents hidden until
              hover/select) so the node's measured height never changes and
              anchor points stay fixed */}
          <div className={`nodrag flex items-center gap-0.5 ${hovered || selected ? '' : 'invisible'}`}>
              <button
                onClick={() => { setUrlValue(data.url || ''); setIsEditingUrl(true) }}
                className={`p-0.5 rounded hover:bg-slate-100 transition-colors ${data.url ? 'text-blue-500' : 'text-slate-400'}`}
                title={data.url ? t('resources.dataflow.node.editLink', { url: data.url }) : t('resources.dataflow.node.addLink')}
              >
                <Link2 size={10} />
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="p-0.5 rounded hover:bg-slate-100 transition-colors text-slate-400"
                title={t('resources.dataflow.node.rename')}
              >
                <Pencil size={10} />
              </button>
              <button
                onClick={() => removeNode?.(id)}
                className="p-0.5 rounded hover:bg-red-100 transition-colors text-slate-400 hover:text-red-500"
                title={t('common.delete')}
              >
                <Trash2 size={10} />
              </button>
          </div>
        </div>
      )}

      {/* Style picker — rendered via portal to avoid React Flow pane deselection */}
      {selected && !isEditing && !isEditingUrl && containerRef.current && (
        <IconStylePanel
          iconColor={iconColor}
          iconFill={iconFill}
          iconStrokeWidth={iconStrokeWidth}
          onUpdate={(updates) => updateIconNode?.(id, updates)}
          anchorEl={containerRef.current}
        />
      )}
    </div>
  )
}

export default memo(IconNode)
