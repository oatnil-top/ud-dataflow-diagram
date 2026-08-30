import { useState, useCallback, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X, ChevronDown, ChevronRight, StickyNote, FileJson, Hexagon } from 'lucide-react'
import { ICON_REGISTRY, PROVIDERS, type IconPreset } from './icon-registry'
import NodeIcon from './NodeIcon'
import type { GroupStylePreset } from '../../types'
import { STYLE_PRESETS, type StylePresetDef } from '../nodes/GroupNode'

// Group element presets — these create group nodes with specific style + icon
interface GroupPreset {
  name: string
  icon?: string
  stylePreset: GroupStylePreset
  provider: string
  category: string
  keywords: string[]
}

const GROUP_PRESETS: GroupPreset[] = [
  // General groups
  { name: 'Cloud',          icon: 'lucide:Cloud',    stylePreset: 'cloud',    provider: 'general', category: 'Groups', keywords: ['cloud', 'provider'] },
  { name: 'Region',         icon: 'lucide:Globe',    stylePreset: 'region',   provider: 'general', category: 'Groups', keywords: ['region', 'zone'] },
  { name: 'Network',        icon: 'lucide:Network',  stylePreset: 'network',  provider: 'general', category: 'Groups', keywords: ['network', 'vpc', 'vnet'] },
  { name: 'Security Zone',  icon: 'lucide:Shield',   stylePreset: 'security', provider: 'general', category: 'Groups', keywords: ['security', 'dmz', 'firewall'] },
  { name: 'Cluster',        icon: 'lucide:Container', stylePreset: 'cluster', provider: 'general', category: 'Groups', keywords: ['cluster', 'k8s', 'namespace'] },
  { name: 'Service',        icon: 'lucide:Boxes',    stylePreset: 'service',  provider: 'general', category: 'Groups', keywords: ['service', 'domain', 'module'] },
  { name: 'Group',                                   stylePreset: 'subtle',   provider: 'general', category: 'Groups', keywords: ['group', 'container'] },

  // K8s groups
  { name: 'Cluster',        icon: 'lucide:Container', stylePreset: 'cluster', provider: 'k8s', category: 'Groups', keywords: ['cluster', 'kubernetes', 'k8s'] },
  { name: 'Namespace',      icon: 'lucide:Boxes',     stylePreset: 'region',  provider: 'k8s', category: 'Groups', keywords: ['namespace', 'ns'] },
  { name: 'Node',           icon: 'lucide:Server',    stylePreset: 'subtle',  provider: 'k8s', category: 'Groups', keywords: ['node', 'worker'] },

  // AWS groups
  { name: 'AWS Account',    icon: 'lucide:Cloud',    stylePreset: 'cloud',    provider: 'aws', category: 'Groups', keywords: ['account', 'aws'] },
  { name: 'VPC',            icon: 'lucide:Network',  stylePreset: 'network',  provider: 'aws', category: 'Groups', keywords: ['vpc', 'virtual private cloud'] },
  { name: 'Availability Zone', icon: 'lucide:Globe', stylePreset: 'region',   provider: 'aws', category: 'Groups', keywords: ['az', 'availability zone'] },
  { name: 'Public Subnet',  icon: 'lucide:Globe',    stylePreset: 'subtle',   provider: 'aws', category: 'Groups', keywords: ['subnet', 'public'] },
  { name: 'Private Subnet', icon: 'lucide:Shield',   stylePreset: 'security', provider: 'aws', category: 'Groups', keywords: ['subnet', 'private'] },
  { name: 'Security Group', icon: 'lucide:Shield',   stylePreset: 'security', provider: 'aws', category: 'Groups', keywords: ['security group', 'sg', 'firewall'] },
  { name: 'ECS Cluster',    icon: 'lucide:Container', stylePreset: 'cluster', provider: 'aws', category: 'Groups', keywords: ['ecs', 'cluster'] },
  { name: 'EKS Cluster',    icon: 'lucide:Container', stylePreset: 'cluster', provider: 'aws', category: 'Groups', keywords: ['eks', 'kubernetes'] },

  // Azure groups
  { name: 'Subscription',   icon: 'lucide:Cloud',    stylePreset: 'cloud',    provider: 'azure', category: 'Groups', keywords: ['subscription', 'azure'] },
  { name: 'Resource Group', icon: 'lucide:Boxes',    stylePreset: 'region',   provider: 'azure', category: 'Groups', keywords: ['resource group', 'rg'] },
  { name: 'VNet',           icon: 'lucide:Network',  stylePreset: 'network',  provider: 'azure', category: 'Groups', keywords: ['vnet', 'virtual network'] },
  { name: 'Subnet',         icon: 'lucide:Network',  stylePreset: 'subtle',   provider: 'azure', category: 'Groups', keywords: ['subnet'] },
  { name: 'NSG',            icon: 'lucide:Shield',   stylePreset: 'security', provider: 'azure', category: 'Groups', keywords: ['nsg', 'network security group'] },
  { name: 'AKS Cluster',    icon: 'lucide:Container', stylePreset: 'cluster', provider: 'azure', category: 'Groups', keywords: ['aks', 'kubernetes'] },
  { name: 'App Service Plan', icon: 'lucide:Server', stylePreset: 'service',  provider: 'azure', category: 'Groups', keywords: ['app service plan', 'asp'] },
]

