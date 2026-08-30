import { memo } from 'react'
import {
  User, Users, Building2, Contact,
  Server, Cpu, Monitor, Laptop, Smartphone, Tablet, Terminal, Container,
  Database, HardDrive, Archive, FolderOpen, MemoryStick,
  Globe, Network, Wifi, Router, Cable,
  Cloud, CloudCog, CloudUpload, CloudDownload,
  Shield, Lock, Key, ShieldCheck, Fingerprint,
  Mail, MessageSquare, Bell, Send,
  Webhook, Blocks, Workflow, Plug, GitBranch, RefreshCcw,
  Layers, Boxes, Cog, Zap, BarChart3, FileText, Clock, Sparkles,
  type LucideProps,
} from 'lucide-react'
import { ICON_REGISTRY_MAP } from './icon-registry'

// Static map — guarantees tree-shaking and avoids runtime lookup issues
const LUCIDE_ICONS: Record<string, React.ComponentType<LucideProps>> = {
  User, Users, Building2, Contact,
  Server, Cpu, Monitor, Laptop, Smartphone, Tablet, Terminal, Container,
  Database, HardDrive, Archive, FolderOpen, MemoryStick,
  Globe, Network, Wifi, Router, Cable,
  Cloud, CloudCog, CloudUpload, CloudDownload,
  Shield, Lock, Key, ShieldCheck, Fingerprint,
  Mail, MessageSquare, Bell, Send,
  Webhook, Blocks, Workflow, Plug, GitBranch, RefreshCcw,
  Layers, Boxes, Cog, Zap, BarChart3, FileText, Clock, Sparkles,
}

interface NodeIconProps {
  iconId: string
  size?: number
  className?: string
  style?: React.CSSProperties
  fill?: string          // SVG fill color (default: 'none' for outline-only icons)
  strokeWidth?: number   // SVG stroke width (default: 2)
}

function NodeIcon({ iconId, size = 14, className, style, fill, strokeWidth }: NodeIconProps) {
  if (!iconId) return null

  const colonIdx = iconId.indexOf(':')
  if (colonIdx === -1) return null

  const provider = iconId.slice(0, colonIdx)
  const name = iconId.slice(colonIdx + 1)

  // Sequence number icons — rendered as circled numbers
  if (provider === 'seq') {
    const strokeColor = (style?.color as string) || '#6366F1'
    const fillColor = fill || strokeColor
    const textColor = fillColor === 'none' ? strokeColor : '#fff'
    return (
      <span
        className={`inline-flex items-center justify-center font-bold select-none ${className || ''}`}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: fillColor === 'none' ? 'transparent' : fillColor,
          border: fillColor === 'none' ? `${Math.max(1, (strokeWidth ?? 1) * 0.8)}px solid ${strokeColor}` : 'none',
          color: textColor,
          fontSize: size * (name.length > 1 ? 0.45 : 0.55),
          lineHeight: 1,
        }}
      >
        {name}
      </span>
    )
  }

  // Pure Lucide icons (general)
  if (provider === 'lucide') {
    const Icon = LUCIDE_ICONS[name]
    if (!Icon) return null
    // Use explicit Lucide props: color sets stroke, fill sets fill, strokeWidth sets weight
    const strokeColor = style?.color as string | undefined
    return <Icon size={size} className={className} color={strokeColor} fill={fill || 'none'} strokeWidth={strokeWidth ?? 1} />
  }

  // Cloud provider icons: Lucide base + badge
  const preset = ICON_REGISTRY_MAP.get(iconId)
  if (preset?.lucideBase) {
    const BaseIcon = LUCIDE_ICONS[preset.lucideBase]
    if (!BaseIcon) return null

    const userColor = style?.color as string | undefined
    const effectiveColor = userColor || preset.tint || '#475569'
    const badgeText = preset.badge || ''
    const iconSize = size
    const badgeFontSize = Math.max(5, iconSize * 0.28)

    return (
      <span className={`relative inline-flex items-center justify-center ${className || ''}`} style={{ width: iconSize, height: iconSize }}>
        <BaseIcon size={iconSize * 0.75} color={effectiveColor} fill={fill || 'none'} strokeWidth={strokeWidth ?? 1} />
        {badgeText && (
          <span
            className="absolute font-bold leading-none"
            style={{
              bottom: -1,
              right: -2,
              fontSize: badgeFontSize,
              color: '#fff',
              backgroundColor: effectiveColor,
              borderRadius: 2,
              padding: `0 ${Math.max(1, badgeFontSize * 0.2)}px`,
              lineHeight: `${badgeFontSize + 3}px`,
              letterSpacing: '-0.02em',
            }}
          >
            {badgeText}
          </span>
        )}
      </span>
    )
  }

  return null
}

export default memo(NodeIcon)
