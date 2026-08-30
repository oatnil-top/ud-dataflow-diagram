import { useState, useRef, useEffect, useCallback, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Search } from 'lucide-react'
import { ICON_REGISTRY, ALL_CATEGORIES, type IconPreset } from './icon-registry'
import NodeIcon from './NodeIcon'

interface IconPickerProps {
  currentIcon?: string
  onSelect: (iconId: string) => void
  onClose: () => void
}

function IconPicker({ currentIcon, onSelect, onClose }: IconPickerProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus search on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as HTMLElement)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSelect = useCallback((iconId: string) => {
    onSelect(iconId)
    onClose()
  }, [onSelect, onClose])

  // Filter icons by search
  const query = search.toLowerCase().trim()
  const filtered = query
    ? ICON_REGISTRY.filter(icon =>
        icon.label.toLowerCase().includes(query)
        || icon.keywords.some(k => k.includes(query))
        || icon.category.toLowerCase().includes(query)
      )
    : ICON_REGISTRY

  // Group by category
  const grouped = new Map<string, IconPreset[]>()
  for (const icon of filtered) {
    const list = grouped.get(icon.category) || []
    list.push(icon)
    grouped.set(icon.category, list)
  }

  return (
    <div
      ref={containerRef}
      className="nodrag nowheel rounded-lg shadow-xl overflow-hidden"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        width: 260,
        maxHeight: 360,
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Search bar */}
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-b" style={{ borderColor: '#e2e8f0' }}>
        <Search size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('resources.dataflow.iconPicker.searchPlaceholder')}
          className="flex-1 text-xs bg-transparent outline-none"
          style={{ color: '#334155' }}
        />
        {search && (
          <button onClick={() => setSearch('')} className="p-0.5 rounded hover:bg-slate-100">
            <X size={12} style={{ color: '#94a3b8' }} />
          </button>
        )}
      </div>

      {/* Icon grid */}
      <div className="overflow-y-auto p-2" style={{ maxHeight: 300 }}>
        {grouped.size === 0 && (
          <div className="text-xs text-center py-4" style={{ color: '#94a3b8' }}>
            {t('resources.dataflow.iconPicker.noIcons')}
          </div>
        )}
        {ALL_CATEGORIES.filter(cat => grouped.has(cat)).map(category => (
          <div key={category} className="mb-2 last:mb-0">
            <div className="text-[10px] font-medium uppercase tracking-wider mb-1 px-0.5" style={{ color: '#94a3b8' }}>
              {category}
            </div>
            <div className="grid grid-cols-6 gap-0.5">
              {grouped.get(category)!.map(icon => (
                <button
                  key={icon.id}
                  onClick={() => handleSelect(icon.id)}
                  className={`p-2 rounded transition-colors flex items-center justify-center ${
                    icon.id === currentIcon
                      ? 'bg-blue-100 ring-1 ring-blue-400'
                      : 'hover:bg-slate-100'
                  }`}
                  title={icon.label}
                >
                  <NodeIcon iconId={icon.id} size={18} style={{ color: '#475569' }} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default memo(IconPicker)