interface IconSidebarProps {
  onAddIcon: (name: string, icon: string) => void
  onAddGroup: (name: string, icon?: string, stylePreset?: string) => void
  onAddNode: () => void
  onAddNote: () => void
  onAddShape?: (shape?: string) => void
  isOpen: boolean
  onToggle: () => void
}

function IconSidebar({ onAddIcon, onAddGroup, onAddNode, onAddNote, onAddShape, isOpen, onToggle }: IconSidebarProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const handleIconClick = useCallback((icon: IconPreset) => {
    onAddIcon(icon.label, icon.id)
  }, [onAddIcon])

  const handleGroupClick = useCallback((group: GroupPreset) => {
    onAddGroup(group.name, group.icon, group.stylePreset)
  }, [onAddGroup])

  // Filter by search
  const query = search.toLowerCase().trim()
  const filteredIcons = query
    ? ICON_REGISTRY.filter(icon =>
        icon.label.toLowerCase().includes(query)
        || icon.keywords.some(k => k.includes(query))
        || icon.category.toLowerCase().includes(query)
        || icon.provider.toLowerCase().includes(query)
      )
    : ICON_REGISTRY

  const filteredGroups = query
    ? GROUP_PRESETS.filter(g =>
        g.name.toLowerCase().includes(query)
        || g.keywords.some(k => k.includes(query))
        || g.provider.toLowerCase().includes(query)
      )
    : GROUP_PRESETS

  // Group icons by provider → category
  const iconsByProvider = new Map<string, Map<string, IconPreset[]>>()
  for (const icon of filteredIcons) {
    if (!iconsByProvider.has(icon.provider)) iconsByProvider.set(icon.provider, new Map())
    const catMap = iconsByProvider.get(icon.provider)!
    if (!catMap.has(icon.category)) catMap.set(icon.category, [])
    catMap.get(icon.category)!.push(icon)
  }

  // Group group-presets by provider
  const groupsByProvider = new Map<string, GroupPreset[]>()
  for (const g of filteredGroups) {
    if (!groupsByProvider.has(g.provider)) groupsByProvider.set(g.provider, [])
    groupsByProvider.get(g.provider)!.push(g)
  }

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="absolute top-14 left-2 z-10 p-2 rounded-lg transition-colors hover:bg-slate-100"
        style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
        title={t('resources.dataflow.elements.showPanel')}
      >
        <NodeIcon iconId="lucide:Server" size={16} style={{ color: '#475569' }} />
      </button>
    )
  }

  // Helper to render a style preview swatch for a group preset
  function GroupSwatch({ preset }: { preset: StylePresetDef }) {
    return (
      <span
        className="inline-block w-4 h-3 shrink-0"
        style={{
          backgroundColor: preset.color,
          border: `${preset.borderWidth}px ${preset.borderStyle} ${preset.borderColor}`,
          borderRadius: preset.rounded ? 3 : 1,
        }}
      />
    )
  }

  return (
    <div
      className="absolute top-14 left-2 z-10 flex flex-col rounded-lg overflow-hidden"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        width: 220,
        maxHeight: 'calc(100vh - 120px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b" style={{ borderColor: '#e2e8f0' }}>
        <span className="text-xs font-medium" style={{ color: '#475569' }}>{t('resources.dataflow.elements.title')}</span>
        <button onClick={onToggle} className="p-0.5 rounded hover:bg-slate-100" title={t('resources.dataflow.elements.closePanel')}>
          <X size={12} style={{ color: '#94a3b8' }} />
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b" style={{ borderColor: '#e2e8f0' }}>
        <Search size={12} style={{ color: '#94a3b8', flexShrink: 0 }} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('resources.dataflow.elements.searchPlaceholder')}
          className="flex-1 text-xs bg-transparent outline-none"
          style={{ color: '#334155' }}
        />
        {search && (
          <button onClick={() => setSearch('')} className="p-0.5 rounded hover:bg-slate-100">
            <X size={10} style={{ color: '#94a3b8' }} />
          </button>
        )}
      </div>

      {/* Scrollable content */}
      <div className="overflow-y-auto flex-1 px-1 py-1">

        {/* Quick add: Node + Note */}
        {!query && (
          <div className="mb-1.5 px-1">
            <div className="flex gap-1">
              <button
                onClick={onAddNode}
                className="flex-1 flex items-center gap-1 px-2 py-1 rounded text-[10px] hover:bg-slate-100 transition-colors"
                style={{ color: '#475569' }}
                title={t('resources.dataflow.elements.addDataNode')}
              >
                <FileJson size={12} style={{ color: '#64748b' }} />
                {t('resources.dataflow.elements.dataNode')}
              </button>
              <button
                onClick={onAddNote}
                className="flex-1 flex items-center gap-1 px-2 py-1 rounded text-[10px] hover:bg-amber-50 transition-colors"
                style={{ color: '#d97706' }}
                title={t('resources.dataflow.elements.addNote')}
              >
                <StickyNote size={12} />
                {t('resources.dataflow.elements.note')}
              </button>
              {onAddShape && (
                <button
                  onClick={() => onAddShape()}
                  className="flex-1 flex items-center gap-1 px-2 py-1 rounded text-[10px] hover:bg-indigo-50 transition-colors"
                  style={{ color: '#6366f1' }}
                  title={t('resources.dataflow.elements.addShape')}
                >
                  <Hexagon size={12} />
                  {t('resources.dataflow.elements.shape')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Per-provider sections */}
        {PROVIDERS.filter(p => iconsByProvider.has(p.id) || groupsByProvider.has(p.id)).map(provider => {
          const providerKey = `provider:${provider.id}`
          const isProviderCollapsed = collapsedSections.has(providerKey)
          const categories = iconsByProvider.get(provider.id)
          const groups = groupsByProvider.get(provider.id)

          return (
            <div key={provider.id} className="mb-1">
              {/* Provider header */}
              <button
                onClick={() => toggleSection(providerKey)}
                className="flex items-center gap-1 w-full px-1 py-1 rounded hover:bg-slate-50 text-left"
              >
                {isProviderCollapsed
                  ? <ChevronRight size={11} style={{ color: provider.color }} />
                  : <ChevronDown size={11} style={{ color: provider.color }} />
                }
                <span className="text-[11px] font-semibold" style={{ color: provider.color }}>
                  {provider.label}
                </span>
              </button>

              {!isProviderCollapsed && (
                <div className="ml-1">
                  {/* Groups section for this provider */}
                  {groups && groups.length > 0 && (
                    <div className="mb-0.5">
                      <button
                        onClick={() => toggleSection(`${provider.id}:Groups`)}
                        className="flex items-center gap-1 w-full px-1 py-0.5 rounded hover:bg-slate-50 text-left"
                      >
                        {collapsedSections.has(`${provider.id}:Groups`)
                          ? <ChevronRight size={9} style={{ color: '#94a3b8' }} />
                          : <ChevronDown size={9} style={{ color: '#94a3b8' }} />
                        }
                        <span className="text-[9px] font-medium uppercase tracking-wider" style={{ color: '#94a3b8' }}>
                          {t('resources.dataflow.elements.groups')}
                        </span>
                      </button>
                      {!collapsedSections.has(`${provider.id}:Groups`) && (
                        <div className="flex flex-col gap-0.5 mt-0.5 ml-2">
                          {groups.map(group => {
                            const presetDef = STYLE_PRESETS.find(p => p.id === group.stylePreset)
                            return (
                              <button
                                key={`${provider.id}:${group.name}`}
                                onClick={() => handleGroupClick(group)}
                                className="flex items-center gap-1.5 px-1.5 py-1 rounded transition-colors hover:bg-slate-100 text-left"
                                title={t('resources.dataflow.elements.addGroup', { name: group.name })}
                              >
                                {presetDef && <GroupSwatch preset={presetDef} />}
                                {group.icon && <NodeIcon iconId={group.icon} size={12} style={{ color: '#64748b' }} />}
                                <span className="text-[9px] truncate" style={{ color: '#475569' }}>
                                  {group.name}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Icon categories for this provider */}
                  {categories && [...categories.entries()].map(([category, icons]) => {
                    const catKey = `${provider.id}:${category}`
                    const isCatCollapsed = collapsedSections.has(catKey)

                    return (
                      <div key={catKey} className="mb-0.5">
                        <button
                          onClick={() => toggleSection(catKey)}
                          className="flex items-center gap-1 w-full px-1 py-0.5 rounded hover:bg-slate-50 text-left"
                        >
                          {isCatCollapsed
                            ? <ChevronRight size={9} style={{ color: '#94a3b8' }} />
                            : <ChevronDown size={9} style={{ color: '#94a3b8' }} />
                          }
                          <span className="text-[9px] font-medium uppercase tracking-wider" style={{ color: '#94a3b8' }}>
                            {category}
                          </span>
                        </button>

                        {!isCatCollapsed && (
                          <div className="grid grid-cols-4 gap-0.5 mt-0.5 ml-2">
                            {icons.map(icon => (
                              <button
                                key={icon.id}
                                onClick={() => handleIconClick(icon)}
                                className="p-1 rounded transition-colors hover:bg-slate-100 flex flex-col items-center gap-0.5"
                                title={t('resources.dataflow.elements.addIcon', { label: icon.label })}
                              >
                                <NodeIcon iconId={icon.id} size={22} style={{ color: icon.tint || '#475569' }} />
                                <span className="text-[7px] leading-tight truncate w-full text-center" style={{ color: '#94a3b8' }}>
                                  {icon.label}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default memo(IconSidebar)
