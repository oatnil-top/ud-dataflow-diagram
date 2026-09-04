import { memo, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { type NodeProps, type Node, NodeResizer, useViewport } from '@xyflow/react'
import { Pencil, Check, X, Trash2, Link2, Code2 } from 'lucide-react'
import type { GroupNodeData, GroupStylePreset } from '../../types'
import { useFlowStore } from '../../store/flowStoreContext'
import { sanitizeNodeUrl } from '../../utils/sanitizeUrl'
import NodeIcon from '../icons/NodeIcon'
import IconPicker from '../icons/IconPicker'
import { isImeComposing } from '../../utils/ime'
import { useMultiSelection } from '../../hooks/useMultiSelection'

type GroupNodeType = Node<GroupNodeData, 'group'>

// Style preset definitions
export interface StylePresetDef {
  id: GroupStylePreset
  label: string
  color: string
  borderColor: string
  borderWidth: number
  borderStyle: 'solid' | 'dashed' | 'dotted'
  rounded: boolean
  opacity: number
}

// Near-white fills with the hue carried by a 1px border alone — large colored
// surfaces fight each other when groups nest (color is a signal, not a surface).
// The title is bare text above the frame, no pill, for the same reason.
export const STYLE_PRESETS: StylePresetDef[] = [
  { id: 'cloud',    label: 'Cloud',    color: '#f8fbff', borderColor: '#60a5fa', borderWidth: 1, borderStyle: 'dashed', rounded: true,  opacity: 100 },
  { id: 'region',   label: 'Region',   color: '#f8f9ff', borderColor: '#818cf8', borderWidth: 1, borderStyle: 'solid',  rounded: true,  opacity: 100 },
  { id: 'network',  label: 'Network',  color: '#f6fdf8', borderColor: '#4ade80', borderWidth: 1, borderStyle: 'solid',  rounded: false, opacity: 100 },
  { id: 'security', label: 'Security', color: '#fffdf2', borderColor: '#eab308', borderWidth: 1, borderStyle: 'dashed', rounded: false, opacity: 100 },
  { id: 'cluster',  label: 'Cluster',  color: '#fbf9ff', borderColor: '#a78bfa', borderWidth: 1, borderStyle: 'solid',  rounded: true,  opacity: 100 },
  { id: 'service',  label: 'Service',  color: '#fafafa', borderColor: '#94a3b8', borderWidth: 1, borderStyle: 'solid',  rounded: true,  opacity: 100 },
  { id: 'danger',   label: 'Danger',   color: '#fff8f8', borderColor: '#f87171', borderWidth: 1, borderStyle: 'solid',  rounded: false, opacity: 100 },
  { id: 'subtle',   label: 'Subtle',   color: '#ffffff', borderColor: '#e5e5e5', borderWidth: 1, borderStyle: 'dotted', rounded: true,  opacity: 100 },
]

const STYLE_PRESET_MAP = new Map(STYLE_PRESETS.map(p => [p.id, p]))

// Depth-based default presets (when no style is explicitly set)
const DEPTH_PRESETS: GroupStylePreset[] = ['cloud', 'region', 'network', 'service', 'subtle']

function resolveGroupStyle(data: GroupNodeData, depth: number): {
  bgColor: string
  borderColor: string
  borderWidth: number
  borderStyle: string
  borderRadius: string
  opacity: number
} {
  // Start from preset if specified, or depth-based default
  const presetId = data.stylePreset || DEPTH_PRESETS[Math.min(depth, DEPTH_PRESETS.length - 1)]
  const preset = STYLE_PRESET_MAP.get(presetId) || STYLE_PRESETS[0]

  // Individual properties override preset defaults
  const bgColor = data.color || preset.color
  const borderColor = data.borderColor || preset.borderColor
  const borderWidth = data.borderWidth ?? preset.borderWidth
  const borderStyle = data.borderStyle || preset.borderStyle
  const rounded = data.rounded ?? preset.rounded
  const opacity = data.opacity ?? preset.opacity

  return {
    bgColor,
    borderColor,
    borderWidth,
    borderStyle,
    borderRadius: rounded ? '12px' : '4px',
    opacity: opacity / 100,
  }
}

function GroupNode({ id, data, selected, positionAbsoluteY }: NodeProps<GroupNodeType>) {
  // Inline preset strip, same rule as FloatingNodePanel: hidden under multi-selection
  const multiSelection = useMultiSelection()
  const { t } = useTranslation()
  const flowStore = useFlowStore()
  const updateGroupNode = flowStore((state) => state.updateGroupNode)
  const updateNodeUrl = flowStore((state) => state.updateNodeUrl)
  const removeNode = flowStore((state) => state.removeNode)
  const setRawEditNode = flowStore((state) => state.setRawEditNode)
  const { y: vpY, zoom } = useViewport()
  const containerRef = useRef<HTMLDivElement>(null)

  const [isEditing, setIsEditing] = useState(false)
  const [nameValue, setNameValue] = useState(data.name)
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const [urlValue, setUrlValue] = useState(data.url || '')
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false)

  // Nesting depth by walking the parentId chain. The selector returns a
  // primitive so this group only re-renders when its own depth changes —
  // subscribing to the whole nodes array re-rendered every group on every
  // drag frame of any node.
  const depth = flowStore((state) => {
    let d = 0
    const byId = new Map(state.nodes.map((n) => [n.id, n]))
    let parentId = byId.get(id)?.parentId
    const seen = new Set<string>()
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId)
      const parent = byId.get(parentId)
      if (parent?.type === 'group') d++
      parentId = parent?.parentId
    }
    return d
  })

  // Resolve effective style from preset + overrides + depth
  const style = resolveGroupStyle(data, depth)
  const effectiveBorderColor = selected ? '#3b82f6' : style.borderColor

  // Scale title inversely with zoom for readability at low zoom, capped at 1.75x
  const titleScale = Math.min(Math.max(1, 1 / zoom), 1.75)

  // Title sits flush above the group box; sticks when scrolled.
  // `titleScale` grows the box downward from `titleTop` (transformOrigin is top
  // left), so every offset here is in RENDERED height — using the unscaled
  // offsetHeight let the frame's top border cut through the text at low zoom,
  // which the old opaque pill happened to hide and bare text does not.
  const titleRef = useRef<HTMLDivElement>(null)
  const titleHeight = (titleRef.current?.offsetHeight ?? 24) * titleScale
  const screenY = positionAbsoluteY * zoom + vpY
  const containerHeight = containerRef.current?.offsetHeight ?? 100
  const defaultTop = -titleHeight
  const stickyTop = -screenY / zoom
  const maxTop = containerHeight - titleHeight
  const titleTop = Math.min(Math.max(defaultTop, stickyTop), maxTop)
  const isSticky = titleTop > defaultTop

  const handleSave = useCallback(() => {
    const trimmed = nameValue.trim()
    if (trimmed && trimmed !== data.name) {
      updateGroupNode?.(id, { name: trimmed })
    } else {
      setNameValue(data.name)
    }
    setIsEditing(false)
  }, [id, nameValue, data.name, updateGroupNode])

  const handlePresetChange = useCallback((presetId: GroupStylePreset) => {
    // Apply preset and clear individual overrides so preset takes full effect
    updateGroupNode?.(id, {
      stylePreset: presetId,
      color: undefined,
      borderColor: undefined,
      borderWidth: undefined,
      borderStyle: undefined,
      opacity: undefined,
      rounded: undefined,
    })
  }, [id, updateGroupNode])

  const handleIconSelect = useCallback((iconId: string) => {
    updateGroupNode?.(id, { icon: iconId })
  }, [id, updateGroupNode])

  const handleRemoveIcon = useCallback(() => {
    updateGroupNode?.(id, { icon: undefined })
  }, [id, updateGroupNode])

  return (
    <div
      ref={containerRef}
      className="w-full h-full group relative overflow-visible"
      style={{
        backgroundColor: style.bgColor,
        opacity: style.opacity,
        border: `${style.borderWidth}px ${style.borderStyle} ${effectiveBorderColor}`,
        borderRadius: style.borderRadius,
        minWidth: 200,
        minHeight: 100,
      }}
    >
      <NodeResizer
        minWidth={200}
        minHeight={100}
        isVisible={selected}
        lineClassName="!border-blue-400"
        handleClassName="!w-2.5 !h-2.5 !bg-blue-400 !border-2 !border-white !rounded"
      />

      {/* Label floats above the top-left corner; sticks when scrolled.
          Bare text, no pill: the frame already carries the group's hue in its
          border, so a second tinted, bordered chip on top of it was a container
          drawn around something that needed no container — the flat/minimal rule
          in CLAUDE.md. Padding is kept so the text clears the frame's corner. */}
      <div
        ref={titleRef}
        className="absolute left-0 flex items-center gap-1.5 px-1.5 py-0.5"
        style={{
          top: titleTop,
          transform: titleScale > 1 ? `scale(${titleScale})` : undefined,
          transformOrigin: 'top left',
          ...(isSticky ? { zIndex: 1 } : {}),
        }}
      >
        {isEditing ? (
          <div className="flex items-center gap-1 bg-white/90 rounded px-1 py-0.5 shadow-sm">
            <input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isImeComposing(e)) handleSave()
                if (e.key === 'Escape') { setNameValue(data.name); setIsEditing(false) }
              }}
              size={Math.max(nameValue.length, 8)}
              onFocus={(e) => e.target.select()}
              className="px-1.5 py-0.5 text-xs font-medium rounded border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-[96px] max-w-[240px]"
              autoFocus
              placeholder={t('resources.dataflow.node.groupNamePlaceholder')}
            />
            <button onClick={handleSave} className="p-0.5 text-emerald-600 hover:bg-emerald-100 rounded">
              <Check size={12} />
            </button>
            <button onClick={() => { setNameValue(data.name); setIsEditing(false) }} className="p-0.5 text-slate-400 hover:bg-slate-100 rounded">
              <X size={12} />
            </button>
          </div>
        ) : isEditingUrl ? (
          <div className="flex items-center gap-1 bg-white/90 rounded px-1 py-0.5 shadow-sm">
            <input
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isImeComposing(e)) { updateNodeUrl?.(id, urlValue.trim() || undefined); setIsEditingUrl(false) }
                if (e.key === 'Escape') { setUrlValue(data.url || ''); setIsEditingUrl(false) }
              }}
              placeholder="https://..."
              size={Math.max(urlValue.length, 16)}
              className="px-1.5 py-0.5 text-xs rounded border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-[160px] max-w-[280px] font-mono"
              autoFocus
            />
            <button onClick={() => { updateNodeUrl?.(id, urlValue.trim() || undefined); setIsEditingUrl(false) }} className="p-0.5 text-emerald-600 hover:bg-emerald-100 rounded">
              <Check size={12} />
            </button>
            <button onClick={() => { setUrlValue(data.url || ''); setIsEditingUrl(false) }} className="p-0.5 text-slate-400 hover:bg-slate-100 rounded">
              <X size={12} />
            </button>
          </div>
        ) : (
          <>
            {/* Icon — click to change */}
            <div className="relative nodrag">
              {data.icon ? (
                <button
                  onClick={() => setIsIconPickerOpen(!isIconPickerOpen)}
                  onContextMenu={(e) => { e.preventDefault(); handleRemoveIcon() }}
                  className="p-0.5 rounded transition-colors hover:bg-black/5"
                  title={t('resources.dataflow.node.changeIcon')}
                >
                  <NodeIcon iconId={data.icon} size={14} style={{ color: '#475569' }} />
                </button>
              ) : (
                <button
                  onClick={() => setIsIconPickerOpen(!isIconPickerOpen)}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity hover:bg-black/5"
                  title={t('resources.dataflow.node.addIconTitle')}
                  style={{ color: '#94a3b8', fontSize: 10 }}
                >
                  +
                </button>
              )}
              {isIconPickerOpen && (
                <div className="absolute top-full left-0 mt-1 z-50">
                  <IconPicker
                    currentIcon={data.icon}
                    onSelect={handleIconSelect}
                    onClose={() => setIsIconPickerOpen(false)}
                  />
                </div>
              )}
            </div>

            {data.url ? (
              <a
                href={sanitizeNodeUrl(data.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="nodrag text-[13px] font-medium hover:underline select-none"
                style={{ color: '#3b82f6' }}
                title={data.url}
              >
                {data.name}
              </a>
            ) : (
              <span
                className="text-[13px] font-medium cursor-pointer select-none"
                style={{ color: '#111111' }}
                onDoubleClick={() => setIsEditing(true)}
              >
                {data.name}
              </span>
            )}
            <button
              onClick={() => setRawEditNode?.(id)}
              className="p-0.5 rounded hover:bg-black/5 transition-colors opacity-0 group-hover:opacity-100"
              style={{ color: '#64748b' }}
              title={t('resources.dataflow.node.rawEditor')}
            >
              <Code2 size={12} />
            </button>
            <button
              onClick={() => { setUrlValue(data.url || ''); setIsEditingUrl(true) }}
              className={`p-0.5 rounded hover:bg-black/5 transition-colors opacity-0 group-hover:opacity-100`}
              style={{ color: data.url ? '#3b82f6' : '#94a3b8' }}
              title={data.url ? t('resources.dataflow.node.editLink', { url: data.url }) : t('resources.dataflow.node.addLink')}
            >
              <Link2 size={12} />
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className="p-0.5 rounded hover:bg-black/5 transition-colors opacity-0 group-hover:opacity-100"
              style={{ color: '#64748b' }}
              title={t('common.edit')}
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => removeNode?.(id)}
              className="p-0.5 rounded hover:bg-red-100 transition-colors opacity-0 group-hover:opacity-100"
              style={{ color: '#94a3b8' }}
              title={t('resources.dataflow.node.deleteGroup')}
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>

      {/* Style preset picker — show when selected (and not amid a multi-selection) */}
      {selected && !multiSelection && (
        <div className="absolute bottom-1 left-2 flex items-center gap-1">
          {STYLE_PRESETS.map((preset) => {
            const isActive = data.stylePreset === preset.id
              || (!data.stylePreset && !data.color && preset.id === DEPTH_PRESETS[Math.min(depth, DEPTH_PRESETS.length - 1)])
            return (
              <button
                key={preset.id}
                onClick={() => handlePresetChange(preset.id)}
                className={`h-4 px-1.5 text-[8px] font-medium uppercase tracking-wide rounded transition-transform hover:scale-110 ${
                  isActive ? 'ring-1 ring-slate-600 scale-105' : ''
                }`}
                style={{
                  backgroundColor: preset.color,
                  border: `${preset.borderWidth}px ${preset.borderStyle} ${preset.borderColor}`,
                  borderRadius: preset.rounded ? '4px' : '2px',
                  color: '#475569',
                  lineHeight: '1',
                }}
                title={preset.label}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

export default memo(GroupNode)
